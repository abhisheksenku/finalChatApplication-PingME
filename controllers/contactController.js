const { Op } = require("sequelize");
const {
  User,
  Contact,
  UnreadCount,
} = require("../models/associations");

// Helper function to extract the "friend" from a contact object
const getOtherUser = (contact, userId) => {
  return contact.requesterId === userId ? contact.Addressee : contact.Requester;
};

// GET /api/contacts/friends
const getFriends = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Contact Model Associations:", Contact.associations);
    const contacts = await Contact.findAll({
      where: {
        status: "accepted",
        [Op.or]: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: [
        {
          model: User,
          as: "Requester",
          attributes: ["id", "name", "email", "img", "isOnline", "status"],
        },
        {
          model: User,
          as: "Addressee",
          attributes: ["id", "name", "email", "img", "isOnline", "status"],
        },
      ],
    });
    console.log("Contacts Found:", JSON.stringify(contacts, null, 2));
    // 1. Get the list of friend objects
    const friendsList = contacts.map((contact) => {
      return getOtherUser(contact, userId);
    }).filter(friend => friend != null);
    console.log("Friends List (before ID map):", JSON.stringify(friendsList, null, 2));
    const friendIds = friendsList.map((friend) => friend.id);

    console.log("Friend IDs for Unread Query:", friendIds);
    // 2. Fetch all unread counts for these friends
    const unreadCounts = await UnreadCount.findAll({
      where: {
        userId: userId,
        chatType: "individual",
        chatId: { [Op.in]: friendIds },
      },
      attributes: ["chatId", "count"],
    });

    // 3. Create a map for easy lookup
    const countMap = unreadCounts.reduce((map, item) => {
      map[item.chatId] = item.count;
      return map;
    }, {});

    // 4. Combine the friend data with their unread count
    const friendsWithCounts = friendsList.map((friend) => {
      return {
        ...friend.toJSON(),
        unreadCount: countMap[friend.id] || 0,
      };
    });

    res.status(200).json({ friends: friendsWithCounts });
  } catch (error) {
    console.error("Error fetching friends:", error);
    res.status(500).json({ message: "Failed to fetch friends list." });
  }
};

// GET /api/contacts/received/requests
const getReceivedRequests = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const contacts = await Contact.findAll({
      where: {
        status: "pending",
        addresseeId: currentUserId,
      },
      include: [
        {
          model: User,
          as: "Requester",
          attributes: ["id", "name", "email", "img", "status"],
        },
      ],
    });

    // This mapping is perfect for the frontend
    const receivedRequests = contacts.map((contact) => ({
      ...contact.Requester.toJSON(),
      Contact: { id: contact.id }, // Provides the requestId
    }));

    res.status(200).json({ receivedRequests });
  } catch (error) {
    console.error("Error fetching received requests:", error);
    res.status(500).json({ message: "Failed to fetch received requests." });
  }
};

// GET /api/contacts/sent/requests
const getSentRequests = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const contacts = await Contact.findAll({
      where: {
        status: "pending",
        requesterId: currentUserId,
      },
      include: [
        {
          model: User,
          as: "Addressee",
          attributes: ["id", "name", "email", "img", "status"],
        },
      ],
    });

    // This mapping is perfect for the frontend
    const sentRequests = contacts.map((contact) => ({
      ...contact.Addressee.toJSON(),
      Contact: { id: contact.id }, // Provides the requestId
    }));

    res.status(200).json({ sentRequests });
  } catch (error) {
    console.error("Error while fetching sent requests:", error);
    res.status(500).json({ message: "An internal server error occurred" });
  }
};

// GET /api/contacts/friends/blocked
const getBlockedUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const contacts = await Contact.findAll({
      where: {
        status: "blocked",
        requesterId: currentUserId, // Only show users *I* have blocked
      },
      include: [
        {
          model: User,
          as: "Addressee",
          attributes: ["id", "name", "email", "img", "status"],
        },
      ],
    });
    const blockedUsers = contacts.map((contact) => contact.addressee);
    res.status(200).json({ blockedUsers });
  } catch (error) {
    console.error("Error while fetching blocked users:", error);
    res.status(500).json({ message: "An internal server error occurred" });
  }
};

// GET /api/contacts/friends/suggestions
const getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    // 1. Find all users I already have *any* relationship with
    const contacts = await Contact.findAll({
      where: {
        [Op.or]: [
          { requesterId: currentUserId },
          { addresseeId: currentUserId },
        ],
      },
      attributes: ["requesterId", "addresseeId"],
    });

    // 2. Create a list of all their IDs
    const relatedUserIds = contacts.flatMap((contact) => [
      contact.requesterId,
      contact.addresseeId,
    ]);

    // 3. Create a final exclusion list (my ID + all related IDs)
    const exclusionList = [...new Set([currentUserId, ...relatedUserIds])];

    // 4. Find all users who are NOT in the exclusion list
    const availableUsers = await User.findAll({
      where: {
        id: { [Op.notIn]: exclusionList },
      },
      attributes: ["id", "name", "email", "img"],
    });

    res.status(200).json({ availableUsers });
  } catch (error) {
    console.error("Error while fetching available users:", error);
    res.status(500).json({ message: "An internal server error occurred" });
  }
};

