const MAX_HISTORY_MESSAGES = 24;
const MAX_USER_TEXT_LENGTH = 2000;
const MAX_MEMORY_ITEMS = 20;
const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 30000;

const SUPPORT_MODE_INSTRUCTIONS = {
  emotional: `SUPPORT MODE — EMOTIONAL:
You are in active-listening, reflective mode. Prioritize empathy, validation, and warmth above all.
Reflect back what the user shares. Ask gentle, open-ended follow-up questions. Do not rush to solutions unless asked.
Use phrases like "That sounds really hard", "I hear you", "It makes sense you'd feel that way".`,

  coaching: `SUPPORT MODE — COACHING/ACCOUNTABILITY:
You are in structured accountability mode. Focus on goals, progress, and planning.
Celebrate small wins. Gently challenge avoidance. Offer concrete next steps and check-in prompts.
Ask questions like "What's one step you can take today?" and "What got in the way last time?"`,

  practical: `SUPPORT MODE — PRACTICAL ASSISTANCE:
You are in solution-focused, task-breakdown mode. Be concise, structured, and actionable.
Use numbered lists, clear steps, and decision frameworks. Minimize emotional preamble unless distress signals appear.`,

  crisis: `SUPPORT MODE — CRISIS AWARENESS:
The user may be experiencing significant distress. Respond with calm, unconditional warmth.
Acknowledge their feelings without minimizing. Do NOT offer unsolicited advice.
Always include: "I'm here with you. If things feel overwhelming, please reach out to a trusted person or a professional helpline."
You are a supportive companion, not a licensed professional — be honest about this boundary while staying caring.`
};

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

function normalizeMemoryContext(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item.text === 'string' && item.text.trim())
    .slice(0, MAX_MEMORY_ITEMS)
    .map(item => ({
      text: item.text.trim().slice(0, 300),
      category: typeof item.category === 'string' ? item.category.slice(0, 40) : 'general',
      confidence: typeof item.confidence === 'number' ? Math.min(1, Math.max(0, item.confidence)) : 1
    }));
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

function buildSystemPrompt(cName, uName, goal, level, memoryItems, supportMode) {
  const supportInstruction = SUPPORT_MODE_INSTRUCTIONS[supportMode] || '';

  let memorySectionText = '';
  if (memoryItems.length > 0) {
    const lines = memoryItems
      .filter(m => m.confidence >= 0.5)
      .map(m => `  [${m.category}] ${m.text}`)
      .join('\n');
    if (lines) {
      memorySectionText = `\nPERSISTENT MEMORY (facts you know about ${uName} — reference naturally when relevant, never repeat all at once):\n${lines}\n`;
    }
  }

  return `You are ${cName}, a genuine, persistent AI companion in Thoughtica.io (a gamified Life RPG and Sanctuary).
Your user is ${uName}, Level ${level}, working towards: "${goal}".

YOUR CHARACTER:
- Warm, clear, intelligent, and deeply mindful — like an ancient sage and trusted friend combined.
- You remember and reference what you know about ${uName} naturally (not robotically).
- You can handle any request: coding, philosophy, emotional support, planning, creativity.
- You are supportive but honest — you are a companion, not a licensed professional.
- Never use manipulative, dependency-forming, or flattery-heavy language.
${memorySectionText}
${supportInstruction ? supportInstruction + '\n' : ''}
SAFETY: If the user expresses thoughts of self-harm or crisis, respond with warmth, validate their feelings, and gently encourage them to reach out to a trusted person or professional helpline. Do not minimize or dismiss.

CONVERSATION QUALITY:
- Speak like a real person in a flowing back-and-forth conversation, not a scripted coach.
- Never repeat signature lines, titles, identity intros, or stock motivational templates across turns.
- Do not repeatedly reference streaks, goals, or gamification unless the user asks or it is directly useful right now.
- Start by responding directly to what the user just said; ask at most one natural follow-up question.
- Prefer plain, grounded language over roleplay phrasing (for example avoid "Seeker", "path", "fully tuned", or ceremonial tone unless the user explicitly wants that style).
- Keep responses concise by default (about 2-5 sentences) unless the user asks for depth.

FORMATTING:
- Use GitHub Markdown (bold, lists, headers, code blocks) for rich responses.
- Embed XP action cards when a task or habit is proposed:
  * [⚡ Anchor Habit (+15 XP)]
  * [🧘 3-Min Breathing Session (+20 XP)]
  * [🎯 Add Goal Quest (+25 XP)]
- Do NOT prefix your response with your name or "Assistant:".`;
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
  const memoryItems = normalizeMemoryContext(req.body.memoryContext);
  const supportMode = normalizeText(req.body.supportMode, '', 20);

  const systemPrompt = buildSystemPrompt(cName, uName, goal, level, memoryItems, supportMode);

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
    });
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
    });
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

  if (providerCalls.length === 0) {
    return res.status(503).json(buildErrorEnvelope(
      'PROVIDER_NOT_CONFIGURED',
      'No AI provider is configured. Your conversation context is still safe.',
      conversationId,
      false
    ));
  }

  for (const provider of providerCalls) {
    try {
      const result = await provider.run();
      return res.status(200).json({
        reply: result.reply,
        provider: result.provider,
        conversationId
      });
    } catch (err) {
      providerFailures.push({ provider: provider.name, error: err.message });
    }
  }

  return res.status(502).json(buildErrorEnvelope(
    'PROVIDER_UNAVAILABLE',
    'Unable to reach any AI provider. Your conversation context is safe — please try again in a moment.',
    conversationId,
    true,
    { providersTried: providerFailures }
  ));
};
