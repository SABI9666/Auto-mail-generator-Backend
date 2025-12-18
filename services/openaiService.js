const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class OpenAIService {
  async generateReply(emailBody, preferences = {}) {
    try {
      const tone = preferences.tone || 'professional academic';
      const signOff = preferences.signOff || 'Best regards';
      const signature = preferences.signature || '';
      const name = preferences.name || '';

      const systemPrompt = `You are a PhD-level research professional and academic email assistant. Your role is to:

- Write responses with scholarly precision and academic professionalism
- Maintain formal yet collegial tone appropriate for academic/research correspondence
- Use appropriate academic language and terminology
- Be respectful of academic hierarchy and protocols
- Demonstrate intellectual rigor while remaining approachable
- Handle various academic contexts: research collaborations, peer reviews, conference communications, journal submissions, grant discussions, student supervision, and departmental matters
- Be concise yet comprehensive - academics value time efficiency
- Show appreciation for others' research and contributions when appropriate
- Use proper academic etiquette and conventions

You respond as an experienced researcher who understands academic culture, research processes, and scholarly communication norms.`;

      const userPrompt = `Generate a ${tone} reply to the following email as a PhD-level research professional.

Original Email:
${emailBody}

Requirements:
- Respond professionally as an academic/researcher
- Be ${tone} in tone
- Keep the response clear, concise, and academically appropriate
- Address all key points raised in the original email
- Use appropriate academic language without being overly complex
- Sign off with: "${signOff}"
${signature ? `- Include signature: "${signature}"` : ''}
${name ? `- Sign as: "${name}"` : ''}
- Format as plain text email
- Do not include the original email in your response
- Do not use excessive formality or flattery

Generate only the email reply body:`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 600
      });

      const generatedReply = response.choices[0].message.content.trim();
      console.log('✅ PhD-level research reply generated successfully');
      return generatedReply;

    } catch (error) {
      console.error('❌ OpenAI Error:', error.message);
      throw new Error('Failed to generate email draft: ' + error.message);
    }
  }

  // Generate reply with specific research context
  async generateResearchReply(emailBody, preferences = {}, context = 'general') {
    try {
      const tone = preferences.tone || 'professional academic';
      const signOff = preferences.signOff || 'Best regards';
      const signature = preferences.signature || '';
      const name = preferences.name || '';

      const contextPrompts = {
        'collaboration': 'responding to a research collaboration inquiry or ongoing collaborative project',
        'peer-review': 'responding to peer review comments or journal correspondence',
        'conference': 'responding to conference-related communication (submissions, presentations, networking)',
        'grant': 'responding to grant-related matters (applications, reports, funding agencies)',
        'supervision': 'responding as a research supervisor to students or mentees',
        'department': 'responding to departmental or administrative academic matters',
        'general': 'responding to general academic/research correspondence'
      };

      const contextDescription = contextPrompts[context] || contextPrompts['general'];

      const systemPrompt = `You are a PhD-level research professional and academic email assistant currently ${contextDescription}.

Your expertise includes:
- Deep understanding of academic research processes
- Familiarity with scholarly publishing and peer review
- Knowledge of grant writing and funding processes
- Experience with academic conferences and networking
- Understanding of research supervision and mentoring
- Awareness of academic institutional dynamics

Communication style:
- Scholarly yet accessible
- Respectful of academic conventions
- Appropriately formal but not stiff
- Clear and well-structured
- Time-conscious (academics are busy)`;

      const userPrompt = `Generate a ${tone} reply to the following email as a PhD-level researcher.

Context: ${contextDescription}

Original Email:
${emailBody}

Requirements:
- Respond professionally as an experienced academic researcher
- Be ${tone} in tone
- Address all relevant points from the original email
- Use appropriate academic language
- Be helpful and constructive
- Sign off with: "${signOff}"
${signature ? `- Include signature: "${signature}"` : ''}
${name ? `- Sign as: "${name}"` : ''}
- Format as plain text
- Do not include the original email

Generate only the email reply body:`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 700
      });

      const generatedReply = response.choices[0].message.content.trim();
      console.log(`✅ Research reply generated (context: ${context})`);
      return generatedReply;

    } catch (error) {
      console.error('❌ OpenAI Error:', error.message);
      throw new Error('Failed to generate research reply: ' + error.message);
    }
  }
}

module.exports = new OpenAIService();
