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
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'gmailAccessToken', 'gmailRefreshToken'] }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, whatsappNumber, emailPreferences } = req.body;
    await User.update({ name, whatsappNumber, emailPreferences }, { where: { id: req.user.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/gmail/url', authMiddleware, (req, res) => {
  const url = gmailService.getAuthUrl();
  res.json({ url });
});

router.get('/gmail/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const tokens = await gmailService.getTokens(code);
    
    // You'll need to pass userId via state parameter in production
    // For now, just redirect with success
    res.redirect(`${process.env.FRONTEND_URL}/settings?success=gmail`);
  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/settings?error=gmail`);
  }
});

module.exports = router;
