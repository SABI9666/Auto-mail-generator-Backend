const gmailService = require('../services/gmailService');
const openaiService = require('../services/openaiService');
const twilioService = require('../services/twilioService');
const { Draft, User } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

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
      return new Date(now - 24 * 60 * 60 * 1000); // Default to 1 day
  }
};

// SCAN INBOX - with rate limiting and max emails limit
const scanInbox = async (req, res) => {
  try {
    const userId = req.user.id;
    const period = req.query.period || 'day'; // day, week, or month
    const maxEmails = 10; // MAX 10 emails per scan to avoid rate limits
    const delayBetweenCalls = 21000; // 21 seconds between OpenAI calls (3 per minute limit)

    const user = await User.findByPk(userId);
    if (!user || !user.gmailAccessToken) {
      return res.status(400).json({ error: 'Gmail not connected' });
    }

    // Get time filter
    const startDate = getDateRange(period);
    console.log(`Scanning inbox for period: ${period}, from: ${startDate}`);

    // Get unread messages with time filter
    const messages = await gmailService.listUnreadMessages(userId, startDate);
    
    if (!messages || messages.length === 0) {
      return res.json({ message: 'No new messages found', draftsCreated: 0 });
    }

    console.log(`Found ${messages.length} unread emails. Processing max ${maxEmails}...`);

    // LIMIT to max emails to prevent rate limit
    const messagesToProcess = messages.slice(0, maxEmails);
    let draftsCreated = 0;
    let errors = 0;

    for (let i = 0; i < messagesToProcess.length; i++) {
      try {
        const msg = messagesToProcess[i];
        
        // Check if draft already exists for this email
        // FIXED: Changed emailId to originalEmailId
        const existingDraft = await Draft.findOne({ 
          where: { originalEmailId: msg.id, userId } 
        });
        
        if (existingDraft) {
          console.log(`Draft already exists for email ${msg.id}, skipping...`);
          continue;
        }

        // Get full message details
        const messageData = await gmailService.getMessage(userId, msg.id);

        // Generate AI reply
        console.log(`Generating AI reply for email ${i + 1}/${messagesToProcess.length}...`);
        const aiReply = await openaiService.generateReply(
          messageData.body,
          user.emailPreferences
        );
        console.log('✅ AI reply generated successfully');

        // Create draft with threading info
        // FIXED: Changed emailId to originalEmailId, added messageId and references
        const draft = await Draft.create({
          userId: userId,
          originalEmailId: messageData.id,        // FIXED: was emailId
          threadId: messageData.threadId,
          messageId: messageData.messageId,       // NEW: For In-Reply-To header
          references: messageData.references,     // NEW: For References header
          from: messageData.to,                   // User's email
          to: messageData.from,                   // Sender's email
          subject: `Re: ${messageData.subject}`,
          originalBody: messageData.body,
          generatedReply: aiReply,
          status: 'pending'
        });

        draftsCreated++;

        // ═══════════════════════════════════════════════════════════════════
        // ENHANCED WHATSAPP NOTIFICATION (Professional Format)
        // ═══════════════════════════════════════════════════════════════════
        if (user.whatsappNumber) {
          try {
            // Use the enhanced notification format with subject line
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
              console.log('⚠️ WhatsApp notification failed (non-critical):', result.message || result.error);
            }
          } catch (whatsappError) {
            // Don't fail the entire process if WhatsApp fails
            console.error('❌ WhatsApp error (non-critical):', whatsappError.message);
          }
        }
        // ═══════════════════════════════════════════════════════════════════

        // RATE LIMITING: Wait 21 seconds before next OpenAI call
        // This ensures we stay under 3 requests per minute
        if (i < messagesToProcess.length - 1) {
          console.log(`Waiting 21 seconds before processing next email (rate limit protection)...`);
          await delay(delayBetweenCalls);
        }

      } catch (error) {
        console.error('Error processing message:', error);
        errors++;
        // Continue processing other messages even if one fails
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
      note: skipped > 0 ? `Limited to ${maxEmails} emails to prevent rate limits. Run scan again to process more.` : null
    });

  } catch (error) {
    console.error('Scan inbox error:', error);
    res.status(500).json({ error: 'Failed to scan inbox', message: error.message });
  }
};

// GET PENDING DRAFTS with time filter
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

// GET ALL DRAFTS with filters
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

// APPROVE DRAFT - FIXED: Now sends as threaded reply
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

    // Send the email with proper threading
    // FIXED: Added inReplyTo and references for proper reply threading
    const sentEmail = await gmailService.sendReply(userId, {
      to: draft.to,
      subject: draft.subject,
      body: draft.generatedReply,
      threadId: draft.threadId,
      inReplyTo: draft.messageId,      // NEW: For In-Reply-To header
      references: draft.references     // NEW: For References header
    });

    // Mark original email as read
    // FIXED: Changed emailId to originalEmailId
    if (draft.originalEmailId) {
      await gmailService.markAsRead(userId, draft.originalEmailId);
    }

    // Update draft status
    draft.status = 'sent';
    draft.sentAt = new Date();
    draft.sentEmailId = sentEmail.id;  // Store sent email ID
    await draft.save();

    // ═══════════════════════════════════════════════════════════════════
    // ENHANCED WHATSAPP CONFIRMATION (Professional Format)
    // ═══════════════════════════════════════════════════════════════════
    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'sent',
          {
            to: draft.to,
            subject: draft.subject
          }
        );
      } catch (whatsappError) {
        console.error('❌ WhatsApp confirmation error (non-critical):', whatsappError.message);
      }
    }
    // ═══════════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════════
    // ENHANCED WHATSAPP CONFIRMATION (Professional Format)
    // ═══════════════════════════════════════════════════════════════════
    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'rejected',
          {
            subject: draft.subject
          }
        );
      } catch (whatsappError) {
        console.error('❌ WhatsApp confirmation error (non-critical):', whatsappError.message);
      }
    }
    // ═══════════════════════════════════════════════════════════════════

    res.json({ message: 'Draft rejected', draft });
  } catch (error) {
    console.error('Reject draft error:', error);
    res.status(500).json({ error: 'Failed to reject draft' });
  }
};

// EDIT AND SEND DRAFT - FIXED: Now sends as threaded reply
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

    // Store edited content
    draft.editedReply = editedBody;
    await draft.save();

    // Send the edited email with proper threading
    // FIXED: Added inReplyTo and references for proper reply threading
    const sentEmail = await gmailService.sendReply(userId, {
      to: draft.to,
      subject: draft.subject,
      body: editedBody,
      threadId: draft.threadId,
      inReplyTo: draft.messageId,      // NEW: For In-Reply-To header
      references: draft.references     // NEW: For References header
    });

    // Mark original as read
    // FIXED: Changed emailId to originalEmailId
    if (draft.originalEmailId) {
      await gmailService.markAsRead(userId, draft.originalEmailId);
    }

    // Update status
    draft.status = 'edited';
    draft.sentAt = new Date();
    draft.sentEmailId = sentEmail.id;
    await draft.save();

    // ═══════════════════════════════════════════════════════════════════
    // ENHANCED WHATSAPP CONFIRMATION (Professional Format)
    // ═══════════════════════════════════════════════════════════════════
    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendConfirmation(
          user.whatsappNumber,
          'edited',
          {
            to: draft.to,
            subject: draft.subject
          }
        );
      } catch (whatsappError) {
        console.error('❌ WhatsApp confirmation error (non-critical):', whatsappError.message);
      }
    }
    // ═══════════════════════════════════════════════════════════════════

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














