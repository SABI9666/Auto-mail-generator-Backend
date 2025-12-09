const gmailService = require('../services/gmailService');
const openaiService = require('../services/openaiService');
const twilioService = require('../services/twilioService');
const { Draft, User } = require('../models');
const { Op } = require('sequelize');

// Helper function to delay execution (for rate limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to get date range based on period
const getDateRange = (period) => {
  const now = new Date();
  switch (period) {
    case 'day':
      return new Date(now - 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now - 24 * 60 * 60 * 1000);
  }
};

// SCAN INBOX
const scanInbox = async (req, res) => {
  try {
    const userId = req.user.id;
    const period = req.query.period || 'day';
    const maxEmails = 10;
    const delayBetweenCalls = 21000;

    const user = await User.findByPk(userId);
    if (!user || !user.gmailAccessToken) {
      return res.status(400).json({ error: 'Gmail not connected' });
    }

    const startDate = getDateRange(period);
    console.log(`Scanning inbox for period: ${period}, from: ${startDate}`);

    const messages = await gmailService.listUnreadMessages(userId, startDate);
    
    if (!messages || messages.length === 0) {
      return res.json({ message: 'No new messages found', draftsCreated: 0 });
    }

    console.log(`Found ${messages.length} unread emails. Processing max ${maxEmails}...`);

    const messagesToProcess = messages.slice(0, maxEmails);
    let draftsCreated = 0;
    let errors = 0;

    for (let i = 0; i < messagesToProcess.length; i++) {
      try {
        const msg = messagesToProcess[i];
        
        const existingDraft = await Draft.findOne({ 
          where: { originalEmailId: msg.id, userId } 
        });
        
        if (existingDraft) {
          console.log(`Draft already exists for email ${msg.id}, skipping...`);
          continue;
        }

        const messageData = await gmailService.getMessage(userId, msg.id);

        console.log(`Generating AI reply for email ${i + 1}/${messagesToProcess.length}...`);
        const aiReply = await openaiService.generateReply(
          messageData.body,
          user.emailPreferences
        );
        console.log('✅ AI reply generated successfully');

        const draft = await Draft.create({
          userId: userId,
          originalEmailId: messageData.id,
          threadId: messageData.threadId,
          messageId: messageData.messageId,
          references: messageData.references,
          from: messageData.to,
          to: messageData.from,
          subject: `Re: ${messageData.subject}`,
          originalBody: messageData.body,
          generatedReply: aiReply,
          status: 'pending'
        });

        draftsCreated++;

        if (user.whatsappNumber) {
          try {
            const result = await twilioService.sendDraftNotification(
              user.whatsappNumber, 
              {
                from: messageData.from,
                subject: messageData.subject,
                originalBody: messageData.body,
                generatedReply: aiReply,
                to: messageData.to,
                date: messageData.date
              },
              draft.id
            );
            
            if (result.success) {
              console.log('✅ WhatsApp notification sent for draft:', draft.id);
            } else {
              console.log('⚠️ WhatsApp notification failed:', result.message || result.error);
            }
          } catch (whatsappError) {
            console.error('❌ WhatsApp error:', whatsappError.message);
          }
        }

        if (i < messagesToProcess.length - 1) {
          console.log(`Waiting 21 seconds before next email...`);
          await delay(delayBetweenCalls);
        }

      } catch (error) {
        console.error('Error processing message:', error);
        errors++;
      }
    }

    const skipped = messages.length - maxEmails;
    res.json({ 
      message: 'Inbox scan completed', 
      draftsCreated,
      errors,
      totalFound: messages.length,
      processed: messagesToProcess.length,
      skipped: skipped > 0 ? skipped : 0,
      note: skipped > 0 ? `Limited to ${maxEmails} emails. Run scan again for more.` : null
    });

  } catch (error) {
    console.error('Scan inbox error:', error);
    res.status(500).json({ error: 'Failed to scan inbox', message: error.message });
  }
};

