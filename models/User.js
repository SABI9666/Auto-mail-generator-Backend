const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  name: {
    type: DataTypes.STRING
  },
  whatsappNumber: {
    type: DataTypes.STRING
  },
  gmailAccessToken: {
    type: DataTypes.TEXT
  },
  gmailRefreshToken: {
    type: DataTypes.TEXT
  },
  emailPreferences: {
    type: DataTypes.JSONB,
    defaultValue: {
      tone: 'professional',
      signOff: 'Best regards',
      signature: '',
      autoReply: true
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = User;
