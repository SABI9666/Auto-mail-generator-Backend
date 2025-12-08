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
      console.warn('⚠️  Twilio not configured - WhatsApp notifications disabled');
    }
  }

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
      // Ensure number has whatsapp: prefix
      const recipientNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      const message = await this.client.messages.create({
        from: this.whatsappNumber,
        to: recipientNumber,
        body: body
      });

      console.log('✅ WhatsApp message sent:', message.sid);
      return { success: true, messageId: message.sid };
    } catch (error) {
      console.error('❌ WhatsApp send error:', error.message);
      return { success: false, error: error.message };
    }
  }

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
        from: this.whatsappNumber.replace('whatsapp:', ''), // Use Twilio number without prefix
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




