// POST /api/contacts/send-request/:userId
const sendFriendRequest = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const addresseeId = parseInt(req.params.userId, 10);

    // --- Validation logic ---
    if (requesterId === addresseeId) {
      return res
        .status(400)
        .json({ message: "You cannot send a friend request to yourself" });
    }
    const addressee = await User.findByPk(addresseeId);
    if (!addressee) {
      return res
        .status(400)
        .json({ message: "The user you are trying to add does not exist" });
    }
    const existingContact = await Contact.findOne({
      where: {
        [Op.or]: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });
    if (existingContact) {
      if (existingContact.status === "accepted") {
        return res
          .status(409)
          .json({ message: "You are already friends with this user" });
      }
      return res
        .status(409)
        .json({ message: "A friend request already exists" });
    }
    // --- End of validation ---

    const newRequest = await Contact.create({
      requesterId,
      addresseeId,
      status: "pending",
    });

    // --- WebSocket logic removed ---
    // We will add this back later.

    res.status(201).json({
      message: "Friend request sent successfully.",
      request: newRequest,
    });
  } catch (error) {
    console.error("Error sending friend request:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// POST /api/contacts/accept/:requestId or /decline/:requestId
const updateFriendRequest = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const requestId = parseInt(req.params.requestId, 10);
    const { action } = req.body; // Expecting 'accept' or 'decline'

    if (!["accept", "decline"].includes(action)) {
      return res
        .status(400)
        .json({ message: "Invalid action. Must be 'accept' or 'decline'." });
    }
    const request = await Contact.findByPk(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found." });
    }
    if (request.addresseeId !== currentUserId) {
      return res.status(403).json({
        message: "You are not authorized to respond to this request.",
      });
    }
    if (request.status !== "pending") {
      return res
        .status(409)
        .json({ message: "This request has already been responded to." });
    }

    if (action === "accept") {
      request.status = "accepted";
      await request.save();

      // --- WebSocket logic removed ---

      return res
        .status(200)
        .json({ message: "Friend request accepted.", contact: request });
    } else {
      // action === 'decline'
      await request.destroy();
      return res.status(200).json({ message: "Friend request declined." });
    }
  } catch (error) {
    console.error("Error updating friend request:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// POST /api/contacts/unfriend/:userId
const removeFriend = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const friendId = parseInt(req.params.userId, 10);
    const friendship = await Contact.findOne({
      where: {
        status: "accepted",
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: currentUserId },
        ],
      },
    });

    if (!friendship) {
      return res
        .status(404)
        .json({ message: "You are not friends with this user." });
    }
    await friendship.destroy();

    res.status(200).json({ message: "Friend removed successfully." });
  } catch (error) {
    console.error("Error removing friend:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// POST /api/contacts/block/:userId
const blockUser = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const addresseeId = parseInt(req.params.userId, 10);

    if (requesterId === addresseeId) {
      return res.status(400).json({ message: "You cannot block yourself." });
    }

    const addressee = await User.findByPk(addresseeId);
    if (!addressee) {
      return res
        .status(404)
        .json({ message: "The user you are trying to block does not exist." });
    }

    // Find any existing relationship
    const existingContact = await Contact.findOne({
      where: {
        [Op.or]: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    });

    if (existingContact) {
      // A relationship exists, just update it to "blocked"
      // and ensure the requester is the one blocking.
      existingContact.requesterId = requesterId;
      existingContact.addresseeId = addresseeId;
      existingContact.status = "blocked";
      await existingContact.save();
      res.status(200).json({
        message: "User blocked successfully.",
        contact: existingContact,
      });
    } else {
      // No relationship exists, create a new "blocked" one.
      const newBlockedContact = await Contact.create({
        requesterId,
        addresseeId,
        status: "blocked",
      });
      res.status(201).json({
        message: "User blocked successfully.",
        contact: newBlockedContact,
      });
    }
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// POST /api/contacts/cancel-request/:requestId
const cancelRequest = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requestId = parseInt(req.params.requestId, 10);

    const request = await Contact.findOne({
      where: { id: requestId, requesterId: requesterId, status: "pending" },
    });

    if (!request) {
      return res
        .status(404)
        .json({
          message: "Request not found or you are not authorized to cancel it.",
        });
    }

    await request.destroy();
    res.status(200).json({ message: "Friend request cancelled." });
  } catch (error) {
    console.error("Error cancelling request:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

// POST /api/contacts/unblock/:userId
const unblockUser = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const blockedUserId = parseInt(req.params.userId, 10);

    // Find the 'blocked' record initiated by the current user
    const contact = await Contact.findOne({
      where: {
        requesterId: currentUserId,
        addresseeId: blockedUserId,
        status: "blocked",
      },
    });

    if (!contact) {
      return res
        .status(404)
        .json({ message: "Blocked relationship not found." });
    }

    // --- CORRECTED LOGIC ---
    // Unblocking should just delete the record.
    // It does not automatically make you friends.
    await contact.destroy();
    res.status(200).json({ message: "User unblocked successfully." });
    // --- END CORRECTION ---

  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = {
  getFriends,
  getReceivedRequests,
  getSentRequests,
  getBlockedUsers,
  getAvailableUsers,
  sendFriendRequest,
  updateFriendRequest,
  removeFriend,
  blockUser,
  cancelRequest,
  unblockUser,
};