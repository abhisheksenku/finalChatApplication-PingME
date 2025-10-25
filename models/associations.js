// ==================
// == IMPORT MODELS ==
// ==================
// Import all the models we need for our 1-to-1 chat features.
// Note: File paths are assumed to be plural (e.g., './users.js')
const User = require("./users");
const Message = require("./messages");
const MessageReaction = require("./messageReactions");
const HiddenMessage = require("./hiddenMessages");
const Contact = require("./contacts");
const Status = require("./status"); // Fixed path
const UnreadCount = require("./unreadcount"); // Fixed path

// ======================
// == DEFINE ASSOCIATIONS ==
// ======================

// --- 1. User <-> Message (1-to-1 Chat) ---
// A User can send many messages
User.hasMany(Message, {
  foreignKey: "senderId",
  as: "SentMessages",
});
// A User can receive many messages
User.hasMany(Message, {
  foreignKey: "receiverId",
  as: "ReceivedMessages",
});
// Every Message belongs to one Sender
Message.belongsTo(User, {
  foreignKey: "senderId",
  as: "Sender",
});
// Every Message belongs to one Receiver
Message.belongsTo(User, {
  foreignKey: "receiverId",
  as: "Receiver",
});

// --- 2. Message <-> Message (Replies/Threads) ---
// A Message (parent) can have many replies (children)
Message.hasMany(Message, {
  foreignKey: "parentMessageId",
  as: "Replies",
});
// A Message (reply) belongs to one parent message
Message.belongsTo(Message, {
  foreignKey: "parentMessageId",
  as: "ParentMessage",
});

// --- 3. Message <-> MessageReaction ---
// A Message can have many reactions
Message.hasMany(MessageReaction, {
  foreignKey: "messageId",
});
// A Reaction belongs to one Message
MessageReaction.belongsTo(Message, {
  foreignKey: "messageId",
});

// --- 4. User <-> MessageReaction ---
// A User can give many reactions
User.hasMany(MessageReaction, {
  foreignKey: "userId",
});
// A Reaction belongs to one User
MessageReaction.belongsTo(User, {
  foreignKey: "userId",
});

// --- 5. User <-> Message (via HiddenMessage for "Delete for Me") ---
// This is a Many-to-Many relationship.
// A User can hide many Messages
User.belongsToMany(Message, {
  through: HiddenMessage, // The join table
  foreignKey: "userId",
  as: "HiddenMessages",
});
// A Message can be hidden by many Users
Message.belongsToMany(User, {
  through: HiddenMessage, // The join table
  foreignKey: "messageId",
  as: "HiddenByUsers",
});

// --- 6. User <-> Contact (Friendship) ---
// This is the key association that has two connections.
// A User (Requester) can send many friend requests
User.hasMany(Contact, {
  foreignKey: "requesterId",
  as: "SentRequests",
});
// A User (Addressee) can receive many friend requests
User.hasMany(Contact, {
  foreignKey: "addresseeId",
  as: "ReceivedRequests",
});
// A Contact request belongs to one Requester
Contact.belongsTo(User, {
  foreignKey: "requesterId",
  as: "Requester",
});
// A Contact request belongs to one Addressee
Contact.belongsTo(User, {
  foreignKey: "addresseeId",
  as: "Addressee",
});

// --- 7. User <-> Status ---
// A User can post many Status updates
User.hasMany(Status, {
  foreignKey: "userId",
});
// A Status update belongs to one User
Status.belongsTo(User, {
  foreignKey: "userId",
});

// --- 8. User <-> UnreadCount ---
// A User can have many unread count records (one for each chat)
User.hasMany(UnreadCount, {
  foreignKey: "userId",
});
// An UnreadCount record belongs to one User
UnreadCount.belongsTo(User, {
  foreignKey: "userId",
});

// ==================
// == EXPORT MODELS ==
// ==================
// Export all models so they can be imported from this single file
// This makes it easy to import { User, Message } from './associations'
module.exports = {
  User,
  Message,
  MessageReaction,
  HiddenMessage,
  Contact,
  Status,
  UnreadCount,
  // (Group models will be added back here later)
};