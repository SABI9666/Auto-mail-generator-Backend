const sequelize = require('../config/database');


const User = require('./User')(sequelize);
const Draft = require('./Draft')(sequelize);

// Define associations AFTER all models are initialized
User.hasMany(Draft, { 
  foreignKey: 'userId',
  as: 'drafts',
  onDelete: 'CASCADE'
});

Draft.belongsTo(User, { 
  foreignKey: 'userId',
  as: 'user'
});

// Export all models
module.exports = {
  sequelize,
  User,
  Draft
};















