const {
  User,
  Group,
  GroupMember,
  GroupMessage,
  GroupMessageReaction,
  Contact,
  HiddenGroupMessage,
  UnreadCount, 
} = require("../models/associations");
const { Op } = require("sequelize");
const sequelize = require("../utilities/sql");
const createGroup = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const creatorId = req.user.id;
    // Destructure 'members' array from the request body
    const { name, members } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Group name cannot be empty." });
    }
    // Frontend validation ensures members array is not empty
    if (!Array.isArray(members) || members.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one member must be selected." });
    }

    const newGroup = await Group.create(
      {
        name: name.trim(),
        createdBy: creatorId,
      },
      { transaction }
    );

    // Add creator as an admin
    await GroupMember.create(
      {
        groupId: newGroup.id,
        userId: creatorId,
        role: "admin",
      },
      { transaction }
    );

    // Prepare member data for bulk insertion
    const memberData = members.map((memberId) => ({
      groupId: newGroup.id,
      userId: parseInt(memberId, 10), // Ensure IDs are integers
      role: "member",
    }));

    // Add the rest of the members
    if (memberData.length > 0) {
      await GroupMember.bulkCreate(memberData, { transaction });
    }

    await transaction.commit();

    // Frontend expects the new group object directly as the response
    res.status(201).json(newGroup);
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating group:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
const getMyGroups = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const userWithGroups = await User.findByPk(currentUserId, {
      include: [
        {
          model: Group,
          as: "groups",
          through: { attributes: [] },
        },
      ],
      attributes: [],
    });

    if (!userWithGroups) {
      return res.status(404).json({ message: "User not found." });
    }

    // Send the array of groups directly
    res.status(200).json(userWithGroups.groups || []);
  } catch (error) {
    console.error("Error fetching user's groups:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
const getGroupDetails = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);

    // 1. Fetch the group and include its members and creator details
    const group = await Group.findByPk(groupId, {
      include: [
        {
          model: User,
          as: "members",
          attributes: ["id", "name", "img", "status"],
          // Through options allow us to get data from the join table (GroupMember)
          through: {
            attributes: ["role", "createdAt"], // Get the role and join date for each member
          },
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "name"],
        },
      ],
    });

    // 2. Handle case where group does not exist
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // 3. Security Check: If the group is private, ensure the user is a member
    const isMember = group.members.some(
      (member) => member.id === currentUserId
    );
    if (!group.isPublic && !isMember) {
      return res.status(403).json({
        message: "You are not authorized to view this group's details.",
      });
    }

    res.status(200).json({ group });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
// FINAL and COMPLETE updateGroupDetails function

