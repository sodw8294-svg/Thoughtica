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
  assert.equal(res.body.reply, null);
});
