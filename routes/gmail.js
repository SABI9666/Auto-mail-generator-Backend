const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const gmailController = require('../controllers/gmailController');

// Get Gmail OAuth URL
router.get('/auth-url', authMiddleware, gmailController.getAuthUrl);

// Gmail OAuth callback
router.get('/callback', authMiddleware, gmailController.oauthCallback);

// Disconnect Gmail
router.post('/disconnect', authMiddleware, gmailController.disconnect);

// Get Gmail connection status
router.get('/status', authMiddleware, gmailController.getStatus);

module.exports = router;
