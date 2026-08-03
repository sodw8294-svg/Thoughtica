const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'index.html'),
  'utf8'
);

// ── Memory command regex tests ─────────────────────────────────────────────
// We evaluate the regex patterns used in the frontend to verify correct behavior.

// Extract the regex literals from the HTML source
function extractRegex(source, varName) {
  const re = new RegExp(`const ${varName}\\s*=\\s*(/[^/]+/[gimsuy]*)`, 'm');
  const m = source.match(re);
  if (!m) throw new Error(`Could not find ${varName} regex in source`);
  const parts = m[1].match(/^\/(.+)\/([gimsuy]*)$/);
  return new RegExp(parts[1], parts[2]);
}

const MEMORY_CMD_REMEMBER     = extractRegex(indexHtml, 'MEMORY_CMD_REMEMBER');
const MEMORY_CMD_FORGET       = extractRegex(indexHtml, 'MEMORY_CMD_FORGET');
const MEMORY_CMD_VIEW         = extractRegex(indexHtml, 'MEMORY_CMD_VIEW');
const MEMORY_CMD_DONT_REMEMBER = extractRegex(indexHtml, 'MEMORY_CMD_DONT_REMEMBER');
const CRISIS_SIGNALS          = extractRegex(indexHtml, 'CRISIS_SIGNALS');

// ── Memory Command: "remember this" ───────────────────────────────────────

test('MEMORY_CMD_REMEMBER matches "remember this"', () => {
  assert.ok(MEMORY_CMD_REMEMBER.test('remember this'));
  assert.ok(MEMORY_CMD_REMEMBER.test('Please remember this for me'));
  assert.ok(MEMORY_CMD_REMEMBER.test('save this'));
  assert.ok(MEMORY_CMD_REMEMBER.test('note this down'));
  assert.ok(MEMORY_CMD_REMEMBER.test('keep this'));
  assert.ok(MEMORY_CMD_REMEMBER.test('store this'));
});

test('MEMORY_CMD_REMEMBER does not false-positive on unrelated text', () => {
  assert.ok(!MEMORY_CMD_REMEMBER.test('I have a good memory'));
  assert.ok(!MEMORY_CMD_REMEMBER.test('remember to call mom'));
  assert.ok(!MEMORY_CMD_REMEMBER.test('I remember that'));
});

// ── Memory Command: "don't remember this" ─────────────────────────────────

test("MEMORY_CMD_DONT_REMEMBER matches privacy phrases", () => {
  assert.ok(MEMORY_CMD_DONT_REMEMBER.test("don't remember this"));
  assert.ok(MEMORY_CMD_DONT_REMEMBER.test("do not remember this"));
  assert.ok(MEMORY_CMD_DONT_REMEMBER.test("forget this"));
  assert.ok(MEMORY_CMD_DONT_REMEMBER.test("discard this"));
});

test("MEMORY_CMD_DONT_REMEMBER does not match general forget phrases", () => {
  assert.ok(!MEMORY_CMD_DONT_REMEMBER.test("forget my password"));
  assert.ok(!MEMORY_CMD_DONT_REMEMBER.test("I forget things"));
});

// ── Memory Command: "what do you remember" ────────────────────────────────

test('MEMORY_CMD_VIEW matches view-memory queries', () => {
  assert.ok(MEMORY_CMD_VIEW.test('what do you remember about me'));
  assert.ok(MEMORY_CMD_VIEW.test('what do you know about me'));
  assert.ok(MEMORY_CMD_VIEW.test('show my memories'));
  assert.ok(MEMORY_CMD_VIEW.test('list memories'));
});

test('MEMORY_CMD_VIEW does not match unrelated queries', () => {
  assert.ok(!MEMORY_CMD_VIEW.test('what do you think about pizza'));
  assert.ok(!MEMORY_CMD_VIEW.test('do you remember the movie'));
});

// ── Memory Command: "forget X" ─────────────────────────────────────────────

test('MEMORY_CMD_FORGET matches targeted forget phrases', () => {
  const m1 = 'forget my running goal'.match(MEMORY_CMD_FORGET);
  assert.ok(m1, 'Should match forget with target');
  assert.ok(m1[2].includes('my running goal'), 'Should capture the target');

  const m2 = 'delete my job preferences'.match(MEMORY_CMD_FORGET);
  assert.ok(m2, 'Should match delete');
  assert.ok(m2[2].includes('my job preferences'));

  const m3 = 'remove my address'.match(MEMORY_CMD_FORGET);
  assert.ok(m3, 'Should match remove');
});

test('MEMORY_CMD_FORGET matches erase phrases', () => {
  const m = 'erase my diet information'.match(MEMORY_CMD_FORGET);
  assert.ok(m, 'Should match erase');
});

// ── Crisis Signal Detection ─────────────────────────────────────────────────

