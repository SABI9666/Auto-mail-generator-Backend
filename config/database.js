const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.NODE_ENV === 'production') {
  // IMPORTANT: Check DATABASE_URL FIRST (for Render, Heroku, Railway)
  if (process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL connection');
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    });
  } 
  // Only use Cloud SQL if DATABASE_URL is not provided (for GCP)
  else if (process.env.CLOUD_SQL_CONNECTION_NAME) {
    console.log('Using Cloud SQL connection');
    sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        dialect: 'postgres',
        host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
        dialectOptions: {
          socketPath: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
        },
        logging: false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      }
    );
  } else {
    throw new Error('No database configuration found. Please set DATABASE_URL or Cloud SQL variables.');
  }
} else {
  // Local development
  const localDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/emailauto';
  console.log('Using local database');
  sequelize = new Sequelize(localDbUrl, {
    dialect: 'postgres',
    logging: false
  });
}

// Test connection
sequelize.authenticate()
  .then(() => {
    console.log('✅ Database connected successfully');
  })
  .catch(err => {
    console.error('❌ Unable to connect to database:', err.message);
  });

module.exports = sequelize;
