// File: controllers/gmailController.js
const gmailService = require('../services/gmailService');
const { User } = require('../models');

const getAuthUrl = async (req, res) => {
  try {
    // We pass the userId as state to verify it later if needed, 
    // or simply to generate a unique URL
    const url = gmailService.getAuthUrl();
    res.json({ url });
  } catch (error) {
    console.error('Auth URL Error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

const oauthCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const userId = req.user.id; // From authMiddleware

    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    console.log(`🔄 Processing Gmail callback for user ${userId}`);

    // Exchange code for tokens
    const tokens = await gmailService.getTokens(code);

    // Update User with tokens
    await User.update({
      gmailAccessToken: tokens.access_token,
      gmailRefreshToken: tokens.refresh_token,
      gmailTokenExpiry: tokens.expiry_date,
      gmailConnected: true // Flag to show status in dashboard
    }, {
      where: { id: userId }
    });

    console.log('✅ Gmail connected successfully for user', userId);
    res.json({ success: true, message: 'Gmail connected successfully' });

  } catch (error) {
    console.error('Callback Error:', error);
    res.status(500).json({ error: 'Failed to connect Gmail account: ' + error.message });
  }
};

const disconnect = async (req, res) => {
  try {
    const userId = req.user.id;
    await User.update({
      gmailAccessToken: null,
      gmailRefreshToken: null,
      gmailTokenExpiry: null,
      gmailConnected: false
    }, {
      where: { id: userId }
    });
    
    res.json({ success: true, message: 'Gmail disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
};

const getStatus = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    res.json({ 
      connected: !!user.gmailAccessToken,
      email: user.email 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
};

module.exports = {
  getAuthUrl,
  oauthCallback,
  disconnect,
  getStatus
};
