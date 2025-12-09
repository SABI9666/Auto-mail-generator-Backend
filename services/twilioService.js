const twilio = require('twilio');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.frontendUrl = process.env.FRONTEND_URL || 'https://auto-mail-generator-frontend.vercel.app';
    
    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      console.warn('⚠️ Twilio not configured - WhatsApp notifications disabled');
    }
  }

  // Format date with Indian timezone (IST)
  formatEmailDate(dateString) {
    if (!dateString) {
      return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    }
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return dateString;
    }
  }

  // Extract name from email address
  extractSenderName(from) {
    if (!from) return 'Unknown';
    const nameMatch = from.match(/^([^<]+)</);
    if (nameMatch) return nameMatch[1].trim().replace(/"/g, '');
    const emailMatch = from.match(/([^@]+)@/);
    if (emailMatch) return emailMatch[1].charAt(0).toUpperCase() + emailMatch[1].slice(1);
    return from;
  }

  // Truncate text
  truncateText(text, maxLength) {
    if (!text) return 'No content';
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (cleanText.length <= maxLength) return cleanText;
    return cleanText.substring(0, maxLength).trim() + '...';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPACT FORMAT - Only 3 lines visible in preview, rest in "Read more"
  // ═══════════════════════════════════════════════════════════════════════════
  formatDraftNotification(draft, draftId) {
    const senderName = this.extractSenderName(draft.from);
    const formattedDate = this.formatEmailDate(draft.date);
    const subjectLine = draft.subject || '(No Subject)';

    // HEADER: Only these 3 lines show in WhatsApp preview
    // Everything after the blank line goes into "Read more"
    const message = `📬 *${senderName}* • ${formattedDate}
📋 *${subjectLine}*

━━━━━━━━━━━━━━━━━━━━━━━━

📩 *Original:*
${this.truncateText(draft.originalBody, 150)}

✍️ *AI Reply:*
${this.truncateText(draft.generatedReply, 200)}

━━━━━━━━━━━━━━━━━━━━━━━━

👉 *Take Action:*
${this.frontendUrl}/drafts/${draftId}

_Or reply with:_
✅ approve ${draftId.slice(0, 8)}
✏️ edit ${draftId.slice(0, 8)} [text]
❌ reject ${draftId.slice(0, 8)}`;

    return message;
  }

  // Format confirmation message
  formatConfirmation(action, draft) {
    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      day: 'numeric',
      month: 'short'
    });

    const confirmations = {
      sent: `✅ *Email Sent!*
📤 ${draft.to}
📋 ${draft.subject}
🕐 ${timestamp}`,
      
      rejected: `❌ *Draft Rejected*
📋 ${draft.subject}
🕐 ${timestamp}`,
      
      edited: `✏️ *Edited & Sent!*
📤 ${draft.to}
📋 ${draft.subject}
🕐 ${timestamp}`,

      error: `⚠️ *Action Failed*
Please try again.`
    };

    return (confirmations[action] || confirmations.error).trim();
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

  // Generic WhatsApp message
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

  // Send SMS
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
