// GET PENDING DRAFTS
const getPendingDrafts = async (req, res) => {
  try {
    const userId = req.user.id;
    const period = req.query.period || 'week';
    const startDate = getDateRange(period);

    const drafts = await Draft.findAll({
      where: {
        userId,
        status: 'pending',
        createdAt: { [Op.gte]: startDate }
      },
      order: [['createdAt', 'DESC']]
    });

    res.json(drafts);
  } catch (error) {
    console.error('Get pending drafts error:', error);
    res.status(500).json({ error: 'Failed to fetch pending drafts' });
  }
};

// GET ALL DRAFTS
const getAllDrafts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, period } = req.query;
    
    const where = { userId };
    
    if (status) {
      where.status = status;
    }
    
    if (period) {
      const startDate = getDateRange(period);
      where.createdAt = { [Op.gte]: startDate };
    }

    const drafts = await Draft.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.json(drafts);
  } catch (error) {
    console.error('Get drafts error:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
};

// GET SINGLE DRAFT
const getDraft = async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id;

    const draft = await Draft.findOne({
      where: { id: draftId, userId }
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    res.json(draft);
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
};

// APPROVE DRAFT
const approveDraft = async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id;

    const draft = await Draft.findOne({
      where: { id: draftId, userId }
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    const sentEmail = await gmailService.sendReply(userId, {
      to: draft.to,
      subject: draft.subject,
      body: draft.generatedReply,
      threadId: draft.threadId,
      inReplyTo: draft.messageId,
      references: draft.references
    });

    if (draft.originalEmailId) {
      await gmailService.markAsRead(userId, draft.originalEmailId);
    }

    draft.status = 'sent';
    draft.sentAt = new Date();
    draft.sentEmailId = sentEmail.id;
    await draft.save();

    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'sent',
          { to: draft.to, subject: draft.subject }
        );
      } catch (whatsappError) {
        console.error('❌ WhatsApp confirmation error:', whatsappError.message);
      }
    }

    console.log('✅ Reply sent as threaded message');
    res.json({ message: 'Draft approved and email sent', draft });
  } catch (error) {
    console.error('Approve draft error:', error);
    res.status(500).json({ error: 'Failed to approve draft', message: error.message });
  }
};

// REJECT DRAFT
const rejectDraft = async (req, res) => {
  try {
    const { draftId } = req.params;
    const userId = req.user.id;

    const draft = await Draft.findOne({
      where: { id: draftId, userId }
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    draft.status = 'rejected';
    draft.rejectedAt = new Date();
    await draft.save();

    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'rejected',
          { subject: draft.subject }
        );
      } catch (whatsappError) {
        console.error('❌ WhatsApp confirmation error:', whatsappError.message);
      }
    }

    res.json({ message: 'Draft rejected', draft });
  } catch (error) {
    console.error('Reject draft error:', error);
    res.status(500).json({ error: 'Failed to reject draft' });
  }
};

// EDIT AND SEND DRAFT
const editDraft = async (req, res) => {
  try {
    const { draftId } = req.params;
    const { editedBody } = req.body;
    const userId = req.user.id;

    const draft = await Draft.findOne({
      where: { id: draftId, userId }
    });

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    draft.editedReply = editedBody;
    await draft.save();

    const sentEmail = await gmailService.sendReply(userId, {
      to: draft.to,
      subject: draft.subject,
      body: editedBody,
      threadId: draft.threadId,
      inReplyTo: draft.messageId,
      references: draft.references
    });

    if (draft.originalEmailId) {
      await gmailService.markAsRead(userId, draft.originalEmailId);
    }

    draft.status = 'edited';
    draft.sentAt = new Date();
    draft.sentEmailId = sentEmail.id;
    await draft.save();

    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'edited',
          { to: draft.to, subject: draft.subject }
        );
      } catch (whatsappError) {
        console.error('❌ WhatsApp confirmation error:', whatsappError.message);
      }
    }

    console.log('✅ Edited reply sent as threaded message');
    res.json({ message: 'Draft edited and sent', draft });
  } catch (error) {
    console.error('Edit draft error:', error);
    res.status(500).json({ error: 'Failed to edit and send draft' });
  }
};

module.exports = {
  scanInbox,
  getPendingDrafts,
  getAllDrafts,
  getDraft,
  approveDraft,
  rejectDraft,
  editDraft
};














































