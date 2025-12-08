const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const gmailService = require('../services/gmailService');
const authMiddleware = require('../middleware/auth');

// Register and Login routes remain unchanged...
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

// --- FIX STARTS HERE ---
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // 1. We REMOVED the "attributes: { exclude: ... }" part.
    // We must fetch the tokens so the model can calculate 'isGmailConnected'.
    const user = await User.findByPk(req.user.id);
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 2. The User model's .toJSON() method (in models/User.js) will automatically 
    // remove the sensitive tokens before sending the response, 
    // but it WILL keep the 'isGmailConnected' virtual field.
    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});
// --- FIX ENDS HERE ---

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, whatsappNumber, emailPreferences } = req.body;
    await User.update({ name, whatsappNumber, emailPreferences }, { where: { id: req.user.id } });
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/gmail/url', authMiddleware, (req, res) => {
  try {
    // Ensure state is generated safely
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
      // Decode the userId from the state parameter
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
    
    // Redirect back to frontend
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
