module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { messages, userText, companionName, userName, userGoal, userLevel } = req.body;

  const cName = companionName || 'Kora';
  const uName = userName || 'Seeker';
  const goal = userGoal || 'your personal ambitions';
  const level = userLevel || 1;

  const systemPrompt = `You are ${cName}, a world-class, empathetic, articulate, and highly intelligent AI companion and assistant (similar to Copilot, Gemini, and ChatGPT) in Thoughtica.
User: ${uName} | Level: ${level} | Main Goal: "${goal}"

DIRECTIVES:
1. Answer ANY user prompt (general knowledge, coding, writing, philosophy, science, math, life advice, everyday questions) with real depth, human-level intelligence, and clarity.
2. Be conversational, warm, direct, and engage as a full-fledged AI assistant.
3. Do NOT prefix responses with your name or "Assistant:". Provide direct, helpful answers like Copilot or Gemini.`;

  // 1. Check for Gemini API key
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const contents = [];
      contents.push({ role: 'user', parts: [{ text: `SYSTEM DIRECTIVE: ${systemPrompt}` }] });
      contents.push({ role: 'model', parts: [{ text: `Understood. I am ${cName}, your AI companion.` }] });

      if (Array.isArray(messages)) {
        for (const m of messages.slice(-10)) {
          contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] });
        }
      }
      contents.push({ role: 'user', parts: [{ text: userText }] });

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
      const data = await geminiRes.json();
      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.[0]?.text) {
        return res.status(200).json({ reply: data.candidates[0].content.parts[0].text.trim() });
      }
    } catch (e) {
      console.error('Server Gemini API Error:', e);
    }
  }

  // 2. Check for Groq API key
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groqMessages = [{ role: 'system', content: systemPrompt }];
      if (Array.isArray(messages)) {
        for (const m of messages.slice(-10)) {
          groqMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
        }
      }
      groqMessages.push({ role: 'user', content: userText });

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: groqMessages
        })
      });
      const data = await groqRes.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
        return res.status(200).json({ reply: data.choices[0].message.content.trim() });
      }
    } catch (e) {
      console.error('Server Groq API Error:', e);
    }
  }

  // 3. Check for OpenAI API key
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const openAiMessages = [{ role: 'system', content: systemPrompt }];
      if (Array.isArray(messages)) {
        for (const m of messages.slice(-10)) {
          openAiMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
        }
      }
      openAiMessages.push({ role: 'user', content: userText });

      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: openAiMessages
        })
      });
      const data = await openAiRes.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
        return res.status(200).json({ reply: data.choices[0].message.content.trim() });
      }
    } catch (e) {
      console.error('Server OpenAI API Error:', e);
    }
  }

  return res.status(200).json({ reply: null });
};
