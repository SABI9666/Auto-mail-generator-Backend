const twilio = require('twilio');
require('dotenv').config();

class WhatsAppService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.from = process.env.TWILIO_WHATSAPP_NUMBER;
  }

  async sendDraftApproval(toNumber, draft) {
    const message = `📧 *New Email Draft*

*From:* ${draft.senderEmail}
*Subject:* ${draft.subject}

*Original:*
${draft.originalBody.substring(0, 150)}...

*Proposed Reply:*
${draft.draftBody}

Reply:
✅ APPROVE
✏️ EDIT [text]
❌ REJECT

ID: ${draft.id}`;

    try {
      const response = await this.client.messages.create({
        from: this.from,
        to: `whatsapp:${toNumber}`,
        body: message
      });
      return response.sid;
    } catch (error) {
      console.error('WhatsApp Error:', error);
      throw new Error('Failed to send WhatsApp message');
    }
  }

  async sendConfirmation(toNumber, status, draftId) {
    const messages = {
      sent: `✅ Email sent!\nID: ${draftId}`,
      rejected: `❌ Draft rejected.\nID: ${draftId}`,
      edited: `✏️ Draft updated and sent!\nID: ${draftId}`
    };

    try {
      await this.client.messages.create({
        from: this.from,
        to: `whatsapp:${toNumber}`,
        body: messages[status]
      });
    } catch (error) {
      console.error('WhatsApp Confirmation Error:', error);
    }
  }

  parseResponse(messageBody) {
    const text = messageBody.trim().toUpperCase();
    
    if (text === 'APPROVE') {
      return { action: 'approve' };
    } else if (text === 'REJECT') {
      return { action: 'reject' };
    } else if (text.startsWith('EDIT')) {
      return { action: 'edit', editedText: messageBody.substring(4).trim() };
    }
    
    return null;
  }
}

module.exports = new WhatsAppService();
