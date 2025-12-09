const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const sequelize = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');
const gmailRoutes = require('./routes/gmail');
const whatsappRoutes = require('./routes/whatsapp');
const statsRoutes = require('./routes/stats');

// Import services for auto-scan
const gmailService = require('./services/gmailService');
const openaiService = require('./services/openaiService');
const twilioService = require('./services/twilioService');

const app = express();

// Trust proxy for Render
app.set('trust proxy', 1);

// SECURITY: CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      if (process.env.NODE_ENV === 'development') return callback(null, true);
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug Middleware
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
app.use('/api/gmail', gmailRoutes);
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

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SCAN CRON JOB - Runs every minute to check users with auto-scan enabled
// ═══════════════════════════════════════════════════════════════════════════
const runAutoScan = async () => {
  try {
    const { User, Draft } = require('./models');
    const { Op } = require('sequelize');
    
    console.log('🔄 Auto-scan check running...');
    
    // Find all users with auto-scan enabled and Gmail connected
    const users = await User.findAll({
      where: {
        autoScanEnabled: true,
        gmailAccessToken: { [Op.ne]: null },
        gmailRefreshToken: { [Op.ne]: null }
      }
    });

    console.log(`📧 Found ${users.length} users with auto-scan enabled`);

    for (const user of users) {
      try {
        // Check if enough time has passed since last scan
        const now = new Date();
        const lastScan = user.lastAutoScan ? new Date(user.lastAutoScan) : new Date(0);
        const minutesSinceLastScan = (now - lastScan) / (1000 * 60);

        if (minutesSinceLastScan < user.autoScanInterval) {
          console.log(`⏳ User ${user.email}: Next scan in ${Math.ceil(user.autoScanInterval - minutesSinceLastScan)} minutes`);
          continue;
        }

        console.log(`🔍 Auto-scanning for user: ${user.email}`);

        // Get unread messages from last 24 hours
        const startDate = new Date(now - 24 * 60 * 60 * 1000);
        const messages = await gmailService.listUnreadMessages(user.id, startDate);

        if (!messages || messages.length === 0) {
          console.log(`📭 No new emails for ${user.email}`);
          await User.update({ lastAutoScan: now }, { where: { id: user.id } });
          continue;
        }

        console.log(`📬 Found ${messages.length} unread emails for ${user.email}`);

        // Process max 3 emails per auto-scan to avoid rate limits
        const maxEmails = 3;
        let draftsCreated = 0;

        for (let i = 0; i < Math.min(messages.length, maxEmails); i++) {
          const msg = messages[i];

          // Check if draft already exists
          const existingDraft = await Draft.findOne({
            where: { originalEmailId: msg.id, userId: user.id }
          });

          if (existingDraft) {
            console.log(`⏭️ Draft already exists for email ${msg.id}`);
            continue;
          }

          // Get full message
          const messageData = await gmailService.getMessage(user.id, msg.id);

          // Generate AI reply
          console.log(`🤖 Generating AI reply for auto-scan...`);
          const aiReply = await openaiService.generateReply(
            messageData.body,
            user.emailPreferences
          );

          // Create draft
          const draft = await Draft.create({
            userId: user.id,
            originalEmailId: messageData.id,
            threadId: messageData.threadId,
            messageId: messageData.messageId,
            references: messageData.references,
            from: messageData.to,
            to: messageData.from,
            subject: `Re: ${messageData.subject}`,
            originalBody: messageData.body,
            generatedReply: aiReply,
            status: 'pending'
          });

          draftsCreated++;

          // Send WhatsApp notification
          if (user.whatsappNumber) {
            await twilioService.sendDraftNotification(
              user.whatsappNumber,
              {
                from: messageData.from,
                subject: messageData.subject,
                originalBody: messageData.body,
                generatedReply: aiReply,
                date: messageData.date
              },
              draft.id
            );
            console.log(`📱 WhatsApp notification sent for auto-scan draft`);
          }

          // Wait 21 seconds between OpenAI calls
          if (i < Math.min(messages.length, maxEmails) - 1) {
            await new Promise(resolve => setTimeout(resolve, 21000));
          }
        }

        // Update last scan time
        await User.update({ lastAutoScan: now }, { where: { id: user.id } });
        console.log(`✅ Auto-scan complete for ${user.email}: ${draftsCreated} drafts created`);

      } catch (userError) {
        console.error(`❌ Auto-scan error for user ${user.email}:`, userError.message);
      }
    }

  } catch (error) {
    console.error('❌ Auto-scan cron error:', error);
  }
};

// Run auto-scan every minute
cron.schedule('* * * * *', () => {
  runAutoScan();
});

console.log('⏰ Auto-scan cron job scheduled (runs every minute)');
// ═══════════════════════════════════════════════════════════════════════════

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




























































