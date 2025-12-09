
module.exports = (sequelize, DataTypes) => {
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
    
    // Original email identifiers
    originalEmailId: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Gmail message ID'
    },
    threadId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Gmail thread ID for grouping'
    },
    
    // CRITICAL: Headers needed for reply threading
    messageId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Original Message-ID header for In-Reply-To'
    },
    references: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'References header chain for threading'
    },
    
    // Email content
    from: {
      type: DataTypes.STRING,
      allowNull: false
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
      allowNull: true,
      comment: 'User edited version of the reply'
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
      allowNull: true,
      comment: 'Gmail ID of the sent reply'
    }
  }, {
    tableName: 'Drafts',
    timestamps: true
  });

  Draft.associate = (models) => {
    Draft.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Draft;
};




