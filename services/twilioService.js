const twilio = require('twilio');

class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    
    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      console.warn('⚠️ Twilio not configured - WhatsApp notifications disabled');
    }
  }

  // Format date like email clients (Gmail/Outlook style)
  formatEmailDate(dateString) {
    const date = dateString ? new Date(dateString) : new Date();
    const options = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleString('en-US', options);
  }

  // Extract name from email address
  extractSenderName(from) {
    if (!from) return 'Unknown Sender';
    
    // Match "Name <email>" or just "email"
    const nameMatch = from.match(/^([^<]+)</);
    if (nameMatch) {
      return nameMatch[1].trim().replace(/"/g, '');
    }
    
    // If just email, extract name part
    const emailMatch = from.match(/([^@]+)@/);
    if (emailMatch) {
      return emailMatch[1].charAt(0).toUpperCase() + emailMatch[1].slice(1);
    }
    
    return from;
  }

  // Extract email from "Name <email>" format
  extractEmail(from) {
    if (!from) return '';
    const emailMatch = from.match(/<([^>]+)>/);
    return emailMatch ? emailMatch[1] : from;
  }

  // Professional Email-Client Style Format (Gmail/Outlook inspired)
  formatDraftNotification(draft, draftId) {
    const senderName = this.extractSenderName(draft.from);
    const senderEmail = this.extractEmail(draft.from);
    const formattedDate = this.formatEmailDate(draft.date);
    const subjectLine = draft.subject || '(No Subject)';
    
    // Create email preview (first 150 chars of original)
    const preview = this.truncateText(draft.originalBody, 150);
    
    // Create shorter reply preview
    const replyPreview = this.truncateText(draft.generatedReply, 250);

    const message = `
┌─────────────────────────────┐
│  📬  *NEW EMAIL RECEIVED*   │
└─────────────────────────────┘

┌ *FROM*
│ 👤 ${senderName}
│ ✉️ ${senderEmail}
└────────────────────────

┌ *SUBJECT*
│ 📋 ${subjectLine}
└────────────────────────

┌ *RECEIVED*
│ 🕐 ${formattedDate}
└────────────────────────

╔═══════════════════════════╗
║     📩 ORIGINAL EMAIL     ║
╚═══════════════════════════╝

${preview}

╔═══════════════════════════╗
║    ✍️ AI DRAFT REPLY      ║
╚═══════════════════════════╝

${replyPreview}

┌─────────────────────────────┐
│      ⚡ QUICK ACTIONS       │
├─────────────────────────────┤
│                             │
│ ✅ *APPROVE & SEND*         │
│ ▶ approve ${draftId.slice(0, 8)}       │
│                             │
│ ✏️ *EDIT & SEND*            │
│ ▶ edit ${draftId.slice(0, 8)} [text]   │
│                             │
│ ❌ *REJECT*                 │
│ ▶ reject ${draftId.slice(0, 8)}        │
│                             │
└─────────────────────────────┘

🔗 *Full Draft ID:* \`${draftId}\`
🌐 View online: ${process.env.FRONTEND_URL || 'N/A'}/drafts
    `.trim();

    return message;
  }

  // Compact notification format (alternative)
  formatCompactNotification(draft, draftId) {
    const senderName = this.extractSenderName(draft.from);
    const subjectLine = draft.subject || '(No Subject)';
    const shortId = draftId.slice(0, 8);

    return `
📬 *New Email Draft*

*From:* ${senderName}
*Subject:* ${subjectLine}

*Preview:*
${this.truncateText(draft.originalBody, 100)}

*AI Reply:*
${this.truncateText(draft.generatedReply, 150)}

─────────────
✅ approve ${shortId}
✏️ edit ${shortId} [changes]
❌ reject ${shortId}
    `.trim();
  }

  // Format confirmation message - Professional style
  formatConfirmation(action, draft) {
    const timestamp = new Date().toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      day: 'numeric',
      month: 'short'
    });

    const confirmations = {
      sent: `
┌─────────────────────────────┐
│   ✅ *EMAIL SENT*           │
└─────────────────────────────┘

📤 *To:* ${draft.to}
📋 *Subject:* ${draft.subject}
🕐 *Time:* ${timestamp}

✨ Your reply has been sent successfully!
      `,
      
      rejected: `
┌─────────────────────────────┐
│   ❌ *DRAFT REJECTED*       │
└─────────────────────────────┘

📋 *Subject:* ${draft.subject}
🕐 *Time:* ${timestamp}

🗑️ Draft has been discarded.
      `,
      
      edited: `
┌─────────────────────────────┐
│   ✏️ *EDITED EMAIL SENT*    │
└─────────────────────────────┘

📤 *To:* ${draft.to}
📋 *Subject:* ${draft.subject}
🕐 *Time:* ${timestamp}

✨ Your edited reply has been sent!
      `,

      error: `
┌─────────────────────────────┐
│   ⚠️ *ACTION FAILED*        │
└─────────────────────────────┘

❗ Could not process your request.
Please try again or check the web dashboard.
      `
    };

    return (confirmations[action] || confirmations.error).trim();
  }

  // Truncate text with ellipsis
  truncateText(text, maxLength) {
    if (!text) return '_No content_';
    
    // Clean up the text
    const cleanText = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    if (cleanText.length <= maxLength) return cleanText;
    return cleanText.substring(0, maxLength).trim() + '...';
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

  // Send compact notification (for less intrusive alerts)
  async sendCompactNotification(to, draft, draftId) {
    if (!this.isConfigured || !to) {
      return { success: false, message: 'Not configured or no recipient' };
    }

    try {
      const recipientNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      const message = this.formatCompactNotification(draft, draftId);

      const response = await this.client.messages.create({
        from: this.whatsappNumber,
        to: recipientNumber,
        body: message
      });

      console.log('✅ Compact notification sent:', response.sid);
      return { success: true, messageId: response.sid };
    } catch (error) {
      console.error('❌ Compact notification error:', error.message);
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














