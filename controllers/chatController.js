const { Op } = require("sequelize");
const {
  User,
  Message,
  MessageReaction,
  HiddenMessage,
  UnreadCount
} = require("../models/associations");

// POST /api/chat/add
const sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    // Get receiverId from BODY
    const { receiverId, message, type = "text", content = null } = req.body;

    if (!receiverId) {
      return res.status(400).json({ message: "Receiver ID is required." });
    }
    if (!message && type === "text") {
      return res
        .status(400)
        .json({ message: "Message content cannot be empty." });
    }

    const newMessage = await Message.create({
      senderId,
      receiverId: parseInt(receiverId, 10),
      message,
      type,
      content,
    });

    // Frontend expects the new message object directly
    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// GET /api/chat/fetch/:userId
const getConversation = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = parseInt(req.params.userId, 10);
    const { before, since } = req.query;

    // 1. Get the list of all message IDs this user has hidden.
    const hiddenMessages = await HiddenMessage.findAll({
      where: { userId: currentUserId },
      attributes: ["messageId"],
    });
    const hiddenMessageIds = hiddenMessages.map((h) => h.messageId);

    const whereClause = {
      [Op.or]: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
      // 2. Add the filter to exclude the hidden message IDs.
      id: { [Op.notIn]: hiddenMessageIds },
    };

    if (before) {
      whereClause.id[Op.lt] = parseInt(before, 10);
    }
    if (since) {
      whereClause.id[Op.gt] = parseInt(since, 10);
    }

    const messages = await Message.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit: 20,
      include: [
        { model: User, as: "Sender", attributes: ["id", "name", "img"] },
        {
          model: MessageReaction,
          include: [{ model: User, attributes: ["id", "name"] }],
        },
      ],
    });

    res.status(200).json(messages.reverse());
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// PUT /api/chat/edit/:messageId
const editMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    const { message: newMessageContent } = req.body;

    if (!newMessageContent || newMessageContent.trim() === "") {
      return res
        .status(400)
        .json({ message: "New message content cannot be empty." });
    }

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }
    if (message.senderId !== currentUserId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to edit this message." });
    }

    message.message = newMessageContent.trim();
    await message.save();

    res.status(200).json(message);
  } catch (error) {
    console.error("Error editing message:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// DELETE /api/chat/delete/:messageId
const deleteMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    const forEveryone = req.query.forEveryone === "true";

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }

    if (forEveryone) {
      // Logic for "Delete for Everyone"
      if (message.senderId !== currentUserId) {
        return res
          .status(403)
          .json({
            message: "You can only delete your own messages for everyone.",
          });
      }
      await message.destroy();
      return res.status(200).json({ message: "Message deleted for everyone." });
    } else {
      // Logic for "Delete for Me" (hiding the message)
      if (
        message.senderId !== currentUserId &&
        message.receiverId !== currentUserId
      ) {
        return res
          .status(403)
          .json({ message: "You are not part of this conversation." });
      }
      await HiddenMessage.findOrCreate({
        where: { userId: currentUserId, messageId: messageId },
      });
      return res.status(200).json({ message: "Message hidden for you." });
    }
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// POST /api/chat/react/:messageId
const reactToMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    const { reaction } = req.body;

    if (!reaction || reaction.trim() === "") {
      return res.status(400).json({ message: "Reaction content is required." });
    }

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }

    if (
      message.senderId !== currentUserId &&
      message.receiverId !== currentUserId
    ) {
      return res
        .status(403)
        .json({ message: "You are not authorized to react to this message." });
    }

    const [reactionInstance, created] = await MessageReaction.findOrCreate({
      where: {
        messageId: messageId,
        userId: currentUserId,
        reaction: reaction.trim(),
      },
      defaults: {
        messageId: messageId,
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
      .json({ message: responseMessage, reaction: reactionInstance });
  } catch (error) {
    console.error("Error adding reaction:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// DELETE /api/chat/react/:messageId
const removeReaction = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const messageId = parseInt(req.params.messageId, 10);
    const { reaction } = req.body;

    if (!reaction || reaction.trim() === "") {
      return res
        .status(400)
        .json({ message: "Reaction content is required to remove it." });
    }

    const reactionInstance = await MessageReaction.findOne({
      where: {
        messageId: messageId,
        userId: currentUserId,
        reaction: reaction.trim(),
      },
    });

    if (!reactionInstance) {
      return res.status(404).json({ message: "Reaction not found." });
    }

    await reactionInstance.destroy();

    res.status(200).json({ message: "Reaction removed successfully." });
  } catch (error) {
    console.error("Error removing reaction:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

// POST /api/chat/mark-read
const markMessagesAsRead = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    // This controller expects a 'chatId' from the user you are talking to
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({ message: "A chatId is required." });
    }

    // Update messages *sent by the other user* to you
    const [updateCount] = await Message.update(
      { status: "read" },
      {
        where: {
          senderId: chatId, // From the other user
          receiverId: currentUserId, // To me
          status: { [Op.ne]: "read" },
        },
      }
    );
    
    // Also, clear the unread count for this chat
    await UnreadCount.update(
        { count: 0 },
        {
            where: {
                userId: currentUserId,
                chatId: chatId,
                chatType: 'individual'
            }
        }
    );

    res.status(200).json({
      message: "Messages marked as read successfully.",
      updatedCount: updateCount,
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
};

module.exports = {
  sendMessage,
  getConversation,
  editMessage,
  deleteMessage,
  reactToMessage,
  removeReaction,
  markMessagesAsRead,
};