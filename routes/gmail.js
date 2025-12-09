// File: routes/gmail.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const gmailController = require('../controllers/gmailController');

// Define the routes that the frontend is trying to call
router.get('/auth-url', authMiddleware, gmailController.getAuthUrl);
router.get('/callback', authMiddleware, gmailController.oauthCallback);
router.post('/disconnect', authMiddleware, gmailController.disconnect);
router.get('/status', authMiddleware, gmailController.getStatus);

module.exports = router;
