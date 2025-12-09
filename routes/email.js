const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const emailController = require('../controllers/emailController');
const { User } = require('../models');

// Scan inbox for new emails (Manual Scan)
router.post('/scan', authMiddleware, emailController.scanInbox);

// Get all drafts with filters
router.get('/drafts', authMiddleware, emailController.getAllDrafts);

// Get pending drafts
router.get('/drafts/pending', authMiddleware, emailController.getPendingDrafts);

// Get single draft by ID
router.get('/drafts/:draftId', authMiddleware, emailController.getDraft);

// Approve draft
router.post('/drafts/:draftId/approve', authMiddleware, emailController.approveDraft);

// Reject draft
router.post('/drafts/:draftId/reject', authMiddleware, emailController.rejectDraft);

// Edit and send draft
router.post('/drafts/:draftId/edit', authMiddleware, emailController.editDraft);

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-SCAN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// Get auto-scan settings
router.get('/auto-scan/settings', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      autoScanEnabled: user.autoScanEnabled,
      autoScanInterval: user.autoScanInterval,
      lastAutoScan: user.lastAutoScan
    });
  } catch (error) {
    console.error('Get auto-scan settings error:', error);
    res.status(500).json({ error: 'Failed to get auto-scan settings' });
  }
});

// Toggle auto-scan on/off
router.post('/auto-scan/toggle', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if Gmail is connected
    if (!user.gmailAccessToken || !user.gmailRefreshToken) {
      return res.status(400).json({ error: 'Please connect Gmail first' });
    }

    // Check if WhatsApp number is set (required for auto-scan notifications)
    if (!user.whatsappNumber) {
      return res.status(400).json({ error: 'Please set WhatsApp number in Settings for auto-scan notifications' });
    }

    // Toggle auto-scan
    const newStatus = !user.autoScanEnabled;
    await User.update(
      { autoScanEnabled: newStatus },
      { where: { id: user.id } }
    );

    console.log(`🔄 Auto-scan ${newStatus ? 'ENABLED' : 'DISABLED'} for user: ${user.email}`);

    res.json({
      success: true,
      autoScanEnabled: newStatus,
      message: newStatus ? 'Auto-scan enabled' : 'Auto-scan disabled'
    });
  } catch (error) {
    console.error('Toggle auto-scan error:', error);
    res.status(500).json({ error: 'Failed to toggle auto-scan' });
  }
});

// Update auto-scan interval
router.put('/auto-scan/interval', authMiddleware, async (req, res) => {
  try {
    const { interval } = req.body;
    
    // Validate interval (1-60 minutes)
    if (!interval || interval < 1 || interval > 60) {
      return res.status(400).json({ error: 'Interval must be between 1 and 60 minutes' });
    }

    await User.update(
      { autoScanInterval: interval },
      { where: { id: req.user.id } }
    );

    console.log(`⏱️ Auto-scan interval updated to ${interval} minutes for user: ${req.user.id}`);

    res.json({
      success: true,
      autoScanInterval: interval,
      message: `Auto-scan interval set to ${interval} minutes`
    });
  } catch (error) {
    console.error('Update auto-scan interval error:', error);
    res.status(500).json({ error: 'Failed to update interval' });
  }
});

module.exports = router;




























































