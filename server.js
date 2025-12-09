const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sequelize = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email'); // This handles drafts
const gmailRoutes = require('./routes/gmail'); // <--- NEW: You were missing this!
const whatsappRoutes = require('./routes/whatsapp');
const statsRoutes = require('./routes/stats');

const app = express();

// Trust proxy for Render
app.set('trust proxy', 1);

// SECURITY: CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL // Your production URL from .env
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      // If specific origin not found, but we are in dev, allow it (optional)
      if (process.env.NODE_ENV === 'development') return callback(null, true);
      
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true, // Required for cookies/authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug Middleware: Log all requests to see if they reach the server
app.use((req, res, next) => {
  console.log(`📢 ${req.method} ${req.path}`);
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/gmail', gmailRoutes); // <--- NEW: Mount the Gmail routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'auto-responder-backend' });
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 10000;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    await sequelize.sync({ alter: true });
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Allowed Origins:`, allowedOrigins);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
  }
};

startServer();

module.exports = app;
