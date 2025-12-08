const { google } = require('googleapis');
const { User } = require('../models');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose'
];

const getAuthUrl = (state) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: state,
    prompt: 'consent'
  });
};

const getTokens = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Error getting tokens:', error);
    throw new Error('Failed to exchange code for tokens');
  }
};

const getGmailClient = async (userId) => {
  try {
    const user = await User.findByPk(userId);
    if (!user || !user.gmailAccessToken) {
      throw new Error('Gmail not connected for this user');
    }
    oauth2Client.setCredentials({
      access_token: user.gmailAccessToken,
      refresh_token: user.gmailRefreshToken,
      expiry_date: user.gmailTokenExpiry ? new Date(user.gmailTokenExpiry).getTime() : null
    });
    if (!user.hasValidGmailToken() && user.gmailRefreshToken) {
      console.log('Refreshing Gmail token for user:', userId);
      const { credentials } = await oauth2Client.refreshAccessToken();
      await user.update({
        gmailAccessToken: credentials.access_token,
        gmailRefreshToken: credentials.refresh_token || user.gmailRefreshToken,
        gmailTokenExpiry: new Date(credentials.expiry_date)
      });
      console.log('Token refreshed successfully');
    }
    return google.gmail({ version: 'v1', auth: oauth2Client });
  } catch (error) {
    console.error('Error getting Gmail client:', error);
    throw error;
  }
};

const getUserEmail = async (userId) => {
  try {
    const gmail = await getGmailClient(userId);
    const res = await gmail.users.getProfile({ userId: 'me' });
    return res.data.emailAddress;
  } catch (error) {
    console.error('Error getting user email:', error);
    throw error;
  }
};

const listMessages = async (userId, options = {}) => {
  try {
    const gmail = await getGmailClient(userId);
    const params = {
      userId: 'me',
      maxResults: options.maxResults || 10,
      labelIds: options.labelIds || ['INBOX'],
      q: options.q || 'is:unread'
    };
    const res = await gmail.users.messages.list(params);
    return res.data.messages || [];
  } catch (error) {
    console.error('Error listing messages:', error);
    throw error;
  }
};

const getMessage = async (userId, messageId) => {
  try {
    const gmail = await getGmailClient(userId);
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });
    return res.data;
  } catch (error) {
    console.error('Error getting message:', error);
    throw error;
  }
};

const sendEmail = async (userId, emailData) => {
  try {
    const gmail = await getGmailClient(userId);
    const user = await User.findByPk(userId);
    const fromEmail = await getUserEmail(userId);
    const email = [
      `From: ${user.name} <${fromEmail}>`,
      `To: ${emailData.to}`,
      `Subject: ${emailData.subject}`,
      emailData.inReplyTo ? `In-Reply-To: ${emailData.inReplyTo}` : '',
      emailData.references ? `References: ${emailData.references}` : '',
      'Content-Type: text/html; charset=utf-8',
      '',
      emailData.body
    ].filter(Boolean).join('\r\n');
    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const params = {
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    };
    if (emailData.threadId) {
      params.requestBody.threadId = emailData.threadId;
    }
    const res = await gmail.users.messages.send(params);
    console.log('Email sent successfully:', res.data.id);
    return res.data;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

const markAsRead = async (userId, messageId) => {
  try {
    const gmail = await getGmailClient(userId);
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD']
      }
    });
    console.log('Message marked as read:', messageId);
  } catch (error) {
    console.error('Error marking message as read:', error);
    throw error;
  }
};

const revokeAccess = async (userId) => {
  try {
    const user = await User.findByPk(userId);
    if (user && user.gmailAccessToken) {
      await oauth2Client.revokeToken(user.gmailAccessToken);
      await user.update({
        gmailAccessToken: null,
        gmailRefreshToken: null,
        gmailTokenExpiry: null
      });
      console.log('Gmail access revoked for user:', userId);
    }
  } catch (error) {
    console.error('Error revoking Gmail access:', error);
    await User.update(
      { gmailAccessToken: null, gmailRefreshToken: null, gmailTokenExpiry: null },
      { where: { id: userId } }
    );
  }
};

module.exports = {
  oauth2Client,
  getAuthUrl,
  getTokens,
  getGmailClient,
  getUserEmail,
  listMessages,
  getMessage,
  sendEmail,
  markAsRead,
  revokeAccess
};














