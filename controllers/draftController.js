const gmailService = require('../services/gmailService');
const twilioService = require('../services/twilioService');
const { Draft, User } = require('../models');

class DraftController {
  
  // Create draft from incoming email
  async createDraft(userId, emailMessage, generatedReply) {
    try {
      // IMPORTANT: Store the original messageId and references for threading
      const draft = await Draft.create({
        userId: userId,
        originalEmailId: emailMessage.id,
        threadId: emailMessage.threadId,
        messageId: emailMessage.messageId,      // CRITICAL: Original Message-ID header
        references: emailMessage.references,     // CRITICAL: References chain
        from: emailMessage.from,
        to: emailMessage.to,
        subject: emailMessage.subject,
        originalBody: emailMessage.body,
        generatedReply: generatedReply,
        status: 'pending',
        createdAt: new Date()
      });

      // Send WhatsApp notification
      const user = await User.findByPk(userId);
      if (user && user.whatsappNumber) {
        await twilioService.sendDraftNotification(
          user.whatsappNumber,
          {
            from: emailMessage.from,
            subject: emailMessage.subject,
            originalBody: emailMessage.body,
            generatedReply: generatedReply,
            date: emailMessage.date
          },
          draft.id
        );
      }

      return draft;
    } catch (error) {
      console.error('Error creating draft:', error);
      throw error;
    }
  }

  // FIXED: Approve draft and send as THREADED REPLY
  async approveDraft(draftId, userId) {
    try {
      const draft = await Draft.findOne({
        where: { id: draftId, userId: userId }
      });

      if (!draft) {
        throw new Error('Draft not found');
      }

      if (draft.status !== 'pending') {
        throw new Error('Draft already processed');
      }

      // Extract sender email for reply
      const replyTo = this.extractEmail(draft.from);
      
      // Prepare subject with Re: prefix if needed
      let subject = draft.subject || '';
      if (!subject.toLowerCase().startsWith('re:')) {
        subject = `Re: ${subject}`;
      }

      // CRITICAL: Send reply with proper threading headers
      const sentEmail = await gmailService.sendReply(userId, {
        to: replyTo,
        subject: subject,
        body: draft.generatedReply,
        threadId: draft.threadId,           // Gmail thread ID
        inReplyTo: draft.messageId,         // Original Message-ID header
        references: draft.references        // References chain
      });

      // Update draft status
      await draft.update({
        status: 'sent',
        sentAt: new Date(),
        sentEmailId: sentEmail.id
      });

      // Send confirmation via WhatsApp
      const user = await User.findByPk(userId);
      if (user && user.whatsappNumber) {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'sent',
          {
            to: replyTo,
            subject: subject
          }
        );
      }

      console.log('✅ Reply sent successfully as threaded message');
      return { success: true, emailId: sentEmail.id };
    } catch (error) {
      console.error('Error approving draft:', error);
      throw error;
    }
  }

  // Edit and send draft
  async editAndSendDraft(draftId, userId, editedContent) {
    try {
      const draft = await Draft.findOne({
        where: { id: draftId, userId: userId }
      });

      if (!draft) {
        throw new Error('Draft not found');
      }

      if (draft.status !== 'pending') {
        throw new Error('Draft already processed');
      }

      const replyTo = this.extractEmail(draft.from);
      
      let subject = draft.subject || '';
      if (!subject.toLowerCase().startsWith('re:')) {
        subject = `Re: ${subject}`;
      }

      // Send edited reply with proper threading
      const sentEmail = await gmailService.sendReply(userId, {
        to: replyTo,
        subject: subject,
        body: editedContent,
        threadId: draft.threadId,
        inReplyTo: draft.messageId,
        references: draft.references
      });

      await draft.update({
        status: 'edited',
        editedReply: editedContent,
        sentAt: new Date(),
        sentEmailId: sentEmail.id
      });

      const user = await User.findByPk(userId);
      if (user && user.whatsappNumber) {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'edited',
          {
            to: replyTo,
            subject: subject
          }
        );
      }

      return { success: true, emailId: sentEmail.id };
    } catch (error) {
      console.error('Error editing draft:', error);
      throw error;
    }
  }

  // Reject draft
  async rejectDraft(draftId, userId) {
    try {
      const draft = await Draft.findOne({
        where: { id: draftId, userId: userId }
      });

      if (!draft) {
        throw new Error('Draft not found');
      }

      await draft.update({
        status: 'rejected',
        rejectedAt: new Date()
      });

      const user = await User.findByPk(userId);
      if (user && user.whatsappNumber) {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'rejected',
          {
            subject: draft.subject
          }
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error rejecting draft:', error);
      throw error;
    }
  }

  // Helper: Extract email from "Name <email>" format
  extractEmail(from) {
    if (!from) return '';
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
  }
}

module.exports = new DraftController();




