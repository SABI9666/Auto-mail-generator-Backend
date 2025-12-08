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
        const existingDraft = await Draft.findOne({ 
          where: { emailId: msg.id, userId } 
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

        // Generate approval token
        const approvalToken = crypto.randomBytes(16).toString('hex');

        // Create draft
        const draft = await Draft.create({
          userId: userId,
          emailId: messageData.id,
          threadId: messageData.threadId,
          from: messageData.to, // User's email
          to: messageData.from, // Sender's email
          subject: `Re: ${messageData.subject}`,
          originalBody: messageData.body,
          generatedReply: aiReply,
          status: 'pending',
          approvalToken: approvalToken
        });

        draftsCreated++;

        // Send WhatsApp notification (non-blocking - don't fail if WhatsApp fails)
        if (user.whatsappNumber) {
          try {
            const whatsappMessage = `
📧 New Email Draft Created

From: ${messageData.from}
Subject: ${messageData.subject}

Original: ${messageData.snippet || messageData.body.substring(0, 100)}...

AI Reply: ${aiReply.substring(0, 200)}...

To approve, reply: approve ${draft.id}
To reject, reply: reject ${draft.id}
To edit, reply: edit ${draft.id} <your changes>

View all drafts: ${process.env.FRONTEND_URL}/drafts
          `.trim();

            const result = await twilioService.sendWhatsAppMessage(user.whatsappNumber, whatsappMessage);
            if (result.success) {
              console.log('WhatsApp notification sent for draft:', draft.id);
            } else {
              console.log('WhatsApp notification failed (non-critical):', result.message || result.error);
            }
          } catch (whatsappError) {
            // Don't fail the entire process if WhatsApp fails
            console.error('WhatsApp error (non-critical):', whatsappError.message);
          }
        }

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

    // Send the email
    await gmailService.sendReply(userId, {
      to: draft.to,
      subject: draft.subject,
      body: draft.generatedReply,
      threadId: draft.threadId
    });

    // Mark original email as read
    await gmailService.markAsRead(userId, draft.emailId);

    // Update draft status
    draft.status = 'sent';
    draft.sentAt = new Date();
    await draft.save();

    // Send confirmation via WhatsApp (non-blocking)
    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendWhatsAppMessage(
          user.whatsappNumber,
          `✅ Email sent successfully!\n\nTo: ${draft.to}\nSubject: ${draft.subject}`
        );
      } catch (whatsappError) {
        console.error('WhatsApp confirmation error (non-critical):', whatsappError.message);
      }
    }

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
    await draft.save();

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

    // Update draft with edited content
    draft.generatedReply = editedBody;
    await draft.save();

    // Send the edited email
    await gmailService.sendReply(userId, {
      to: draft.to,
      subject: draft.subject,
      body: editedBody,
      threadId: draft.threadId
    });

    // Mark original as read
    await gmailService.markAsRead(userId, draft.emailId);

    // Update status
    draft.status = 'sent';
    draft.sentAt = new Date();
    await draft.save();

    // Send confirmation (non-blocking)
    const user = await User.findByPk(userId);
    if (user && user.whatsappNumber) {
      try {
        await twilioService.sendWhatsAppMessage(
          user.whatsappNumber,
          `✅ Edited email sent successfully!\n\nTo: ${draft.to}\nSubject: ${draft.subject}`
        );
      } catch (whatsappError) {
        console.error('WhatsApp confirmation error (non-critical):', whatsappError.message);
      }
    }

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




































