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

      const messages = await gmailService.listUnreadMessages(user.gmailAccessToken);
      const draftsCreated = [];

      for (const message of messages) {
        const emailData = await gmailService.getMessage(user.gmailAccessToken, message.id);

        const existingDraft = await Draft.findOne({
          where: { userId: user.id, originalEmailId: emailData.id }
        });

        if (existingDraft) continue;

        const draftBody = await openaiService.generateReply(emailData, user.emailPreferences);

        const draft = await Draft.create({
          userId: user.id,
          emailProvider: 'gmail',
          originalEmailId: emailData.id,
          threadId: emailData.threadId,
          senderEmail: emailData.from,
          subject: emailData.subject,
          originalBody: emailData.body,
          draftBody: draftBody,
          status: 'pending'
        });

        if (user.whatsappNumber) {
          const messageSid = await whatsappService.sendDraftApproval(user.whatsappNumber, draft);
          draft.whatsappMessageSid = messageSid;
          await draft.save();
        }

        await EmailLog.create({
          userId: user.id,
          draftId: draft.id,
          action: 'draft_created',
          emailProvider: 'gmail'
        });

        draftsCreated.push(draft);
      }

      res.json({ success: true, draftsCreated: draftsCreated.length, drafts: draftsCreated });
    } catch (error) {
      console.error('Scan Error:', error);
      res.status(500).json({ error: 'Failed to scan inbox' });
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

      await gmailService.sendReply(
        user.gmailAccessToken,
        draft.senderEmail,
        draft.subject,
        draft.draftBody,
        draft.threadId
      );

      await gmailService.markAsRead(user.gmailAccessToken, draft.originalEmailId);

      draft.status = 'sent';
      draft.sentAt = new Date();
      await draft.save();

      if (user.whatsappNumber) {
        await whatsappService.sendConfirmation(user.whatsappNumber, 'sent', draft.id);
      }

      await EmailLog.create({
        userId: user.id,
        draftId: draft.id,
        action: 'sent',
        emailProvider: 'gmail'
      });

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
        await whatsappService.sendConfirmation(user.whatsappNumber, 'rejected', draft.id);
      }

      await EmailLog.create({
        userId: user.id,
        draftId: draft.id,
        action: 'rejected',
        emailProvider: 'gmail'
      });

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

      await gmailService.sendReply(
        user.gmailAccessToken,
        draft.senderEmail,
        draft.subject,
        editedBody,
        draft.threadId
      );

      await gmailService.markAsRead(user.gmailAccessToken, draft.originalEmailId);

      draft.status = 'edited';
      draft.editedBody = editedBody;
      draft.sentAt = new Date();
      await draft.save();

      if (user.whatsappNumber) {
        await whatsappService.sendConfirmation(user.whatsappNumber, 'edited', draft.id);
      }

      await EmailLog.create({
        userId: user.id,
        draftId: draft.id,
        action: 'sent',
        emailProvider: 'gmail'
      });

      res.json({ success: true, message: 'Edited email sent' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send edited email' });
    }
  }
}

module.exports = new EmailController();
