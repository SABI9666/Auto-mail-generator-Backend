const gmailService = require('../services/gmailService');
const openaiService = require('../services/openaiService');
const whatsappService = require('../services/whatsappService');
const { Draft, EmailLog, User } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

// Helper function to get date range based on period
const getDateRange = (period) => {
  const now = new Date();
  let startDate;
  
  switch(period) {
    case 'day':
      startDate = new Date(now - 24 * 60 * 60 * 1000); // Last 24 hours
      break;
    case 'week':
      startDate = new Date(now - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      break;
    case 'month':
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      break;
    default:
      startDate = new Date(now - 24 * 60 * 60 * 1000); // Default to day
  }
  
  return startDate;
};

class EmailController {
  async scanInbox(req, res) {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user || !user.gmailAccessToken) {
        return res.status(400).json({ error: 'Gmail not connected' });
      }

      // Get period from query params (day, week, month)
      const period = req.query.period || 'day';
      const startDate = getDateRange(period);
      
      // Build search query for Gmail
      const searchQuery = `is:unread after:${Math.floor(startDate.getTime() / 1000)}`;

      const messages = await gmailService.listUnreadMessages(user.id, {
        q: searchQuery,
        maxResults: 20
      });
      
      if (!messages || messages.length === 0) {
        return res.json({ 
          success: true,
          message: `No unread emails found in the last ${period}`,
          draftsCreated: 0,
          drafts: []
        });
      }

      const draftsCreated = [];

      for (const message of messages) {
        try {
          const emailData = await gmailService.getMessage(user.id, message.id);

          // Check if draft already exists
          const existingDraft = await Draft.findOne({
            where: { userId: user.id, emailId: emailData.id }
          });

          if (existingDraft) continue;

          // Generate AI reply
          const draftBody = await openaiService.generateReply(emailData, user.emailPreferences);

          // Generate approval token
          const approvalToken = crypto.randomBytes(16).toString('hex');

          // Create draft
          const draft = await Draft.create({
            userId: user.id,
            emailId: emailData.id,
            threadId: emailData.threadId,
            from: emailData.to,
            to: emailData.from,
            subject: emailData.subject.startsWith('Re:') ? emailData.subject : `Re: ${emailData.subject}`,
            originalBody: emailData.body,
            generatedReply: draftBody,
            status: 'pending',
            approvalToken
          });

          draftsCreated.push(draft);

          // Send WhatsApp notification
          if (user.whatsappNumber) {
            try {
              await whatsappService.sendDraftApproval(user.whatsappNumber, draft);
              console.log('WhatsApp notification sent for draft:', draft.id);
            } catch (err) {
              console.error('WhatsApp error:', err);
            }
          }

          // Log the action
          if (EmailLog) {
            await EmailLog.create({
              userId: user.id,
              draftId: draft.id,
              action: 'draft_created',
              emailProvider: 'gmail'
            });
          }
        } catch (messageError) {
          console.error('Error processing message:', messageError);
          // Continue with next message
        }
      }

      res.json({ 
        success: true, 
        message: `Scanned ${messages.length} emails from the last ${period}`,
        draftsCreated: draftsCreated.length, 
        drafts: draftsCreated.map(d => ({
          id: d.id,
          from: d.to,
          subject: d.subject,
          status: d.status,
          createdAt: d.createdAt
        }))
      });
    } catch (error) {
      console.error('Scan Error:', error);
      res.status(500).json({ error: 'Failed to scan inbox', message: error.message });
    }
  }

  async getPendingDrafts(req, res) {
    try {
      const period = req.query.period;
      
      const where = { 
        userId: req.user.id, 
        status: 'pending'
      };
      
      // Add date filter if period is specified
      if (period) {
        const startDate = getDateRange(period);
        where.createdAt = { [Op.gte]: startDate };
      }

      const drafts = await Draft.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });

      res.json({ success: true, count: drafts.length, drafts });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve drafts' });
    }
  }

  async getAllDrafts(req, res) {
    try {
      const { status, period } = req.query;
      
      const where = { userId: req.user.id };
      
      // Add status filter
      if (status) {
        where.status = status;
      }
      
      // Add date filter
      if (period) {
        const startDate = getDateRange(period);
        where.createdAt = { [Op.gte]: startDate };
      }

      const drafts = await Draft.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });

      res.json({ success: true, count: drafts.length, drafts });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve drafts' });
    }
  }

  async getDraft(req, res) {
    try {
      const { draftId } = req.params;
      const draft = await Draft.findOne({
        where: { id: draftId, userId: req.user.id }
      });

      if (!draft) {
        return res.status(404).json({ error: 'Draft not found' });
      }

      res.json({ success: true, draft });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve draft' });
    }
  }

  async approveDraft(req, res) {
    try {
      const { draftId } = req.params;
      const draft = await Draft.findOne({ where: { id: draftId, userId: req.user.id } });

      if (!draft) return res.status(404).json({ error: 'Draft not found' });

      const user = await User.findByPk(req.user.id);

      // Send email
      await gmailService.sendEmail(user.id, {
        to: draft.to,
        subject: draft.subject,
        body: draft.generatedReply,
        threadId: draft.threadId
      });

      // Mark original email as read
      await gmailService.markAsRead(user.id, draft.emailId);

      // Update draft status
      draft.status = 'sent';
      draft.sentAt = new Date();
      await draft.save();

      // Send WhatsApp confirmation
      if (user.whatsappNumber) {
        try {
          await whatsappService.sendConfirmation(user.whatsappNumber, 'sent', draft.id);
        } catch (err) {
          console.error('WhatsApp error:', err);
        }
      }

      // Log the action
      if (EmailLog) {
        await EmailLog.create({
          userId: user.id,
          draftId: draft.id,
          action: 'sent',
          emailProvider: 'gmail'
        });
      }

      res.json({ success: true, message: 'Email sent successfully', draft });
    } catch (error) {
      console.error('Approve Error:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  }

  async rejectDraft(req, res) {
    try {
      const { draftId } = req.params;
      const draft = await Draft.findOne({ where: { id: draftId, userId: req.user.id } });

      if (!draft) return res.status(404).json({ error: 'Draft not found' });

      draft.status = 'rejected';
      await draft.save();

      const user = await User.findByPk(req.user.id);
      if (user.whatsappNumber) {
        try {
          await whatsappService.sendConfirmation(user.whatsappNumber, 'rejected', draft.id);
        } catch (err) {
          console.error('WhatsApp error:', err);
        }
      }

      if (EmailLog) {
        await EmailLog.create({
          userId: user.id,
          draftId: draft.id,
          action: 'rejected',
          emailProvider: 'gmail'
        });
      }

      res.json({ success: true, message: 'Draft rejected' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reject draft' });
    }
  }

  async editDraft(req, res) {
    try {
      const { draftId } = req.params;
      const { editedBody } = req.body;

      const draft = await Draft.findOne({ where: { id: draftId, userId: req.user.id } });
      if (!draft) return res.status(404).json({ error: 'Draft not found' });

      const user = await User.findByPk(req.user.id);

      // Send edited email
      await gmailService.sendEmail(user.id, {
        to: draft.to,
        subject: draft.subject,
        body: editedBody,
        threadId: draft.threadId
      });

      // Mark original email as read
      await gmailService.markAsRead(user.id, draft.emailId);

      draft.status = 'edited';
      draft.generatedReply = editedBody;
      draft.sentAt = new Date();
      await draft.save();

      if (user.whatsappNumber) {
        try {
          await whatsappService.sendConfirmation(user.whatsappNumber, 'edited', draft.id);
        } catch (err) {
          console.error('WhatsApp error:', err);
        }
      }

      if (EmailLog) {
        await EmailLog.create({
          userId: user.id,
          draftId: draft.id,
          action: 'sent',
          emailProvider: 'gmail'
        });
      }

      res.json({ success: true, message: 'Edited email sent', draft });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send edited email' });
    }
  }
}

module.exports = new EmailController();






























