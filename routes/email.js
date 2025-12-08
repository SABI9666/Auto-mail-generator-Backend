const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const emailController = require('../controllers/emailController');

// Scan inbox for unread emails
// Query params: ?period=day|week|month (optional, defaults to day)
router.post('/scan', authMiddleware, emailController.scanInbox);

// Get pending drafts
// Query params: ?period=day|week|month (optional, shows all by default)
router.get('/drafts/pending', authMiddleware, emailController.getPendingDrafts);

// Get all drafts with filtering
// Query params: ?status=pending|sent|rejected&period=day|week|month
router.get('/drafts', authMiddleware, emailController.getAllDrafts);

// Get single draft
router.get('/drafts/:draftId', authMiddleware, emailController.getDraft);

// Approve draft (send email)
router.post('/drafts/:draftId/approve', authMiddleware, emailController.approveDraft);

// Reject draft
router.post('/drafts/:draftId/reject', authMiddleware, emailController.rejectDraft);

// Edit and send draft
router.post('/drafts/:draftId/edit', authMiddleware, emailController.editDraft);

module.exports = router;































