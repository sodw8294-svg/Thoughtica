const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'index.html'),
  'utf8'
);

test('chat frontend does not contain canned companion fallback generator', () => {
  assert.equal(indexHtml.includes('function generateCompanionResponse('), false);
  assert.equal(indexHtml.includes('return generateCompanionResponse(userText);'), false);
  assert.equal(indexHtml.includes('To master how to '), false);
});

test('chat frontend keeps explicit conversational failure helper', () => {
  assert.equal(indexHtml.includes('function buildCompanionFailureMessage('), true);
  assert.equal(indexHtml.includes('Your conversation context is still safe'), true);
});

test('fetchRealTimeLLMResponse accepts pre-built pastMessages as parameter', () => {
  assert.equal(
    indexHtml.includes('async function fetchRealTimeLLMResponse(userText, requestId, pastMessages)'),
    true,
    'fetchRealTimeLLMResponse must accept pastMessages as third parameter to avoid building from live history'
  );
});

test('chat context is built from history before current user message is pushed', () => {
  const funcStart = indexHtml.indexOf('async function processUserChatMessage(');
  assert.ok(funcStart !== -1, 'processUserChatMessage must exist');
  // sendChat follows processUserChatMessage; use it as the end boundary
  const funcEnd = indexHtml.indexOf('\n    function sendChat(', funcStart);
  assert.ok(funcEnd !== -1, 'sendChat must follow processUserChatMessage');
  const funcBody = indexHtml.slice(funcStart, funcEnd);

  const buildIdx = funcBody.indexOf('buildCompanionContextMessages(S.chatHistory)');
  const pushIdx = funcBody.indexOf("S.chatHistory.push({ s: 'user'");

  assert.ok(buildIdx !== -1, 'processUserChatMessage must call buildCompanionContextMessages');
  assert.ok(pushIdx !== -1, 'processUserChatMessage must push the user message to S.chatHistory');
  assert.ok(
    buildIdx < pushIdx,
    'buildCompanionContextMessages must be called BEFORE S.chatHistory.push to prevent sending the same user turn twice'
  );
});

test('fetchRealTimeLLMResponse does not call buildCompanionContextMessages internally', () => {
  const funcStart = indexHtml.indexOf('async function fetchRealTimeLLMResponse(');
  assert.ok(funcStart !== -1, 'fetchRealTimeLLMResponse must exist');
  // Find the next top-level function after fetchRealTimeLLMResponse
  const funcEnd = indexHtml.indexOf('\n    function showTypingIndicator(', funcStart);
  assert.ok(funcEnd !== -1);
  const funcBody = indexHtml.slice(funcStart, funcEnd);

  assert.equal(
    funcBody.includes('buildCompanionContextMessages(S.chatHistory)'),
    false,
    'fetchRealTimeLLMResponse must not rebuild context from live history; pastMessages must be passed in as a parameter'
  );
});
