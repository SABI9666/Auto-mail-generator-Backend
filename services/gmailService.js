const { google } = require('googleapis');
const { User } = require('../models');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

class GmailService {
  getAuthUrl(state) {
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.modify'],
      state: state
    });
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

  // UPDATED: Filter to get ONLY inbox emails (no promotions, no spam, no social, etc.)
  async listMessages(userId, maxResults = 10, timeFilter = null) {
    const gmail = await this.setCredentials(userId);
    
    // Build query to get ONLY inbox emails
    // Excludes: SPAM, PROMOTIONS, SOCIAL, UPDATES, FORUMS
    let query = 'in:inbox -in:spam -in:promotions -in:social -in:updates -in:forums';
    
    // Add time filter if provided
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
    
    // Get ONLY unread inbox emails (no promotions/spam)
    let query = 'is:unread in:inbox -in:spam -in:promotions -in:social -in:updates -in:forums';
    
    if (timeFilter) {
      const timestamp = Math.floor(timeFilter.getTime() / 1000);
      query += ` after:${timestamp}`;
    }

    console.log('Gmail unread search query:', query);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50 // Limit to prevent rate limit issues
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

    // Extract body
    let body = '';
    if (message.payload.parts) {
      const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from,
      to,
      subject,
      body,
      date,
      snippet: message.snippet
    };
  }

  async sendEmail(userId, emailData) {
    const gmail = await this.setCredentials(userId);
    
    const { to, subject, body, threadId } = emailData;
    
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\n');

    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const requestBody = { raw: encodedEmail };
    if (threadId) {
      requestBody.threadId = threadId;
    }

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: requestBody
    });

    return response.data;
  }

  async sendReply(userId, emailData) {
    return await this.sendEmail(userId, emailData);
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
}

module.exports = new GmailService();




































