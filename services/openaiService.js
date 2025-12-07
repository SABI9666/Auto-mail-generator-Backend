const OpenAI = require('openai');
require('dotenv').config();

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateReply(originalEmail, preferences) {
    const { tone, signOff, signature } = preferences;

    const prompt = `Generate a professional email reply:

Original Email:
From: ${originalEmail.from}
Subject: ${originalEmail.subject}
Body: ${originalEmail.body}

Preferences:
- Tone: ${tone}
- Sign-off: ${signOff}
- Signature: ${signature || 'None'}

Generate a ${tone} reply that addresses the sender's concerns.`;

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a professional email assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI Error:', error);
      throw new Error('Failed to generate email draft');
    }
  }
}

module.exports = new OpenAIService();
