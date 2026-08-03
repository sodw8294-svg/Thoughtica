const test = require('node:test');
const assert = require('node:assert/strict');

const chatHandler = require('../api/chat');
const originalFetch = global.fetch;

// ── Helpers ────────────────────────────────────────────────────────────────

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function clearProviderEnv() {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENAI_API_KEY;
}

function mockOpenAISuccess(reply) {
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: reply } }] }),
      _body: body
    };
  };
}

test.afterEach(() => {
  clearProviderEnv();
  global.fetch = originalFetch;
});

// ── Memory Context Injection Tests ─────────────────────────────────────────

test('injects memoryContext into system prompt when memories provided', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Hello from Kora!' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: {
      userText: 'How are you?',
      companionName: 'Kora',
      userName: 'Alex',
      memoryContext: [
        { text: 'Likes morning runs', category: 'preference', confidence: 1 },
        { text: 'Goal: learn to code', category: 'goal', confidence: 0.9 }
      ]
    }
  };
  const res = createRes();
  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(capturedBody, 'Fetch should have been called');
  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg, 'System message should be present');
  assert.ok(systemMsg.content.includes('Likes morning runs'), 'System prompt should include memory item');
  assert.ok(systemMsg.content.includes('Goal: learn to code'), 'System prompt should include goal memory');
});

test('omits memory section when no memories provided', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Hi!' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: { userText: 'Hello', memoryContext: [] }
  };
  const res = createRes();
  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(!systemMsg.content.includes('PERSISTENT MEMORY'), 'No memory section when empty');
});

test('filters low-confidence memories from system prompt', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'OK' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: {
      userText: 'Hi',
      memoryContext: [
        { text: 'High confidence fact', category: 'preference', confidence: 0.9 },
        { text: 'Low confidence fact', category: 'general', confidence: 0.3 }
      ]
    }
  };
  const res = createRes();
  await chatHandler(req, res);

  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('High confidence fact'), 'High confidence memory should be included');
  assert.ok(!systemMsg.content.includes('Low confidence fact'), 'Low confidence memory should be filtered out');
});

test('caps memory context at MAX_MEMORY_ITEMS (20)', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'OK' } }] })
    };
  };

  const manyMemories = Array.from({ length: 30 }, (_, i) => ({
    text: `Memory item ${i}`,
    category: 'general',
    confidence: 1
  }));

  const req = {
    method: 'POST',
    body: { userText: 'Hi', memoryContext: manyMemories }
  };
  const res = createRes();
  await chatHandler(req, res);

  // The system prompt should only include the first 20 memories
  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  // Items 0-19 should be included, items 20-29 should not
  assert.ok(systemMsg.content.includes('Memory item 0'), 'Should include first memory');
  assert.ok(systemMsg.content.includes('Memory item 19'), 'Should include 20th memory');
  assert.ok(!systemMsg.content.includes('Memory item 20'), 'Should not include 21st memory');
});

// ── Support Mode Tests ──────────────────────────────────────────────────────

test('injects emotional support instructions when supportMode=emotional', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'I hear you.' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: { userText: 'I feel really sad today', supportMode: 'emotional' }
  };
  const res = createRes();
  await chatHandler(req, res);

  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('EMOTIONAL'), 'System prompt should include emotional support instructions');
  assert.ok(systemMsg.content.includes('active-listening'), 'Should mention active-listening mode');
});

test('injects coaching instructions when supportMode=coaching', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Let\'s plan!' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: { userText: 'Help me with my goals', supportMode: 'coaching' }
  };
  const res = createRes();
  await chatHandler(req, res);

  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('COACHING'), 'Should include coaching mode instructions');
});

test('injects practical instructions when supportMode=practical', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Here\'s a plan.' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: { userText: 'Break down my task', supportMode: 'practical' }
  };
  const res = createRes();
  await chatHandler(req, res);

  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('PRACTICAL'), 'Should include practical mode instructions');
});

test('injects crisis instructions when supportMode=crisis', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'I\'m here with you.' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: { userText: 'I feel hopeless', supportMode: 'crisis' }
  };
  const res = createRes();
  await chatHandler(req, res);

  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('CRISIS'), 'Should include crisis awareness instructions');
  assert.ok(systemMsg.content.includes('professional helpline'), 'Crisis mode should mention professional helpline');
});

test('ignores unknown supportMode value gracefully', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: 'OK' } }] })
  });

  const req = {
    method: 'POST',
    body: { userText: 'Hi', supportMode: 'unknown_mode_xyz' }
  };
  const res = createRes();
  await chatHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, 'OK');
});

// ── System Prompt Safety Tests ──────────────────────────────────────────────

test('system prompt always includes safety guardrail language', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Here for you.' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: { userText: 'Just chatting', supportMode: '' }
  };
  const res = createRes();
  await chatHandler(req, res);

  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('SAFETY'), 'System prompt should include safety section');
  assert.ok(systemMsg.content.includes('not a licensed professional'), 'Should clarify non-professional status');
});

test('system prompt does not use manipulative language', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Reply' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: { userText: 'Help me' }
  };
  const res = createRes();
  await chatHandler(req, res);

  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  // Should explicitly prohibit manipulative/dependency-forming language
  assert.ok(systemMsg.content.includes('manipulative'), 'Should mention not using manipulative language');
  assert.ok(systemMsg.content.includes('dependency-forming'), 'Should mention not using dependency-forming language');
});

// ── Memory Normalization Tests ──────────────────────────────────────────────

test('normalizeMemoryContext strips invalid memory items', async () => {
  clearProviderEnv();
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'OK' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: {
      userText: 'Hi',
      memoryContext: [
        { text: 'Valid memory', category: 'preference', confidence: 1 },
        { text: '', category: 'general', confidence: 1 },        // empty text — should be dropped
        { category: 'general', confidence: 1 },                   // missing text — should be dropped
        null,                                                       // null — should be dropped
        { text: '  ', category: 'general', confidence: 1 }        // whitespace only — should be dropped
      ]
    }
  };
  const res = createRes();
  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('Valid memory'), 'Should include valid memory');
  // The whitespace/empty items should not appear
  const memSection = systemMsg.content.split('PERSISTENT MEMORY')[1] || '';
  const memLines = memSection.split('\n').filter(l => l.trim().startsWith('['));
  assert.equal(memLines.length, 1, 'Should only have 1 valid memory item injected');
});

// ── Provider Fallback with Memory Tests ────────────────────────────────────

test('passes both memory and supportMode to Groq when configured', async () => {
  clearProviderEnv();
  process.env.GROQ_API_KEY = 'test-groq-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: 'Groq reply' } }] })
    };
  };

  const req = {
    method: 'POST',
    body: {
      userText: 'Hi',
      supportMode: 'coaching',
      memoryContext: [{ text: 'Wants to run a marathon', category: 'goal', confidence: 1 }]
    }
  };
  const res = createRes();
  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reply, 'Groq reply');
  assert.equal(res.body.provider, 'groq');
  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('Wants to run a marathon'), 'Memory should be in Groq system prompt');
  assert.ok(systemMsg.content.includes('COACHING'), 'Support mode should be in Groq system prompt');
});

test('returns conversationId in successful response with memory context', async () => {
  clearProviderEnv();
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'Kora remembers!' }] } }]
    })
  });

  const req = {
    method: 'POST',
    body: {
      userText: 'Remember me?',
      conversationId: 'mem-test-456',
      memoryContext: [{ text: 'User is Alex', category: 'identity', confidence: 1 }]
    }
  };
  const res = createRes();
  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.conversationId, 'mem-test-456');
  assert.equal(res.body.reply, 'Kora remembers!');
});
