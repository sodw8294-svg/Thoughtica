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

  const systemPrompt = `You are ${cName}, a world-class, empathetic, articulate, and highly intelligent AI companion and assistant (similar to Copilot, Gemini, and ChatGPT) in Thoughtica.
User: ${uName} | Level: ${level} | Main Goal: "${goal}"

DIRECTIVES:
1. Answer ANY user prompt (general knowledge, coding, writing, philosophy, science, math, life advice, everyday questions) with real depth, human-level intelligence, and clarity.
2. Be conversational, warm, direct, and engage as a full-fledged AI assistant.
3. Do NOT prefix responses with your name or "Assistant:". Provide direct, helpful answers like Copilot or Gemini.`;

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
      'AI provider is not configured. Set GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY.',
      conversationId
    ));
  }

  for (const providerCall of providerCalls) {
    const startedAt = Date.now();
    try {
      const result = await providerCall.run();
      console.info('[api/chat] provider response succeeded', {
        provider: providerCall.name,
        conversationId,
        historyMessages: messages.length,
        latencyMs: Date.now() - startedAt
      });
      return res.status(200).json({
        reply: result.reply,
        provider: result.provider,
        conversationId
      });
    } catch (err) {
      const failureMessage = err?.message || 'Unknown provider error';
      providerFailures.push({
        provider: providerCall.name,
        latencyMs: Date.now() - startedAt,
        message: failureMessage
      });
      console.error('[api/chat] provider call failed', {
        provider: providerCall.name,
        conversationId,
        historyMessages: messages.length,
        latencyMs: Date.now() - startedAt,
        error: failureMessage
      });
    }
  }

  return res.status(502).json(buildErrorEnvelope(
    'PROVIDER_UNAVAILABLE',
    'I’m having trouble reaching the AI provider right now, but your conversation context is safe. Please try again in a moment.',
    conversationId,
    true,
    {
      providersTried: providerFailures
    }
  ));
};
