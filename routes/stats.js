const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { Draft } = require('../models');
const { Op } = require('sequelize');

router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingDrafts = await Draft.count({ where: { userId, status: 'pending' } });
    const sentToday = await Draft.count({
      where: { userId, status: 'sent', sentAt: { [Op.gte]: today } }
    });
    const totalProcessed = await Draft.count({ where: { userId } });
    const totalApproved = await Draft.count({
      where: { userId, status: { [Op.in]: ['sent', 'approved'] } }
    });

    const approvalRate = totalProcessed > 0 ? Math.round((totalApproved / totalProcessed) * 100) : 0;

    res.json({ pendingDrafts, sentToday, totalProcessed, approvalRate });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
