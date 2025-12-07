const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Draft = sequelize.define('Draft', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    references: { model: User, key: 'id' }
  },
  emailProvider: {
    type: DataTypes.ENUM('gmail', 'outlook'),
    allowNull: false
  },
  originalEmailId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  threadId: {
    type: DataTypes.STRING
  },
  senderEmail: {
    type: DataTypes.STRING,
    allowNull: false
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false
  },
  originalBody: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  draftBody: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'edited', 'sent'),
    defaultValue: 'pending'
  },
  editedBody: {
    type: DataTypes.TEXT
  },
  sentAt: {
    type: DataTypes.DATE
  },
  whatsappMessageSid: {
    type: DataTypes.STRING
  }
});

User.hasMany(Draft, { foreignKey: 'userId' });
Draft.belongsTo(User, { foreignKey: 'userId' });

module.exports = Draft;
