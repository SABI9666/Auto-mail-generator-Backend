const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const emailController = require('../controllers/emailController');

router.post('/scan', authMiddleware, emailController.scanInbox);

module.exports = router;
