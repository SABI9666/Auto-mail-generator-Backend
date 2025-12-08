const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const gmailService = require('../services/gmailService');
const authMiddleware = require('../middleware/auth');

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = await User.create({ 
      email, 
      password: hashedPassword, 
      name 
    });

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name 
      } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { 
        exclude: ['password', 'gmailAccessToken', 'gmailRefreshToken'] 
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, whatsappNumber, emailPreferences } = req.body;
    
    await User.update(
      { name, whatsappNumber, emailPreferences }, 
      { where: { id: req.user.id } }
    );
    
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get Gmail OAuth URL
router.get('/gmail/url', authMiddleware, (req, res) => {
  try {
    // Encode userId in state parameter for callback
    const state = Buffer.from(req.user.id.toString()).toString('base64');
    const url = gmailService.getAuthUrl(state);
    
    res.json({ url });
  } catch (error) {
    console.error('Gmail URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate Gmail auth URL' });
  }
});

// Gmail OAuth callback
router.get('/gmail/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    // Validate code parameter
    if (!code) {
      console.error('No code provided in Gmail callback');
      return res.redirect(`${process.env.FRONTEND_URL}/settings?error=no_code`);
    }
    
    // Validate and decode state parameter (contains userId)
    let userId;
    try {
      if (!state) {
        throw new Error('No state parameter');
      }
      userId = Buffer.from(state, 'base64').toString('utf8');
    } catch (e) {
      console.error('Invalid state parameter:', e);
      return res.redirect(`${process.env.FRONTEND_URL}/settings?error=invalid_state`);
    }
    
    // Exchange authorization code for tokens
    console.log('Exchanging code for tokens...');
    const tokens = await gmailService.getTokens(code);
    
    if (!tokens || !tokens.access_token) {
      throw new Error('Failed to obtain tokens');
    }
    
    console.log('Tokens received, saving to database...');
    
    // Save tokens to database
    await User.update(
      { 
        gmailAccessToken: tokens.access_token,
        gmailRefreshToken: tokens.refresh_token,
        gmailTokenExpiry: tokens.expiry_date 
          ? new Date(tokens.expiry_date) 
          : new Date(Date.now() + 3600 * 1000) // Default 1 hour
      },
      { where: { id: userId } }
    );
    
    console.log('✅ Gmail tokens saved successfully for user:', userId);
    
    // Redirect back to frontend with success
    res.redirect(`${process.env.FRONTEND_URL}/settings?gmail=connected`);
    
  } catch (error) {
    console.error('❌ Gmail OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?error=gmail_failed`);
  }
});

// Disconnect Gmail
router.delete('/gmail/disconnect', authMiddleware, async (req, res) => {
  try {
    await User.update(
      { 
        gmailAccessToken: null,
        gmailRefreshToken: null,
        gmailTokenExpiry: null
      },
      { where: { id: req.user.id } }
    );
    
    res.json({ success: true, message: 'Gmail disconnected successfully' });
  } catch (error) {
    console.error('Gmail disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
});

module.exports = router;

📄 NOW UPDATE gmailService.js
Your backend/services/gmailService.js needs to accept the state parameter.
Update the getAuthUrl function:
javascriptconst { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

const getAuthUrl = (state) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ],
    state: state,  // Pass state parameter
    prompt: 'consent'  // Force consent screen to get refresh token
  });
};

const getTokens = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

module.exports = {
  oauth2Client,
  getAuthUrl,
  getTokens
};
