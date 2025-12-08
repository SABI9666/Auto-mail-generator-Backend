const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class OpenAIService {
  async generateReply(emailData, preferences = {}) {
    try {
      const { body, subject } = emailData;
      const tone = preferences.tone || 'professional';
      const signOff = preferences.signOff || 'Best regards';
      const signature = preferences.signature || '';

      const prompt = `You are an email assistant. Generate a ${tone} reply to the following email.

Original Email Subject: ${subject}
Original Email Body: ${body}

Requirements:
- Be ${tone} in tone
- Keep the response concise and relevant
- Sign off with: "${signOff}"
${signature ? `- Include signature: ${signature}` : ''}
- Format as plain text email
- Do not include the original email in your response

Generate only the email reply body:`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Changed from gpt-4 to gpt-4o-mini (much faster and cheaper!)
        messages: [
          {
            role: 'system',
            content: 'You are a professional email assistant that writes clear, concise, and appropriate email responses.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const generatedReply = response.choices[0].message.content.trim();
      
      console.log('✅ AI reply generated successfully');
      return generatedReply;

    } catch (error) {
      console.error('OpenAI Error:', error);
      throw new Error('Failed to generate email draft');
    }
  }
}

module.exports = new OpenAIService();




























