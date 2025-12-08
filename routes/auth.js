const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const gmailService = require('../services/gmailService');
const authMiddleware = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword, name });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Add gmailConnected boolean and exclude sensitive token data
    const userProfile = {
      id: user.id,
      email: user.email,
      name: user.name,
      whatsappNumber: user.whatsappNumber,
      emailPreferences: user.emailPreferences,
      gmailConnected: !!(user.gmailAccessToken && user.gmailRefreshToken),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
    res.json(userProfile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, whatsappNumber, emailPreferences } = req.body;
    
    // Build update object - only include non-empty values
    const updateData = {};
    
    if (name && name.trim() !== '') {
      updateData.name = name.trim();
    }
    
    if (whatsappNumber !== undefined) {
      // Allow null/empty to clear the number
      updateData.whatsappNumber = whatsappNumber && whatsappNumber.trim() !== '' 
        ? whatsappNumber.trim() 
        : null;
    }
    
    if (emailPreferences) {
      updateData.emailPreferences = emailPreferences;
    }
    
    // Only update if there's something to update
    if (Object.keys(updateData).length > 0) {
      await User.update(updateData, { where: { id: req.user.id } });
    }
    
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile', message: error.message });
  }
});

router.get('/gmail/status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const isConnected = !!(user.gmailAccessToken && user.gmailRefreshToken);
    res.json({ 
      connected: isConnected,
      email: isConnected ? user.email : null
    });
  } catch (error) {
    console.error('Gmail status check error:', error);
    res.status(500).json({ error: 'Failed to check Gmail status' });
  }
});

router.get('/gmail/url', authMiddleware, (req, res) => {
  try {
    const state = Buffer.from(req.user.id.toString()).toString('base64');
    const url = gmailService.getAuthUrl(state);
    res.json({ url });
  } catch (error) {
    console.error('Gmail URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate Gmail auth URL' });
  }
});

router.get('/gmail/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) {
      console.error('No code provided in Gmail callback');
      return res.redirect(`${process.env.FRONTEND_URL}/settings?error=no_code`);
    }
    let userId;
    try {
      if (!state) throw new Error('No state parameter');
      userId = Buffer.from(state, 'base64').toString('utf8');
    } catch (e) {
      console.error('Invalid state parameter:', e);
      return res.redirect(`${process.env.FRONTEND_URL}/settings?error=invalid_state`);
    }
    console.log('Exchanging code for tokens...');
    const tokens = await gmailService.getTokens(code);
    if (!tokens || !tokens.access_token) {
      throw new Error('Failed to obtain tokens');
    }
    console.log('Tokens received, saving to database for user:', userId);
    await User.update(
      { 
        gmailAccessToken: tokens.access_token,
        gmailRefreshToken: tokens.refresh_token,
        gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000)
      },
      { where: { id: userId } }
    );
    console.log('Gmail tokens saved successfully');
    res.redirect(`${process.env.FRONTEND_URL}/settings?gmail=connected`);
  } catch (error) {
    console.error('Gmail OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?error=gmail_failed`);
  }
});

router.delete('/gmail/disconnect', authMiddleware, async (req, res) => {
  try {
    await User.update(
      { gmailAccessToken: null, gmailRefreshToken: null, gmailTokenExpiry: null },
      { where: { id: req.user.id } }
    );
    res.json({ success: true, message: 'Gmail disconnected successfully' });
  } catch (error) {
    console.error('Gmail disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Gmail' });
  }
});

module.exports = router;




































