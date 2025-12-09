const twilio = require('twilio');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    
    // Only initialize client if credentials exist
    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      console.warn('⚠️ Twilio not configured - WhatsApp notifications disabled');
    }
  }

  // Format professional draft notification
  formatDraftNotification(draft, draftId) {
    const message = `
━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 *NEW EMAIL DRAFT CREATED*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*FROM:* ${draft.from || 'Unknown'}

*SUBJECT:* ${draft.subject || 'No Subject'}

*DATE:* ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📩 *ORIGINAL MESSAGE*
━━━━━━━━━━━━━━━━━━━━━━━━━━

${this.truncateText(draft.originalBody, 200)}

━━━━━━━━━━━━━━━━━━━━━━━━━━
✍️ *AI GENERATED REPLY*
━━━━━━━━━━━━━━━━━━━━━━━━━━

${this.truncateText(draft.generatedReply, 300)}

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ *QUICK ACTIONS*
━━━━━━━━━━━━━━━━━━━━━━━━━━

Reply with one of these commands:

✅ *APPROVE* - Send the email as-is
▶️ approve ${draftId}

✏️ *EDIT* - Modify and send
▶️ edit ${draftId} [your edited text]

❌ *REJECT* - Discard draft
▶️ reject ${draftId}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 *VIEW ONLINE*
${process.env.FRONTEND_URL}/drafts

*Draft ID:* ${draftId}
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    return message;
  }

  // Format confirmation message
  formatConfirmation(action, draft) {
    const confirmations = {
      sent: `
━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *EMAIL SENT SUCCESSFULLY*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*TO:* ${draft.to}
*SUBJECT:* ${draft.subject}
*TIME:* ${new Date().toLocaleTimeString()}

Your email has been sent! ✉️
━━━━━━━━━━━━━━━━━━━━━━━━━━
      `,
      rejected: `
━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ *DRAFT REJECTED*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*SUBJECT:* ${draft.subject}
*TIME:* ${new Date().toLocaleTimeString()}

Draft discarded successfully.
━━━━━━━━━━━━━━━━━━━━━━━━━━
      `,
      edited: `
━━━━━━━━━━━━━━━━━━━━━━━━━━
✏️ *EDITED EMAIL SENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*TO:* ${draft.to}
*SUBJECT:* ${draft.subject}
*TIME:* ${new Date().toLocaleTimeString()}

Your edited email has been sent! ✉️
━━━━━━━━━━━━━━━━━━━━━━━━━━
      `
    };

    return confirmations[action] || 'Action completed.';
  }

  // Truncate text with ellipsis
  truncateText(text, maxLength) {
    if (!text) return 'No content';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // Send draft notification
  async sendDraftNotification(to, draft, draftId) {
    if (!this.isConfigured) {
      console.log('WhatsApp disabled - skipping draft notification');
      return { success: false, message: 'Twilio not configured' };
    }

    if (!to) {
      console.log('No WhatsApp number provided - skipping notification');
      return { success: false, message: 'No recipient number' };
    }

    try {
      const recipientNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      const message = this.formatDraftNotification(draft, draftId);

      const response = await this.client.messages.create({
        from: this.whatsappNumber,
        to: recipientNumber,
        body: message
      });

      console.log('✅ WhatsApp draft notification sent:', response.sid);
      return { success: true, messageId: response.sid };
    } catch (error) {
      console.error('❌ WhatsApp draft notification error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send confirmation message
  async sendConfirmation(to, action, draft) {
    if (!this.isConfigured) {
      return { success: false, message: 'Twilio not configured' };
    }

    if (!to) {
      return { success: false, message: 'No recipient number' };
    }

    try {
      const recipientNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      const message = this.formatConfirmation(action, draft);

      const response = await this.client.messages.create({
        from: this.whatsappNumber,
        to: recipientNumber,
        body: message
      });

      console.log('✅ WhatsApp confirmation sent:', response.sid);
      return { success: true, messageId: response.sid };
    } catch (error) {
      console.error('❌ WhatsApp confirmation error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Generic WhatsApp message (backwards compatible)
  async sendWhatsAppMessage(to, body) {
    if (!this.isConfigured) {
      console.log('WhatsApp disabled - skipping notification');
      return { success: false, message: 'Twilio not configured' };
    }

    if (!to) {
      console.log('No WhatsApp number provided - skipping notification');
      return { success: false, message: 'No recipient number' };
    }

    try {
      const recipientNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      const response = await this.client.messages.create({
        from: this.whatsappNumber,
        to: recipientNumber,
        body: body
      });

      console.log('✅ WhatsApp message sent:', response.sid);
      return { success: true, messageId: response.sid };
    } catch (error) {
      console.error('❌ WhatsApp send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send SMS (backwards compatible)
  async sendSMS(to, body) {
    if (!this.isConfigured) {
      console.log('SMS disabled - Twilio not configured');
      return { success: false, message: 'Twilio not configured' };
    }

    if (!to) {
      console.log('No phone number provided - skipping SMS');
      return { success: false, message: 'No recipient number' };
    }

    try {
      const message = await this.client.messages.create({
        from: this.whatsappNumber.replace('whatsapp:', ''),
        to: to,
        body: body
      });

      console.log('✅ SMS sent:', message.sid);
      return { success: true, messageId: message.sid };
    } catch (error) {
      console.error('❌ SMS send error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TwilioService();




































































