const updateGroupDetails = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);

    // Destructure ALL possible fields from the request body
    const {
      name,
      description,
      img,
      isPublic,
      inviteSetting,
      messagingSetting,
    } = req.body;

    // 1. Find the group member record to check the user's role
    const member = await GroupMember.findOne({
      where: {
        groupId: groupId,
        userId: currentUserId,
      },
    });

    // 2. Authorization Check: Ensure the user is an admin of the group
    if (!member || member.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You must be an admin to update this group." });
    }

    // 3. Find the group to be updated
    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // 4. Update only the fields that were provided in the request body.
    // This makes the function flexible to any combination of inputs.
    if (name !== undefined) group.name = name.trim();
    if (description !== undefined) group.description = description.trim();
    if (img !== undefined) group.img = img.trim(); // Now compatible with admin.js
    if (isPublic !== undefined) group.isPublic = isPublic;
    if (inviteSetting !== undefined) group.inviteSetting = inviteSetting;
    if (messagingSetting !== undefined)
      group.messagingSetting = messagingSetting;

    // 5. Save the changes to the database
    await group.save();

    // 6. Send a success response with the updated group data
    res
      .status(200)
      .json({ message: "Group details updated successfully.", group });
  } catch (error) {
    // Handle potential validation errors from invalid enum values for settings
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        message: `Validation error: ${error.errors
          .map((e) => e.message)
          .join(", ")}`,
      });
    }
    console.error("Error updating group details:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

const addMembersToGroup = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const currentUserId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ message: "An array of user IDs is required." });
    }

    // Authorization check... (your existing code is fine)
    const adminMember = await GroupMember.findOne({
      where: { groupId, userId: currentUserId },
    });
    if (!adminMember || adminMember.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You must be an admin to add members." });
    }

    // --- START OF THE FIX ---

    // 1. Find ALL member records for these users, including the "ghosts" (soft-deleted ones).
    const allMemberRecords = await GroupMember.findAll({
      where: {
        groupId,
        userId: { [Op.in]: userIds },
      },
      paranoid: false, // This is the magic key: it includes soft-deleted records.
      transaction,
    });

    // 2. Separate them into two lists: members to restore and members who are brand new.
    const membersToRestore = allMemberRecords.filter(
      (m) => m.deletedAt !== null
    );
    const existingMemberIds = new Set(allMemberRecords.map((m) => m.userId));
    const newMemberIds = userIds.filter((id) => !existingMemberIds.has(id));

    // 3. Restore the "ghosts".
    if (membersToRestore.length > 0) {
      await Promise.all(
        membersToRestore.map((member) => member.restore({ transaction }))
      );
    }

    // 4. Create only the truly new members.
    if (newMemberIds.length > 0) {
      const newMembersData = newMemberIds.map((userId) => ({
        groupId,
        userId,
        role: "member",
      }));
      await GroupMember.bulkCreate(newMembersData, { transaction });
    }

    // --- END OF THE FIX ---

    await transaction.commit();

    res.status(201).json({
      message: `Successfully updated members.`,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error adding members to group:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
const removeMemberFromGroup = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const memberIdToRemove = parseInt(req.params.userId, 10);

    // 1. Authorization Check: Verify the current user is an admin
    const adminMember = await GroupMember.findOne({
      where: { groupId, userId: currentUserId },
    });
    if (!adminMember || adminMember.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You must be an admin to remove members." });
    }

    // 2. Validation: Prevent an admin from removing themselves with this endpoint
    if (currentUserId === memberIdToRemove) {
      return res.status(400).json({
        message:
          "Admins cannot remove themselves. Please use the 'leave group' endpoint instead.",
      });
    }

    // 3. Find the group to check who the creator is
    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // 4. Security Check: The original creator of the group cannot be removed
    if (group.createdBy === memberIdToRemove) {
      return res
        .status(403)
        .json({ message: "The creator of the group cannot be removed." });
    }

    // 5. Find the membership record for the user to be removed
    const memberToRemove = await GroupMember.findOne({
      where: {
        groupId,
        userId: memberIdToRemove,
      },
    });

    if (!memberToRemove) {
      return res
        .status(404)
        .json({ message: "This user is not a member of the group." });
    }

    // 6. Remove the member
    await memberToRemove.destroy();

    res
      .status(200)
      .json({ message: "Member removed from the group successfully." });
  } catch (error) {
    console.error("Error removing member from group:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
const updateMemberRole = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const memberIdToUpdate = parseInt(req.params.userId, 10);
    const { role } = req.body;

    // 1. Validation: Ensure the provided role is valid
    if (!role || !["admin", "member"].includes(role)) {
      return res.status(400).json({
        message: "Invalid role specified. Must be 'admin' or 'member'.",
      });
    }

    // 2. Authorization Check: Verify the current user is an admin
    const adminMember = await GroupMember.findOne({
      where: { groupId, userId: currentUserId },
    });
    if (!adminMember || adminMember.role !== "admin") {
      return res
        .status(403)
        .json({ message: "You must be an admin to change member roles." });
    }

    // 3. Validation: Prevent an admin from changing their own role with this endpoint
    if (currentUserId === memberIdToUpdate) {
      return res
        .status(400)
        .json({ message: "You cannot change your own role." });
    }

    // 4. Find the group to check who the creator is
    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // 5. Security Check: The original creator's role cannot be changed to 'member'
    if (group.createdBy === memberIdToUpdate && role === "member") {
      return res
        .status(403)
        .json({ message: "The creator of the group must always be an admin." });
    }

    // 6. Find the membership record for the user to be updated
    const memberToUpdate = await GroupMember.findOne({
      where: {
        groupId,
        userId: memberIdToUpdate,
      },
    });
    if (!memberToUpdate) {
      return res
        .status(404)
        .json({ message: "This user is not a member of the group." });
    }

    // 7. Update the member's role
    memberToUpdate.role = role;
    await memberToUpdate.save();

    res.status(200).json({
      message: "Member role updated successfully.",
      member: memberToUpdate,
    });
  } catch (error) {
    console.error("Error updating member role:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

const leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Find the user's membership record
    const membership = await GroupMember.findOne({
      where: {
        groupId: groupId,
        userId: userId,
      },
    });

    if (!membership) {
      return res
        .status(404)
        .json({ message: "You are not a member of this group." });
    }
    if (membership.role === "admin") {
      // Check if there are other admins in the group
      const otherAdmins = await GroupMember.count({
        where: {
          groupId,
          role: "admin",
          userId: { [Op.ne]: userId }, // [Op.ne] means 'not equal to'
        },
      });

      // If there are no other admins, block the request
      if (otherAdmins === 0) {
        return res.status(403).json({
          message:
            "You are the only admin. Please promote another member before leaving.",
        });
      }
    }
    // Delete the membership record
    await membership.destroy();

    res.status(200).json({ message: "You have left the group." });
  } catch (error) {
    console.error("Error leaving group:", error);
    res.status(500).json({ message: "Failed to leave group." });
  }
};

const getGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const members = await GroupMember.findAll({
      where: { groupId },
      include: [{ model: User, attributes: ["id", "name", "img"] }],
    });
    res.status(200).json(members);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch members." });
  }
};

