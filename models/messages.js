// Import the necessary components from the Sequelize library
const { DataTypes } = require("sequelize");
// Import the configured Sequelize instance (your database connection)
const sequelize = require("../utilities/sql");

/**
 * Defines the 'Message' model, representing a single message
 * in a one-to-one chat.
 */
const Message = sequelize.define(
  "Message",
  {
    // --- Primary Key ---
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },

    // --- Message Content ---
    message: {
      type: DataTypes.TEXT, // Use TEXT for long messages, VARCHAR is usually 255 chars
      allowNull: true, // Can be null if it's a file/image message
    },

    // --- Message Type ---
    type: {
      type: DataTypes.ENUM("text", "image", "file", "link"),
      defaultValue: "text", // Default to 'text' if not specified
    },

    // --- File/Media Content ---
    content: {
      type: DataTypes.JSON, // Use JSON to store metadata like { url: "...", filename: "..." }
      allowNull: true,
    },

    // --- Message Status (for Read Receipts) ---
    status: {
      type: DataTypes.ENUM("sent", "delivered", "read"),
      defaultValue: "sent",
      allowNull: false,
    },

    // --- Foreign Key for Threaded Replies ---
    // This creates a self-referencing relationship,
    // allowing messages to be replies to other messages.
    parentMessageId: {
      type: DataTypes.INTEGER,
      allowNull: true, // A message doesn't have to be a reply
      references: {
        model: "Messages", // This is the physical table name
        key: "id",
      },
      onDelete: "SET NULL", // If the parent message is deleted, don't delete the reply, just remove the link.
    },
  },
  {
    // --- Model Options ---
    // 'timestamps: true' automatically adds 'createdAt' and 'updatedAt' fields
    // to the table, which is essential for sorting messages chronologically.
    timestamps: true,
  }
);

// Export the initialized 'Message' model so it can be used
// in other parts of the application (like controllers and associations.js).
module.exports = Message;