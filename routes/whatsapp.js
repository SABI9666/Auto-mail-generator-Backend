const express = require('express');
const router = express.Router();
const { Draft } = require('../models');
const emailController = require('../controllers/emailController');

// WhatsApp webhook - handles incoming messages
router.post('/webhook', async (req, res) => {
  try {
    const incomingMessage = req.body.Body || '';
    const from = req.body.From || '';
    
    console.log('WhatsApp webhook received:', { from, message: incomingMessage });

    // Safety check - ensure message exists before matching
    if (!incomingMessage || typeof incomingMessage !== 'string') {
      console.log('No message body or invalid message type');
      return res.status(200).send('OK');
    }

    const message = incomingMessage.trim().toLowerCase();
    
    // Extract draft ID from message patterns
    let draftId = null;
    
    // Pattern 1: "approve <draftId>"
    const approveMatch = message.match(/approve\s+([a-f0-9\-]{36})/i);
    if (approveMatch) {
      draftId = approveMatch[1];
      return await handleApprove(draftId, from, res);
    }
    
    // Pattern 2: "reject <draftId>"
    const rejectMatch = message.match(/reject\s+([a-f0-9\-]{36})/i);
    if (rejectMatch) {
      draftId = rejectMatch[1];
      return await handleReject(draftId, from, res);
    }
    
    // Pattern 3: "edit <draftId> <new content>"
    const editMatch = message.match(/edit\s+([a-f0-9\-]{36})\s+(.*)/is);
    if (editMatch) {
      draftId = editMatch[1];
      const editedContent = editMatch[2];
      return await handleEdit(draftId, editedContent, from, res);
    }
    
    // No matching command
    console.log('No matching command found in message');
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.status(200).send('OK'); // Always return 200 to Twilio
  }
});

// Handle approve action
async function handleApprove(draftId, from, res) {
  try {
    const draft = await Draft.findByPk(draftId);
    if (!draft) {
      console.log('Draft not found:', draftId);
      return res.status(200).send('OK');
    }
    
    // Call the approve endpoint
    await emailController.approveDraft({ params: { draftId } }, {
      json: (data) => console.log('Approve result:', data),
      status: () => ({ json: (data) => console.log('Approve error:', data) })
    });
    
    console.log('Draft approved:', draftId);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error approving draft:', error);
    res.status(200).send('OK');
  }
}

// Handle reject action
async function handleReject(draftId, from, res) {
  try {
    const draft = await Draft.findByPk(draftId);
    if (!draft) {
      console.log('Draft not found:', draftId);
      return res.status(200).send('OK');
    }
    
    // Call the reject endpoint
    await emailController.rejectDraft({ params: { draftId } }, {
      json: (data) => console.log('Reject result:', data),
      status: () => ({ json: (data) => console.log('Reject error:', data) })
    });
    
    console.log('Draft rejected:', draftId);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error rejecting draft:', error);
    res.status(200).send('OK');
  }
}

// Handle edit action
async function handleEdit(draftId, editedContent, from, res) {
  try {
    const draft = await Draft.findByPk(draftId);
    if (!draft) {
      console.log('Draft not found:', draftId);
      return res.status(200).send('OK');
    }
    
    // Call the edit endpoint
    await emailController.editDraft({ 
      params: { draftId },
      body: { editedBody: editedContent }
    }, {
      json: (data) => console.log('Edit result:', data),
      status: () => ({ json: (data) => console.log('Edit error:', data) })
    });
    
    console.log('Draft edited:', draftId);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error editing draft:', error);
    res.status(200).send('OK');
  }
}

// Verification endpoint for Twilio
router.get('/webhook', (req, res) => {
  res.status(200).send('WhatsApp webhook is active');
});

module.exports = router;


