const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Find the group to delete
    const group = await Group.findByPk(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // Sequelize's 'destroy' will delete the group.
    // Your database should be set up with "ON DELETE CASCADE" for related
    // messages and memberships to be deleted automatically.
    await group.destroy();

    res.status(200).json({ message: "Group deleted successfully." });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ message: "Failed to delete group." });
  }
};

const sendGroupMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    // Get groupId from the body, not params
    const { groupId, message, type = "text", content = null } = req.body;

    if (!groupId) {
      return res.status(400).json({ message: "Group ID is required." });
    }
    if (!message && type === "text") {
      return res
        .status(400)
        .json({ message: "Message content cannot be empty." });
    }

    const group = await Group.findByPk(groupId, {
      include: [
        {
          model: GroupMember,
          where: { userId: senderId },
          required: false,
        },
      ],
    });

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    const member = group.GroupMembers ? group.GroupMembers[0] : null;

    if (!member) {
      return res
        .status(403)
        .json({ message: "You are not a member of this group." });
    }

    // (Permission check logic can be added here if needed)

    const newMessage = await GroupMessage.create({
      senderId,
      groupId,
      message,
      type,
      content,
    });

    // Frontend expects the new message object directly
    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error sending group message:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

const getGroupConversation = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const groupId = parseInt(req.params.groupId, 10);
    const { before, since } = req.query; // Get 'before' and 'since' from query

    // Authorization Check
    const member = await GroupMember.findOne({
      where: { groupId, userId: currentUserId },
    });
    if (!member) {
      return res
        .status(403)
        .json({ message: "You are not a member of this group." });
    }
    const hiddenMessages = await HiddenGroupMessage.findAll({
      where: { userId: currentUserId },
      attributes: ["groupMessageId"],
    });
    const hiddenMessageIds = hiddenMessages.map((h) => h.groupMessageId);

    const whereClause = { groupId, id: { [Op.notIn]: hiddenMessageIds } };

    // Logic for infinite scroll (get messages BEFORE a certain ID)
    if (before) {
      whereClause.id = { [Op.lt]: parseInt(before, 10) };
    }
    // Logic for polling (get messages SINCE a certain ID)
    if (since) {
      whereClause.id = { [Op.gt]: parseInt(since, 10) };
    }

    const messages = await GroupMessage.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: 20,
      include: [
        { model: User, as: "Sender", attributes: ["id", "name", "img"] },
        // --- ADD THIS 'INCLUDE' BLOCK ---
        {
          model: GroupMessageReaction,
          // Use the alias if you defined one in associations.js
          // If not, you can omit the 'as' property.
          include: [{ model: User, attributes: ["id", "name"] }],
        },
        // --- END OF FIX ---
      ],
    });

    // Frontend expects a direct array of messages, oldest first
    res.status(200).json(messages.reverse());
  } catch (error) {
    console.error("Error fetching group conversation:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

const editGroupMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    const { message } = req.body;

    // 1. Validation: New message content is required
    if (!message || message.trim() === "") {
      return res
        .status(400)
        .json({ message: "New message content cannot be empty." });
    }

    // 2. Find the message to be edited
    const groupMessage = await GroupMessage.findByPk(messageId);
    if (!groupMessage) {
      return res.status(404).json({ message: "Message not found." });
    }

    // 3. Authorization Check: Ensure the user is the original sender
    if (groupMessage.senderId !== currentUserId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to edit this message." });
    }

    // 4. Update the message content
    groupMessage.message = message.trim();
    await groupMessage.save();

    // 5. Send a success response with the updated message
    res.status(200).json(groupMessage);
  } catch (error) {
    console.error("Error editing group message:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
const reactToGroupMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    const { reaction } = req.body;

    // 1. Validation: Reaction content is required
    if (!reaction || reaction.trim() === "") {
      return res
        .status(400)
        .json({ message: "Reaction content cannot be empty." });
    }

    // 2. Find the message and include its group ID
    const groupMessage = await GroupMessage.findByPk(messageId, {
      attributes: ["id", "groupId"],
    });
    if (!groupMessage) {
      return res.status(404).json({ message: "Message not found." });
    }

    // 3. Authorization Check: Verify the user is a member of the group
    const member = await GroupMember.findOne({
      where: {
        groupId: groupMessage.groupId,
        userId: currentUserId,
      },
    });
    if (!member) {
      return res.status(403).json({
        message: "You are not authorized to react to messages in this group.",
      });
    }

    // 4. Use findOrCreate to add the reaction or find it if it already exists
    const [newReaction, created] = await GroupMessageReaction.findOrCreate({
      where: {
        groupMessageId: messageId,
        userId: currentUserId,
        reaction: reaction.trim(),
      },
      defaults: {
        groupMessageId: messageId,
        userId: currentUserId,
        reaction: reaction.trim(),
      },
    });

    const statusCode = created ? 201 : 200;
    const responseMessage = created
      ? "Reaction added successfully."
      : "You have already added this reaction.";

    res
      .status(statusCode)
      .json({ message: responseMessage, reaction: newReaction });
  } catch (error) {
    console.error("Error reacting to group message:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
const removeGroupMessageReaction = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    const { reaction } = req.body;

    // 1. Validation: Reaction content is required
    if (!reaction || reaction.trim() === "") {
      return res.status(400).json({ message: "Reaction content is required." });
    }

    // 2. Find the reaction record to be deleted
    const reactionRecord = await GroupMessageReaction.findOne({
      where: {
        groupMessageId: messageId,
        userId: currentUserId,
        reaction: reaction.trim(),
      },
    });

    // 3. If no record is found, the reaction doesn't exist for this user
    if (!reactionRecord) {
      return res
        .status(404)
        .json({ message: "Reaction not found or you are not the owner." });
    }

    // 4. Delete the reaction
    await reactionRecord.destroy();

    // 5. Send a success response
    res.status(200).json({ message: "Reaction removed successfully." });
  } catch (error) {
    console.error("Error removing group message reaction:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
const deleteGroupMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    // Read the boolean flag from the query string, just like the individual chat
    const forEveryone = req.query.forEveryone === "true";

    const groupMessage = await GroupMessage.findByPk(messageId);
    if (!groupMessage) {
      return res.status(404).json({ message: "Group message not found." });
    }

    if (forEveryone) {
      // --- Logic for "Delete for Everyone" ---
      // Authorization Check: Must be the original sender
      if (groupMessage.senderId !== currentUserId) {
        return res.status(403).json({
          message:
            "You are not authorized to delete this message for everyone.",
        });
      }
      // Permanently delete the message
      await groupMessage.destroy();
      return res
        .status(200)
        .json({ message: "Group message deleted for everyone." });
    } else {
      // --- Logic for "Delete for Me" (hiding) ---
      // Authorization Check: Must be a member of the group
      const member = await GroupMember.findOne({
        where: {
          groupId: groupMessage.groupId,
          userId: currentUserId,
        },
      });
      if (!member) {
        return res.status(403).json({
          message: "You are not authorized to hide messages in this group.",
        });
      }
      // Hide the message for the current user
      await HiddenGroupMessage.findOrCreate({
        where: {
          groupMessageId: messageId,
          userId: currentUserId,
        },
      });
      return res.status(200).json({ message: "Group message hidden for you." });
    }
  } catch (error) {
    console.error("Error deleting group message:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

const getAddableFriends = async (req, res) => {
  try {
    const { groupId } = req.params;
    const currentUserId = req.user.id;

    // 1. Get the IDs of users who are already in the group.
    const existingMembers = await GroupMember.findAll({
      where: { groupId },
      attributes: ["userId"],
    });
    const existingMemberIds = existingMembers.map((member) => member.userId);

    // 2. Get the current user's friends using the CORRECT 'Contact' model.
    const contacts = await Contact.findAll({
      where: {
        status: "accepted",
        [Op.or]: [
          { requesterId: currentUserId },
          { addresseeId: currentUserId },
        ],
      },
      include: [
        { model: User, as: "requester", attributes: ["id", "name", "img"] },
        { model: User, as: "addressee", attributes: ["id", "name", "img"] },
      ],
    });

    // 3. Extract the friend 'User' object from each contact record.
    const friends = contacts.map((contact) => {
      // This logic correctly identifies the other user based on your aliases
      return contact.requesterId === currentUserId
        ? contact.addressee
        : contact.requester;
    });

    // 4. Filter out friends who are already members.
    const addableFriends = friends.filter(
      (friend) => !existingMemberIds.includes(friend.id)
    );

    res.status(200).json(addableFriends);
  } catch (error) {
    console.error("Error fetching addable friends:", error);
    res.status(500).json({ message: "Failed to fetch friends." });
  }
};
const getMembershipStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const groupId = req.params.groupId;

        const membership = await GroupMember.findOne({
            where: {
                userId: userId,
                groupId: groupId
            }
        });

        if (membership) {
            // If a record is found, send it back.
            return res.status(200).json(membership);
        } else {
            // If the user is not a member, it's not an error, they just don't have a record.
            // Sending 404 is appropriate here, the frontend will catch it.
            return res.status(404).json({ message: "Membership not found." });
        }

    } catch (error) {
        console.error("Error fetching membership status:", error);
        res.status(500).json({ message: "Server error." });
    }
};
const markGroupAsRead = async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.user.id; // From userAuthenticate middleware

    // 1. Validation: Ensure we have the group ID
    if (!groupId) {
      return res.status(400).json({ message: "Group ID is required." });
    }

    // 2. Find the user's specific unread count record for this group
    const unreadRecord = await UnreadCount.findOne({
      where: {
        userId: userId,
        chatId: groupId,
        chatType: "group",
      },
    });

    // 3. If a record exists and has unread messages, reset it
    if (unreadRecord && unreadRecord.count > 0) {
      unreadRecord.count = 0;
      await unreadRecord.save();
    }

    // 4. Send a success response
    // We send 200 OK even if there was nothing to update (idempotent)
    res.status(200).json({ message: "Group marked as read." });
    
  } catch (error) {
    console.error("Error marking group as read:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};
module.exports = {
  createGroup,
  getMyGroups,
  getGroupDetails,
  updateGroupDetails,
  addMembersToGroup,
  removeMemberFromGroup,
  updateMemberRole,
  leaveGroup,
  deleteGroup,
  sendGroupMessage,
  getGroupConversation,
  editGroupMessage,
  reactToGroupMessage,
  removeGroupMessageReaction,
  deleteGroupMessage,
  getGroupMembers,
  getAddableFriends,
  getMembershipStatus,
  markGroupAsRead
};