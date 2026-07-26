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
