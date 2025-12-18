const { google } = require('googleapis');
const { User } = require('../models');

// Log the redirect URI being used (for debugging)
console.log('📧 Gmail OAuth Redirect URI:', process.env.GMAIL_REDIRECT_URI);

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

class GmailService {
  getAuthUrl(state) {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.modify'],
      prompt: 'consent', // Force consent to always get refresh token
      state: state
    });
    console.log('🔗 Generated Auth URL:', url);
    return url;
  }

  async getTokens(code) {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  async setCredentials(userId) {
    const user = await User.findByPk(userId);
    if (!user || !user.gmailAccessToken) {
      throw new Error('Gmail not connected');
    }

    oauth2Client.setCredentials({
      access_token: user.gmailAccessToken,
      refresh_token: user.gmailRefreshToken,
      expiry_date: user.gmailTokenExpiry
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        await User.update(
          {
            gmailAccessToken: tokens.access_token,
            gmailRefreshToken: tokens.refresh_token,
            gmailTokenExpiry: tokens.expiry_date
          },
          { where: { id: userId } }
        );
      }
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  // Filter to get ONLY inbox emails (no promotions, no spam, no social, etc.)
  async listMessages(userId, maxResults = 10, timeFilter = null) {
    const gmail = await this.setCredentials(userId);
    
    let query = 'in:inbox -in:spam -in:promotions -in:social -in:updates -in:forums';
    
    if (timeFilter) {
      const timestamp = Math.floor(timeFilter.getTime() / 1000);
      query += ` after:${timestamp}`;
    }

    console.log('Gmail search query:', query);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults
    });

    return response.data.messages || [];
  }

  // List unread inbox messages only
  async listUnreadMessages(userId, timeFilter = null) {
    const gmail = await this.setCredentials(userId);
    
    let query = 'is:unread in:inbox -in:spam -in:promotions -in:social -in:updates -in:forums';
    
    if (timeFilter) {
      const timestamp = Math.floor(timeFilter.getTime() / 1000);
      query += ` after:${timestamp}`;
    }

    console.log('Gmail unread search query:', query);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    });

    return response.data.messages || [];
  }

  async getMessage(userId, messageId) {
    const gmail = await this.setCredentials(userId);
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const message = response.data;
    const headers = message.payload.headers;

    // Extract email data
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const from = getHeader('From');
    const to = getHeader('To');
    const subject = getHeader('Subject');
    const date = getHeader('Date');
    const messageIdHeader = getHeader('Message-ID') || getHeader('Message-Id');
    const references = getHeader('References');

    // Extract body
    let body = '';
    let htmlBody = '';
    
    if (message.payload.parts) {
      const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
      const htmlPart = message.payload.parts.find(part => part.mimeType === 'text/html');
      
      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
      if (htmlPart && htmlPart.body.data) {
        htmlBody = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
      }
    } else if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: message.id,
      threadId: message.threadId,
      messageId: messageIdHeader,
      references: references,
      from,
      to,
      subject,
      body,
      htmlBody,
      date,
      snippet: message.snippet,
      labelIds: message.labelIds || []
    };
  }

  // Send email with proper reply threading
  async sendEmail(userId, emailData) {
    const gmail = await this.setCredentials(userId);
    
    const { to, subject, body, threadId, inReplyTo, references } = emailData;
    
    // Build email headers
    const emailHeaders = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8'
    ];

    // Add reply headers for proper threading
    if (inReplyTo) {
      emailHeaders.push(`In-Reply-To: ${inReplyTo}`);
    }
    
    if (references) {
      const refChain = inReplyTo ? `${references} ${inReplyTo}` : references;
      emailHeaders.push(`References: ${refChain}`);
    } else if (inReplyTo) {
      emailHeaders.push(`References: ${inReplyTo}`);
    }

    const email = [
      ...emailHeaders,
      '',
      body
    ].join('\r\n');

    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const requestBody = { raw: encodedEmail };
    
    if (threadId) {
      requestBody.threadId = threadId;
    }

    console.log('📧 Sending email with threading:', {
      to,
      subject,
      threadId,
      inReplyTo,
      hasReferences: !!references
    });

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: requestBody
    });

    console.log('✅ Email sent successfully:', response.data.id);
    return response.data;
  }

  // Send reply with proper threading
  async sendReply(userId, emailData) {
    let subject = emailData.subject || '';
    if (!subject.toLowerCase().startsWith('re:')) {
      subject = `Re: ${subject}`;
    }

    return await this.sendEmail(userId, {
      ...emailData,
      subject: subject
    });
  }

  async markAsRead(userId, messageId) {
    const gmail = await this.setCredentials(userId);
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD']
      }
    });
  }

  // Get user's email address
  async getUserEmail(userId) {
    const gmail = await this.setCredentials(userId);
    const response = await gmail.users.getProfile({
      userId: 'me'
    });
    return response.data.emailAddress;
  }
}

module.exports = new GmailService();
