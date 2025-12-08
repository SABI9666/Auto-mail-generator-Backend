const express = require('express');
const router = express.Router();
const { Draft, User } = require('../models');
const { Op } = require('sequelize');
const authMiddleware = require('../middleware/auth');

// Get dashboard statistics
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);

    // Get counts
    const totalDrafts = await Draft.count({ where: { userId } });
    const pendingDrafts = await Draft.count({ where: { userId, status: 'pending' } });
    const sentEmails = await Draft.count({ where: { userId, status: 'sent' } });
    const rejectedDrafts = await Draft.count({ where: { userId, status: 'rejected' } });

    // Get recent drafts (last 10)
    const recentDrafts = await Draft.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // Calculate stats for last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyStats = {
      draftsCreated: await Draft.count({
        where: {
          userId,
          createdAt: { [Op.gte]: sevenDaysAgo }
        }
      }),
      emailsSent: await Draft.count({
        where: {
          userId,
          status: 'sent',
          sentAt: { [Op.gte]: sevenDaysAgo }
        }
      })
    };

    // Check Gmail connection status
    const gmailConnected = !!(user.gmailAccessToken && user.gmailRefreshToken);

    res.json({
      totalDrafts,
      pendingDrafts,
      sentEmails,
      rejectedDrafts,
      recentDrafts,
      weeklyStats,
      gmailConnected,
      user: {
        name: user.name,
        email: user.email,
        whatsappNumber: user.whatsappNumber
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get drafts statistics by status
router.get('/drafts', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = {
      pending: await Draft.count({ where: { userId, status: 'pending' } }),
      sent: await Draft.count({ where: { userId, status: 'sent' } }),
      rejected: await Draft.count({ where: { userId, status: 'rejected' } }),
      total: await Draft.count({ where: { userId } })
    };

    res.json(stats);
  } catch (error) {
    console.error('Draft stats error:', error);
    res.status(500).json({ error: 'Failed to fetch draft statistics' });
  }
});

// Get email activity timeline
router.get('/timeline', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 7 } = req.query;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const drafts = await Draft.findAll({
      where: {
        userId,
        createdAt: { [Op.gte]: startDate }
      },
      order: [['createdAt', 'DESC']]
    });

    // Group by date
    const timeline = {};
    drafts.forEach(draft => {
      const date = draft.createdAt.toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = { created: 0, sent: 0, rejected: 0 };
      }
      timeline[date].created++;
      if (draft.status === 'sent') timeline[date].sent++;
      if (draft.status === 'rejected') timeline[date].rejected++;
    });

    res.json(timeline);
  } catch (error) {
    console.error('Timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

module.exports = router;
