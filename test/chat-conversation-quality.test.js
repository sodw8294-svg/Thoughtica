const test = require('node:test');
const assert = require('node:assert/strict');

const chatHandler = require('../api/chat');
const originalFetch = global.fetch;

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

test.afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  global.fetch = originalFetch;
});

test('system prompt includes anti-repetition conversational quality rules', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: "Sure — let's figure it out together." } }] })
    };
  };

  const req = {
    method: 'POST',
    body: {
      userText: 'help me figure it out',
      companionName: 'Kora',
      userName: 'Alex',
      userGoal: 'Cultivate mental clarity & inner strength'
    }
  };
  const res = createRes();
  await chatHandler(req, res);

  assert.equal(res.statusCode, 200);
  const systemMsg = capturedBody.messages.find(m => m.role === 'system');
  assert.ok(systemMsg.content.includes('CONVERSATION QUALITY'), 'Should include conversation quality section');
  assert.ok(systemMsg.content.includes('Never repeat signature lines'), 'Should explicitly block repeated stock lines');
  assert.ok(systemMsg.content.includes('Do not repeatedly reference streaks'), 'Should limit repetitive streak references');
  assert.ok(systemMsg.content.includes('avoid "Seeker"'), 'Should discourage ceremonial tone by default');
});
