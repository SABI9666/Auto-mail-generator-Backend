const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { Draft } = require('../models');
const emailController = require('../controllers/emailController');

router.post('/webhook', async (req, res) => {
  try {
    const { Body, From } = req.body;
    const draftIdMatch = Body.match(/ID: ([a-f0-9-]+)/i);
    if (!draftIdMatch) return res.sendStatus(200);

    const draftId = draftIdMatch[1];
    const draft = await Draft.findByPk(draftId);
    if (!draft) return res.sendStatus(404);

    const response = whatsappService.parseResponse(Body);
    
    if (response) {
      const mockReq = { user: { id: draft.userId }, params: { draftId }, body: {} };
      const mockRes = { json: () => {}, status: () => ({ json: () => {} }) };
      
      switch (response.action) {
        case 'approve':
          await emailController.approveDraft(mockReq, mockRes);
          break;
        case 'reject':
          await emailController.rejectDraft(mockReq, mockRes);
          break;
        case 'edit':
          mockReq.body.editedBody = response.editedText;
          await emailController.editDraft(mockReq, mockRes);
          break;
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.sendStatus(500);
  }
});

module.exports = router;
