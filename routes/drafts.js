const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const emailController = require('../controllers/emailController');

router.get('/pending', authMiddleware, emailController.getPendingDrafts);
router.post('/:draftId/approve', authMiddleware, emailController.approveDraft);
router.post('/:draftId/reject', authMiddleware, emailController.rejectDraft);
router.post('/:draftId/edit', authMiddleware, emailController.editDraft);

module.exports = router;
