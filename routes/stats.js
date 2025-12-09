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

    // Get user to check Gmail connection
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check Gmail connection status - check BOTH tokens
    const gmailConnected = !!(user.gmailAccessToken && user.gmailRefreshToken);
    console.log('📧 Gmail connected:', gmailConnected);
    console.log('📧 Has access token:', !!user.gmailAccessToken);
    console.log('📧 Has refresh token:', !!user.gmailRefreshToken);

    // Get all drafts count
    const totalDrafts = await Draft.count({ where: { userId } });

    // Get pending drafts count
    const pendingDrafts = await Draft.count({ 
      where: { userId, status: 'pending' } 
    });

    // Get sent emails count
    const sentEmails = await Draft.count({ 
      where: { 
        userId, 
        status: { [Op.in]: ['sent', 'edited'] }
      } 
    });

    // Get rejected drafts count
    const rejectedDrafts = await Draft.count({ 
      where: { userId, status: 'rejected' } 
    });

    // Get weekly stats
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weeklyDraftsCreated = await Draft.count({
      where: {
        userId,
        createdAt: { [Op.gte]: oneWeekAgo }
      }
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
      gmailConnected
    };

    console.log('📊 Stats response:', JSON.stringify(statsData));
    res.json(statsData);

  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', message: error.message });
  }
});

module.exports = router;






















































