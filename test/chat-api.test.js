const test = require('node:test');
const assert = require('node:assert/strict');

const chatHandler = require('../api/chat');
const originalFetch = global.fetch;

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function clearProviderEnv() {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;
}

test.afterEach(() => {
  clearProviderEnv();
  global.fetch = originalFetch;
});

test('returns validation error for missing userText', async () => {
  clearProviderEnv();
  const req = { method: 'POST', body: { messages: [] } };
  const res = createRes();

  await chatHandler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('returns provider not configured when no provider keys exist', async () => {
  clearProviderEnv();
  const req = { method: 'POST', body: { userText: 'Hello there' } };
  const res = createRes();

  await chatHandler(req, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(res.body.reply, null);
});

test('returns successful Gemini response with conversation id', async () => {
  clearProviderEnv();
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  const rawProviderReply = '  Hi from Gemini!  ';

  let fetchBody = null;
  global.fetch = async (_url, options) => {
    fetchBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        candidates: [{ content: { parts: [{ text: rawProviderReply }] } }]
      })
    };
  };

  const req = {
    method: 'POST',
    body: {
      userText: 'How are you?',
      conversationId: 'conv-123',
      messages: [{ role: 'user', content: 'Earlier message' }]
    }
  };
  const res = createRes();

  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, 'Hi from Gemini!');
  assert.notEqual(res.body.reply, rawProviderReply);
  assert.equal(res.body.provider, 'gemini');
  assert.equal(res.body.conversationId, 'conv-123');
  assert.ok(Array.isArray(fetchBody.contents));
});

test('returns provider unavailable when provider call fails', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';
  global.fetch = async () => {
    throw new Error('network down');
  };

  const req = { method: 'POST', body: { userText: 'Ping' } };
  const res = createRes();

  await chatHandler(req, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, 'PROVIDER_UNAVAILABLE');
  assert.match(res.body.error.message, /conversation context is safe/i);
  assert.equal(res.body.reply, null);
  assert.equal(Array.isArray(res.body.error.details.providersTried), true);
});

test('returns provider unavailable when provider returns empty content', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: '   ' } }] })
  });

  const req = { method: 'POST', body: { userText: 'Tell me something useful' } };
  const res = createRes();

  await chatHandler(req, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(res.body.reply, null);
});

test('preserves anchor and recent messages when trimming long history', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let payloadMessages = null;
  global.fetch = async (_url, options) => {
    const parsed = JSON.parse(options.body);
    payloadMessages = parsed.messages;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Context received.' } }] })
    };
  };

  const longHistory = Array.from({ length: 40 }, (_v, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message-${i}`
  }));

  const req = { method: 'POST', body: { userText: 'continue', messages: longHistory } };
  const res = createRes();

  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(payloadMessages.length, 26);
  const contents = payloadMessages.map(msg => msg.content);
  assert.equal(contents.includes('message-0'), true);
  assert.equal(contents.includes('message-1'), true);
  assert.equal(contents.includes('message-2'), true);
  assert.equal(contents.includes('message-3'), true);
  assert.equal(contents.includes('message-39'), true);
  assert.equal(contents[contents.length - 1], 'continue');
});

test('userText appears exactly once at end of provider payload', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let payloadMessages = null;
  global.fetch = async (_url, options) => {
    const parsed = JSON.parse(options.body);
    payloadMessages = parsed.messages;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Good answer.' } }] })
    };
  };

  // Simulate properly-built history: does NOT include the current user message.
  // This is what the frontend sends after the fix (context built before push).
  const history = [
    { role: 'assistant', content: 'Welcome, how can I help?' },
    { role: 'user', content: 'What is mindfulness?' },
    { role: 'assistant', content: 'Mindfulness is the practice of present-moment awareness.' }
  ];

  const req = { method: 'POST', body: { userText: 'Tell me more', messages: history } };
  const res = createRes();

  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  const userContents = payloadMessages.filter(m => m.role === 'user').map(m => m.content);
  const occurrences = userContents.filter(c => c === 'Tell me more').length;
  assert.equal(occurrences, 1, 'Current user message must appear exactly once in the provider payload');
  assert.equal(payloadMessages[payloadMessages.length - 1].content, 'Tell me more');
  assert.equal(payloadMessages[payloadMessages.length - 1].role, 'user');
});

