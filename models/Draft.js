const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Draft = sequelize.define('Draft', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    emailId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    threadId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    from: {
      type: DataTypes.STRING,
      allowNull: false
    },
    to: {
      type: DataTypes.STRING,
      allowNull: false
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    originalBody: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    generatedReply: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'sent', 'edited'),
      defaultValue: 'pending',
      allowNull: false
    },
    approvalToken: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['emailId']
      },
      {
        fields: ['approvalToken']
      }
    ]
  });

  return Draft;
};






























