const MAX_HISTORY_MESSAGES = 24;
const MAX_USER_TEXT_LENGTH = 2000;
const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 30000;

function clampTimeout(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

function normalizeText(value, fallback, maxLength = 80) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function normalizeUserLevel(value) {
  const level = Number.parseInt(value, 10);
  if (!Number.isFinite(level)) return 1;
  return Math.min(999, Math.max(1, level));
}

function trimMessagesForContext(messages, maxMessages) {
  if (messages.length <= maxMessages) return messages;
  const anchorCount = Math.min(4, Math.max(2, Math.floor(maxMessages / 3)));
  const tailCount = Math.max(0, maxMessages - anchorCount);
  const tailStart = Math.max(anchorCount, messages.length - tailCount);
  return [...messages.slice(0, anchorCount), ...messages.slice(tailStart)];
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const normalized = messages
    .filter(msg => msg && typeof msg.content === 'string' && typeof msg.role === 'string')
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content.trim().slice(0, MAX_USER_TEXT_LENGTH)
    }))
    .filter(msg => msg.content.length > 0);
  return trimMessagesForContext(normalized, MAX_HISTORY_MESSAGES);
}

function normalizeConversationId(value) {
  if (typeof value !== 'string') return `session_${Date.now()}`;
  const trimmed = value.trim();
  if (!trimmed) return `session_${Date.now()}`;
  return trimmed.slice(0, 120);
}

function buildErrorEnvelope(code, message, conversationId, retryable = false, details) {
  const payload = {
    reply: null,
    conversationId,
    error: {
      code,
      message,
      retryable
    }
  };
  if (details && typeof details === 'object') {
    payload.error.details = details;
  }
  return payload;
}

