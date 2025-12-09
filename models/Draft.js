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
      allowNull: false
    },
    
    // Original email identifiers
    originalEmailId: {
      type: DataTypes.STRING,
      allowNull: true  // Nullable for existing data compatibility
    },
    threadId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    
    // CRITICAL: Headers needed for reply threading
    messageId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    references: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // Email content
    from: {
      type: DataTypes.STRING,
      allowNull: true  // Nullable for existing data compatibility
    },
    to: {
      type: DataTypes.STRING,
      allowNull: true
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true
    },
    originalBody: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // AI Generated content
    generatedReply: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    editedReply: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // Status tracking
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'edited', 'rejected'),
      defaultValue: 'pending'
    },
    
    // Timestamps
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    
    // Sent email reference
    sentEmailId: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'Drafts',
    timestamps: true
  });

  return Draft;
};














