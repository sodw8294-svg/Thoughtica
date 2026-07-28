import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
