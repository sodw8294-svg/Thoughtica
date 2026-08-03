const MAX_HISTORY_MESSAGES = 24;
const MAX_USER_TEXT_LENGTH = 2000;
const MAX_MEMORY_ITEMS = 20;
const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 30000;

// System-prompt config lives in a dedicated module so personality, safety
// constraints, and speaking style can be iterated without touching request logic.
const { buildSystemPrompt: _buildSystemPromptFromConfig, SUPPORT_MODE_INSTRUCTIONS } = require('./system-prompt');

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

// Delegate to the config module so tests importing chat.js still get the same
// system prompt without duplication.
function buildSystemPrompt(cName, uName, goal, level, memoryItems, supportMode) {
  return _buildSystemPromptFromConfig(cName, uName, goal, level, memoryItems, supportMode);
}

/* ─────────────────────────────────────────────────────────────────────────
   STREAMING HELPERS
   Token-by-token SSE streaming for OpenAI-compatible and Gemini providers.
   Only activated when the client sends { stream: true } in the request body.
   All existing non-streaming tests remain unaffected.
───────────────────────────────────────────────────────────────────────── */

/**
 * Parse and forward an OpenAI/Groq SSE stream, calling `onToken` for each
 * content delta.  Resolves when the stream ends cleanly.
 * @param {ReadableStream} body - Response body from the upstream SSE endpoint
 * @param {(token: string) => void} onToken
 */
async function consumeOpenAIStream(body, onToken) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete trailing line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6).trim();
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) onToken(token);
      } catch {
        // Ignore parse errors for malformed chunks
      }
    }
  }
}

/**
 * Parse and forward a Gemini SSE stream (`alt=sse`), calling `onToken` for
 * each text part received.
 * @param {ReadableStream} body
 * @param {(token: string) => void} onToken
 */
async function consumeGeminiStream(body, onToken) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6).trim();

      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) onToken(text);
      } catch {
        // Ignore parse errors
      }
    }
  }
}

/**
 * Handle a request where `req.body.stream === true`.  Writes SSE events to
 * `res` as tokens arrive and ends the response when done or on error.
 *
 * SSE event shapes emitted:
 *   { token: "..." }           – a streamed content token
 *   { done: true, conversationId, provider } – stream finished
 *   { error: { code, message } }             – unrecoverable error
 * Followed by the sentinel:    data: [DONE]
 *
 * @returns {Promise<void>}
 */
async function handleStreamingRequest(req, res, { conversationId, messages, userText, systemPrompt, timeoutMs, geminiKey, groqKey, openaiKey, cName }) {
  // SSE response headers — disable all buffering so tokens arrive immediately.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx/Vercel edge buffering

  /** Write a single SSE data line. */
  const emit = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const providerFailures = [];

  // ── Gemini (streamGenerateContent) ─────────────────────────────────────
  if (geminiKey) {
    try {
      const contents = [
        { role: 'user', parts: [{ text: `SYSTEM DIRECTIVE: ${systemPrompt}` }] },
        { role: 'model', parts: [{ text: `Understood. I am ${cName}, your AI companion.` }] },
        ...messages.map(msg => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] })),
        { role: 'user', parts: [{ text: userText }] }
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}:streamGenerateContent?key=${geminiKey}&alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents }),
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
      await consumeGeminiStream(response.body, (token) => emit({ token }));
      emit({ done: true, conversationId, provider: 'gemini' });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } catch (err) {
      providerFailures.push({ provider: 'gemini', error: err.message });
    }
  }

  // ── Groq (OpenAI-compatible SSE) ────────────────────────────────────────
  if (groqKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', groqKey].join(' ') },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama3-8b-8192',
          messages: [{ role: 'system', content: systemPrompt }, ...messages, { role: 'user', content: userText }],
          stream: true
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Groq HTTP ${response.status}`);
      await consumeOpenAIStream(response.body, (token) => emit({ token }));
      emit({ done: true, conversationId, provider: 'groq' });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } catch (err) {
      providerFailures.push({ provider: 'groq', error: err.message });
    }
  }

  // ── OpenAI (SSE) ────────────────────────────────────────────────────────
  if (openaiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', openaiKey].join(' ') },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, ...messages, { role: 'user', content: userText }],
          stream: true
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
      await consumeOpenAIStream(response.body, (token) => emit({ token }));
      emit({ done: true, conversationId, provider: 'openai' });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } catch (err) {
      providerFailures.push({ provider: 'openai', error: err.message });
    }
  }

  // ── All providers failed ────────────────────────────────────────────────
  emit({
    error: {
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Unable to reach any AI provider. Your conversation context is safe — please try again in a moment.',
      retryable: true,
      details: { providersTried: providerFailures }
    }
  });
  res.write('data: [DONE]\n\n');
  res.end();
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

  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // ── Streaming mode (SSE, opt-in) ──────────────────────────────────────────
  // Activated when the client sends { stream: true }.  Returns SSE events
  // { token }, { done }, or { error } without breaking the non-streaming path
  // used by all existing tests and callers that omit stream.
  if (req.body.stream === true) {
    if (!geminiKey && !groqKey && !openaiKey) {
      // Can't use streaming JSON error here — send as SSE
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.write(`data: ${JSON.stringify({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'No AI provider is configured. Your conversation context is still safe.' } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    return handleStreamingRequest(req, res, {
      conversationId, messages, userText, systemPrompt, timeoutMs,
      geminiKey, groqKey, openaiKey, cName
    });
  }

  const providerCalls = [];
  const providerFailures = [];

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
