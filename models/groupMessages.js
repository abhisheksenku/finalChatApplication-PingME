const { DataTypes } = require("sequelize");
const sequelize = require("../utilities/sql");

const GroupMessage = sequelize.define('GroupMessage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('text', 'image', 'file', 'link'),
    defaultValue: 'text',
  },
  content: {
    type: DataTypes.JSON, // For storing file URL, metadata, etc.
    allowNull: true,
  },
  // Foreign key for replies, creating a self-referencing relationship
  parentMessageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'GroupMessages', // table name
      key: 'id'
    },
    onDelete: 'SET NULL'
  }
}, {
  timestamps: true,
});

module.exports = GroupMessage;