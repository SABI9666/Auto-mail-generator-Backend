const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const emailController = require('../controllers/emailController');

// Get all drafts with filters
router.get('/', authMiddleware, emailController.getAllDrafts);

// Get pending drafts
router.get('/pending', authMiddleware, emailController.getPendingDrafts);

// Get single draft by ID (for WhatsApp direct link)
router.get('/:draftId', authMiddleware, emailController.getDraft);

// Approve draft
router.post('/:draftId/approve', authMiddleware, emailController.approveDraft);

// Reject draft
router.post('/:draftId/reject', authMiddleware, emailController.rejectDraft);

// Edit and send draft
router.post('/:draftId/edit', authMiddleware, emailController.editDraft);

module.exports = router;
