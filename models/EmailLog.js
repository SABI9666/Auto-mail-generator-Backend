const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const EmailLog = sequelize.define('EmailLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    references: { model: User, key: 'id' }
  },
  draftId: {
    type: DataTypes.UUID
  },
  action: {
    type: DataTypes.ENUM('received', 'draft_created', 'approved', 'rejected', 'sent'),
    allowNull: false
  },
  emailProvider: {
    type: DataTypes.STRING
  },
  details: {
    type: DataTypes.JSONB
  }
});

User.hasMany(EmailLog, { foreignKey: 'userId' });
EmailLog.belongsTo(User, { foreignKey: 'userId' });

module.exports = EmailLog;
