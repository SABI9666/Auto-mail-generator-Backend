const gmailService = require('../services/gmailService');
const openaiService = require('../services/openaiService');
const whatsappService = require('../services/whatsappService');
const { Draft, EmailLog, User } = require('../models');

class EmailController {
  async scanInbox(req, res) {
    try {
      const user = await User.findByPk(req.user.id);
      
      if (!user.gmailAccessToken) {
        return res.status(400).json({ error: 'Gmail not connected' });
      }

      const messages = await gmailService.listUnreadMessages(user.id);
      const draftsCreated = [];

      for (const message of messages) {
        const emailData = await gmailService.getMessage(user.id, message.id);

        // FIX: Use emailId instead of originalEmailId
        const existingDraft = await Draft.findOne({
          where: { userId: user.id, emailId: emailData.id }
        });

        if (existingDraft) continue;

        const draftBody = await openaiService.generateReply(emailData, user.emailPreferences);

        // FIX: Match Draft model field names
        const draft = await Draft.create({
          userId: user.id,
          emailId: emailData.id,              // NOT originalEmailId
          threadId: emailData.threadId,
          from: emailData.to,                  // from = our email
          to: emailData.from,                  // to = sender's email (reply to)
          subject: emailData.subject,
          originalBody: emailData.body,
          generatedReply: draftBody,          // NOT draftBody
          status: 'pending'
        });

        if (user.whatsappNumber) {
          try {
            const messageSid = await whatsappService.sendDraftApproval(user.whatsappNumber, draft);
            // Note: Draft model doesn't have whatsappMessageSid field
            console.log('WhatsApp message sent:', messageSid);
          } catch (err) {
            console.error('WhatsApp error:', err);
          }
        }

        if (EmailLog) {
          await EmailLog.create({
            userId: user.id,
            draftId: draft.id,
            action: 'draft_created',
            emailProvider: 'gmail'
          });
        }

        draftsCreated.push(draft);
      }

      res.json({ success: true, draftsCreated: draftsCreated.length, drafts: draftsCreated });
    } catch (error) {
      console.error('Scan Error:', error);
      res.status(500).json({ error: 'Failed to scan inbox', message: error.message });
    }
  }

  async getPendingDrafts(req, res) {
    try {
      const drafts = await Draft.findAll({
        where: { userId: req.user.id, status: 'pending' },
        order: [['createdAt', 'DESC']]
      });
      res.json({ success: true, drafts });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve drafts' });
    }
  }

  async approveDraft(req, res) {
    try {
      const { draftId } = req.params;
      const draft = await Draft.findOne({ where: { id: draftId, userId: req.user.id } });

      if (!draft) return res.status(404).json({ error: 'Draft not found' });

      const user = await User.findByPk(req.user.id);

      // Send email using generatedReply field
      await gmailService.sendEmail(user.id, {
        to: draft.to,
        subject: draft.subject,
        body: draft.generatedReply,
        threadId: draft.threadId
      });

      // Mark original email as read
      await gmailService.markAsRead(user.id, draft.emailId);

      draft.status = 'sent';
      draft.sentAt = new Date();
      await draft.save();

      if (user.whatsappNumber) {
        try {
          await whatsappService.sendConfirmation(user.whatsappNumber, 'sent', draft.id);
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

      res.json({ success: true, message: 'Email sent successfully' });
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
      draft.generatedReply = editedBody; // Update with edited version
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

      res.json({ success: true, message: 'Edited email sent' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send edited email' });
    }
  }
}

module.exports = new EmailController();


























