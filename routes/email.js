const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const emailController = require('../controllers/emailController');

// Scan inbox for new emails
router.post('/scan', authMiddleware, emailController.scanInbox);

// Get all drafts with filters
router.get('/drafts', authMiddleware, emailController.getAllDrafts);

// Get pending drafts
router.get('/drafts/pending', authMiddleware, emailController.getPendingDrafts);

// Get single draft by ID (for WhatsApp direct link)
router.get('/drafts/:draftId', authMiddleware, emailController.getDraft);

// Approve draft
router.post('/drafts/:draftId/approve', authMiddleware, emailController.approveDraft);

// Reject draft
router.post('/drafts/:draftId/reject', authMiddleware, emailController.rejectDraft);

// Edit and send draft
router.post('/drafts/:draftId/edit', authMiddleware, emailController.editDraft);

module.exports = router;
