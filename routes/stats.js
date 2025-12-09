const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { Draft, User } = require('../models');
const { Op } = require('sequelize');

// Get dashboard statistics
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📊 Loading stats for user:', userId);

    // Get user
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check Gmail connection
    const gmailConnected = !!(user.gmailAccessToken && user.gmailRefreshToken);

    // Get draft counts
    const totalDrafts = await Draft.count({ where: { userId } });
    const pendingDrafts = await Draft.count({ where: { userId, status: 'pending' } });
    const sentEmails = await Draft.count({ 
      where: { userId, status: { [Op.in]: ['sent', 'edited'] } } 
    });
    const rejectedDrafts = await Draft.count({ where: { userId, status: 'rejected' } });

    // Weekly stats
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weeklyDraftsCreated = await Draft.count({
      where: { userId, createdAt: { [Op.gte]: oneWeekAgo } }
    });

    const weeklyEmailsSent = await Draft.count({
      where: {
        userId,
        status: { [Op.in]: ['sent', 'edited'] },
        sentAt: { [Op.gte]: oneWeekAgo }
      }
    });

    const statsData = {
      totalDrafts,
      pendingDrafts,
      sentEmails,
      rejectedDrafts,
      weeklyStats: {
        draftsCreated: weeklyDraftsCreated,
        emailsSent: weeklyEmailsSent
      },
      gmailConnected,
      // Include auto-scan info
      autoScanEnabled: user.autoScanEnabled || false,
      autoScanInterval: user.autoScanInterval || 5,
      lastAutoScan: user.lastAutoScan
    };

    console.log('📊 Stats:', JSON.stringify(statsData));
    res.json(statsData);

  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
});

module.exports = router;




























