test('CRISIS_SIGNALS detects clear self-harm phrases', () => {
  assert.ok(CRISIS_SIGNALS.test('I want to die'));
  assert.ok(CRISIS_SIGNALS.test("I'm thinking about suicide"));
  assert.ok(CRISIS_SIGNALS.test("I'm feeling suicidal"));
  assert.ok(CRISIS_SIGNALS.test('I want to hurt myself'));
  assert.ok(CRISIS_SIGNALS.test('kill myself'));
  assert.ok(CRISIS_SIGNALS.test('no reason to live'));
  assert.ok(CRISIS_SIGNALS.test("can't go on"));
  assert.ok(CRISIS_SIGNALS.test('self-harm'));
  assert.ok(CRISIS_SIGNALS.test('self harm'));
});

test('CRISIS_SIGNALS does not false-positive on safe phrases', () => {
  assert.ok(!CRISIS_SIGNALS.test('I want to kill it at the gym'));
  assert.ok(!CRISIS_SIGNALS.test('this traffic is killing me'));
  assert.ok(!CRISIS_SIGNALS.test('I want to die laughing at this'));
  assert.ok(!CRISIS_SIGNALS.test("I'm dying to see that movie"));
});

// ── Frontend function presence tests ──────────────────────────────────────

test('addNewCompanionMemory function is defined in frontend', () => {
  assert.ok(indexHtml.includes('function addNewCompanionMemory()'), 'addNewCompanionMemory must be defined');
});

test('toggleCompanionMemorySwitch function is defined in frontend', () => {
  assert.ok(indexHtml.includes('function toggleCompanionMemorySwitch()'), 'toggleCompanionMemorySwitch must be defined');
});

test('clearAllCompanionMemories function is defined in frontend', () => {
  assert.ok(indexHtml.includes('function clearAllCompanionMemories()'), 'clearAllCompanionMemories must be defined');
});

test('setSupportMode function is defined in frontend', () => {
  assert.ok(indexHtml.includes('function setSupportMode(mode)'), 'setSupportMode must be defined');
});

test('buildMemoryViewText function is defined in frontend', () => {
  assert.ok(indexHtml.includes('function buildMemoryViewText()'), 'buildMemoryViewText must be defined');
});

test('extractCandidateMemories function is defined in frontend', () => {
  assert.ok(indexHtml.includes('function extractCandidateMemories(text)'), 'extractCandidateMemories must be defined');
});

test('detectSupportMode function is defined in frontend', () => {
  assert.ok(indexHtml.includes('function detectSupportMode(text)'), 'detectSupportMode must be defined');
});

// ── Support mode UI presence ───────────────────────────────────────────────

test('support mode buttons are present in memory vault UI', () => {
  assert.ok(indexHtml.includes("setSupportMode('emotional')"), 'Emotional support mode button must exist');
  assert.ok(indexHtml.includes("setSupportMode('coaching')"), 'Coaching support mode button must exist');
  assert.ok(indexHtml.includes("setSupportMode('practical')"), 'Practical support mode button must exist');
  assert.ok(indexHtml.includes("setSupportMode('')"), 'Auto support mode button must exist');
});

test('clear all memories button is present in memory vault UI', () => {
  assert.ok(indexHtml.includes('clearAllCompanionMemories()'), 'Clear All button must be in UI');
});

// ── Memory commands hint text ──────────────────────────────────────────────

test('memory commands hint text is visible in UI', () => {
  assert.ok(
    indexHtml.includes('"remember this"') || indexHtml.includes("'remember this'"),
    'Memory commands hint should mention "remember this"'
  );
  assert.ok(
    indexHtml.includes('"forget X"') || indexHtml.includes("'forget X'"),
    'Memory commands hint should mention "forget X"'
  );
});

// ── Memory extraction pattern tests ───────────────────────────────────────

test('memory extraction pattern array is defined in frontend', () => {
  assert.ok(indexHtml.includes('MEMORY_EXTRACT_PATTERNS'), 'MEMORY_EXTRACT_PATTERNS must be defined');
});

test('memory extraction covers key categories', () => {
  // Check that the extraction patterns cover all required categories
  assert.ok(indexHtml.includes("category: 'preference'"), 'Should extract preferences');
  assert.ok(indexHtml.includes("category: 'goal'"), 'Should extract goals');
  assert.ok(indexHtml.includes("category: 'routine'"), 'Should extract routines');
  assert.ok(indexHtml.includes("category: 'identity'"), 'Should extract identity');
  assert.ok(indexHtml.includes("category: 'challenge'"), 'Should extract challenges');
  assert.ok(indexHtml.includes("category: 'tone'"), 'Should extract communication preferences');
});

// ── Privacy + safety copy ──────────────────────────────────────────────────

test('privacy transparency copy is present in memory vault', () => {
  assert.ok(
    indexHtml.includes('You control what') || indexHtml.includes('what is stored') ||
    indexHtml.includes("You control"),
    'Privacy transparency copy should be present'
  );
});

test('memory context is passed to api/chat in fetchCustomAIResponse', () => {
  assert.ok(indexHtml.includes('memoryContext'), 'memoryContext must be passed to API call');
  assert.ok(indexHtml.includes('supportMode: activeSupportMode'), 'supportMode must be passed to API call');
});
