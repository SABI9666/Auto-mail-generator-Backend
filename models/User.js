backend/models/User.js
javascriptconst { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [2, 100]
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
        notEmpty: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [6, 255]
      }
    },
    whatsappNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        is: /^\+?[1-9]\d{1,14}$/  // E.164 format validation
      }
    },
    emailPreferences: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        tone: 'professional',
        signOff: 'Best regards',
        signature: ''
      }
    },
    // Gmail OAuth tokens
    gmailAccessToken: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    gmailRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    gmailTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Gmail connection status
    isGmailConnected: {
      type: DataTypes.VIRTUAL,
      get() {
        return !!this.gmailAccessToken && !!this.gmailRefreshToken;
      }
    }
  }, {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['email']
      }
    ],
    hooks: {
      // Clean up tokens on user deletion
      beforeDestroy: async (user) => {
        user.gmailAccessToken = null;
        user.gmailRefreshToken = null;
        user.gmailTokenExpiry = null;
      }
    }
  });

  // Instance methods
  User.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    // Never expose sensitive data
    delete values.password;
    delete values.gmailAccessToken;
    delete values.gmailRefreshToken;
    return values;
  };

  User.prototype.hasValidGmailToken = function() {
    if (!this.gmailAccessToken || !this.gmailTokenExpiry) {
      return false;
    }
    // Check if token is expired (with 5 minute buffer)
    return new Date(this.gmailTokenExpiry) > new Date(Date.now() + 5 * 60 * 1000);
  };

  return User;
};
