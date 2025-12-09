// File: routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const authMiddleware = require('../middleware/auth');

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user exists
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

    // Generate token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      user: { id: user.id, email: user.email, name: user.name } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN
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

    // Generate token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      user: { id: user.id, email: user.email, name: user.name } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET PROFILE
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Helper to check if Gmail is connected (checks for tokens)
    const gmailConnected = !!(user.gmailAccessToken && user.gmailRefreshToken);
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      whatsappNumber: user.whatsappNumber,
      emailPreferences: user.emailPreferences,
      gmailConnected: gmailConnected,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// UPDATE PROFILE
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, whatsappNumber, emailPreferences } = req.body;
    const updateData = {};
    
    if (name && name.trim()) updateData.name = name.trim();
    
    if (whatsappNumber !== undefined) {
      updateData.whatsappNumber = whatsappNumber && whatsappNumber.trim() !== '' 
        ? whatsappNumber.trim() 
        : null;
    }
    
    if (emailPreferences) updateData.emailPreferences = emailPreferences;
    
    if (Object.keys(updateData).length > 0) {
      await User.update(updateData, { where: { id: req.user.id } });
    }
    
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