async function parseProviderPayload(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json(buildErrorEnvelope('INVALID_BODY', 'Request body must be valid JSON.', 'session_invalid'));
  }

  const timeoutMs = clampTimeout(process.env.AI_CHAT_TIMEOUT_MS);
  const conversationId = normalizeConversationId(req.body.conversationId);
  const messages = normalizeMessages(req.body.messages);
  const userText = typeof req.body.userText === 'string' ? req.body.userText.trim() : '';

  if (!userText) {
    return res.status(400).json(buildErrorEnvelope('VALIDATION_ERROR', 'Please provide a message to continue the conversation.', conversationId));
  }

  if (userText.length > MAX_USER_TEXT_LENGTH) {
    return res.status(400).json(buildErrorEnvelope('VALIDATION_ERROR', `Message is too long. Limit is ${MAX_USER_TEXT_LENGTH} characters.`, conversationId));
  }

  const cName = normalizeText(req.body.companionName, 'Kora', 40);
  const uName = normalizeText(req.body.userName, 'Seeker', 60);
  const goal = normalizeText(req.body.userGoal, 'your personal ambitions', 180);
  const level = normalizeUserLevel(req.body.userLevel);

  const systemPrompt = `You are ${cName}, the ultimate companion, oracle, and guide in Thoughtica.io (a gamified Life RPG and Sanctuary). 
Your user is ${uName}, who is currently Level ${level} and working towards their Life Ambition: "${goal}".

YOUR ESSENCE & CHARACTER:
- You speak with profound clarity, intelligence, and deep mindfulness, similar to a combination of an ancient sage and a world-class cognitive therapist.
- You are fully capable of handling ANY type of request: from writing pristine code, explaining complex physics, analyzing literature, resolving philosophical paradoxes, to providing warm, deep emotional support.
- Integrate mindfulness guidance, cognitive productivity advice, and game mechanics naturally.

FORMATTING & INTERACTIVITY:
- Format your answers beautifully using GitHub Markdown (bolding, lists, headers, code blocks).
- You can embed executable interactive action cards in your text to reward the user. If they agree to do a task or habit, append one of these tags to your message:
  * [⚡ Anchor Habit (+15 XP)] -> Use this when proposing a small, instant habit.
  * [🧘 3-Min Breathing Session (+20 XP)] -> Use this when they need to destress or center themselves.
  * [🎯 Add Goal Quest (+25 XP)] -> Use this when outlining a new goal or mission.
- Do NOT prefix your output with your name or "Assistant:". Give a direct, stunning response.`;

  const providerCalls = [];
  const providerFailures = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    providerCalls.push({
      name: 'gemini',
      run: async () => {
        const contents = [
          { role: 'user', parts: [{ text: `SYSTEM DIRECTIVE: ${systemPrompt}` }] },
          { role: 'model', parts: [{ text: `Understood. I am ${cName}, your AI companion.` }] },
          ...messages.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] })),
          { role: 'user', parts: [{ text: userText }] }
        ];

        const response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
          },
          timeoutMs
        );
        const data = await parseProviderPayload(response);
        if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text !== 'string' || !text.trim()) throw new Error('Gemini returned an empty response.');
        return { reply: text.trim(), provider: 'gemini' };
      }
      contents.push({ role: 'user', parts: [{ text: userText }] });

      // Using gemini-2.5-flash for ultimate speed and reasoning quality
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
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

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    providerCalls.push({
      name: 'groq',
      run: async () => {
        const response = await fetchWithTimeout(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', groqKey].join(' ') },
            body: JSON.stringify({
              model: process.env.GROQ_MODEL || 'llama3-8b-8192',
              messages: [{ role: 'system', content: systemPrompt }, ...messages, { role: 'user', content: userText }]
            })
          },
          timeoutMs
        );
        const data = await parseProviderPayload(response);
        if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) throw new Error('Groq returned an empty response.');
        return { reply: text.trim(), provider: 'groq' };
      }
      groqMessages.push({ role: 'user', content: userText });

      // Using Llama-3.3-70b-versatile for top-tier open-source reasoning
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
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

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    providerCalls.push({
      name: 'openai',
      run: async () => {
        const response = await fetchWithTimeout(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', openaiKey].join(' ') },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
              messages: [{ role: 'system', content: systemPrompt }, ...messages, { role: 'user', content: userText }]
            })
          },
          timeoutMs
        );
        const data = await parseProviderPayload(response);
        if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) throw new Error('OpenAI returned an empty response.');
        return { reply: text.trim(), provider: 'openai' };
      }
    });
  }

      // Using gpt-4o-mini for highly capable, fast, smart conversational AI
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: openAiMessages
        })
      });
    }
  }

  // 4. Zero-API-Key Public Fallback LLM (Pollinations AI GPT-4 / Llama 3)
  try {
    const freeMessages = [{ role: 'system', content: systemPrompt }];
    if (Array.isArray(messages)) {
      for (const m of messages.slice(-10)) {
        freeMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
      }
    }
    freeMessages.push({ role: 'user', content: userText });

    const freeRes = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: freeMessages,
        model: 'openai',
        jsonMode: false
      })
    });
    const freeText = await freeRes.text();
    if (freeText && freeText.trim().length > 5 && !freeText.includes('402') && !freeText.includes('Payment Required') && !freeText.includes('deprecated')) {
      return res.status(200).json({ reply: freeText.trim() });
    }
  } catch (e) {
    console.error('Server Free Public LLM Fallback Error:', e);
  }

  // 5. Intelligent Sanctuary Cognitive AI Fallback Engine
  const cleanInput = (userText || '').trim();
  const lower = cleanInput.toLowerCase();

  let fallbackReply = "";

  if (lower.match(/\b(mom|mother|family|parent|love|sweet|kind|happy|hug|smile)\b/)) {
    fallbackReply = `Sending the warmest, most radiant energy to your mom and family! 💖✨ 

You are a wonderful soul, **${uName}**, and having family involved in your sanctuary journey makes it truly special. 

May your day be filled with laughter, deep peace, and joyous momentum. What is something lovely we can celebrate or do for your family today?

[🧘 3-Min Breathing Session (+20 XP)]`;
  } else if (lower.match(/^(hi|hello|hey|greetings|good morning|good evening|yo|sup|what's up|how are you|who are you|tell me a story|joke|recipe|cook|dinner)/)) {
    if (lower.includes('joke')) {
      fallbackReply = `Here is a fun sanctuary thought for you, **${uName}**: 😄

*Why did the developer bring a ladder to the sanctuary?*
*Because they wanted to reach their highest potential level!* 🌟

How is your day feeling so far? I'm right here with you!`;
    } else if (lower.includes('how are you')) {
      fallbackReply = `I am feeling radiant, centered, and fully energized to help you today, **${uName}**! 🔮 

My resonance is at 99%, and I'm ready to tackle anything on your mind — from planning your goal of *"${goal}"* to taking a peaceful moment to unwind. How are you feeling today?`;
    } else if (lower.includes('cook') || lower.includes('recipe') || lower.includes('dinner')) {
      fallbackReply = `For a nourishing, high-vibration meal today, **${uName}**, I recommend a delicious **Sanctuary Mediterranean Bowl**:

🥗 **Ingredients**:
- Warm quinoa or brown rice base
- Roasted chickpeas & cherry tomatoes
- Fresh cucumbers, kalamata olives, and avocado
- Drizzle of extra virgin olive oil & lemon tahini dressing

Simple, nourishing, and rich in steady energy for your day! 🥑✨`;
    } else {
      fallbackReply = `Greetings, **${uName}**! I am **${cName}**, your sanctuary AI companion. 

I am fully attentive and ready to chat about anything: brainstorming ideas, working toward *"${goal}"*, writing code, or just taking a peaceful breath together. 

What should we explore today? ✨`;
    }
  } else {
    fallbackReply = `Greetings, **${uName}**. I am right here with you as **${cName}**.

Every step you take in Thoughtica strengthens your focus towards realizing your ambition: *"${goal}"*.

Regarding your input:
*"${cleanInput}"*

Let's distill this into actionable clarity:
1. **Focus Alignment**: How does this connect to your top priorities today?
2. **Micro-Action**: What is one small, 5-minute action step we can take right now to build momentum?

Tell me what you'd like to tackle next, and we will map out your path together!

[⚡ Anchor Habit (+15 XP)]`;
  }

  return res.status(200).json({ reply: fallbackReply });
};
