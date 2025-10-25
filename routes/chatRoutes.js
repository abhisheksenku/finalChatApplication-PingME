const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const userAuthenticate = require("../middleware/auth");

// Route to send a new text message
router.post("/add", userAuthenticate.authenticate, chatController.sendMessage);

// Route to fetch the message history for a 1-to-1 chat
router.get(
  "/fetch/:userId",
  userAuthenticate.authenticate,
  chatController.getConversation
);

// Route to edit an existing text message
router.put(
  "/edit/:messageId",
  userAuthenticate.authenticate,
  chatController.editMessage
);

// Route to delete a message (for "me" or "everyone")
router.delete(
  "/delete/:messageId",
  userAuthenticate.authenticate,
  chatController.deleteMessage
);

// Route to add a reaction to a message
router.post(
  "/react/:messageId",
  userAuthenticate.authenticate,
  chatController.reactToMessage
);

// Route to remove a reaction from a message
router.delete(
  "/react/:messageId",
  userAuthenticate.authenticate,
  chatController.removeReaction
);

// --- ADDED ROUTE ---
// This route was missing but the controller was provided.
// It's needed for the frontend's openChat() function.
router.post(
  "/mark-read",
  userAuthenticate.authenticate,
  chatController.markMessagesAsRead
);

module.exports = router;