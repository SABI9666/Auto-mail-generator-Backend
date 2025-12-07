const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

if (process.env.NODE_ENV === 'production') {
  // Production: Cloud SQL
  sequelize = new Sequelize(
    process.env.DB_NAME || 'emailauto',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD,
    {
      dialect: 'postgres',
      host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
      dialectOptions: {
        socketPath: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
      },
      logging: false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    }
  );
} else {
  // Development: Local
  sequelize = new Sequelize(
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/emailauto',
    {
      dialect: 'postgres',
      logging: false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
    }
  );
}

module.exports = sequelize;
