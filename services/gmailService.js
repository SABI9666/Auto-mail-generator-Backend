const { google } = require('googleapis');
require('dotenv').config();

class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify'
      ],
      prompt: 'consent'
    });
  }

  async getTokens(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  async refreshAccessToken(refreshToken) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return credentials;
  }

  async listUnreadMessages(accessToken, maxResults = 10) {
    this.oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults
    });
    return response.data.messages || [];
  }

  async getMessage(accessToken, messageId) {
    this.oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });
    return this.parseMessage(response.data);
  }

  parseMessage(message) {
    const headers = message.payload.headers;
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    
    let body = '';
    if (message.payload.parts) {
      const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
      if (textPart?.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader('from'),
      to: getHeader('to'),
      subject: getHeader('subject'),
      date: getHeader('date'),
      body: body
    };
  }

  async sendReply(accessToken, to, subject, body, threadId) {
    this.oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    
    const email = [
      `To: ${to}`,
      `Subject: Re: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\n');

    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedEmail, threadId: threadId }
    });

    return response.data;
  }

  async markAsRead(accessToken, messageId) {
    this.oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] }
    });
  }
}

module.exports = new GmailService();
