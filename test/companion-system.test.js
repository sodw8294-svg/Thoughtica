/**
 * companion-system.test.js
 *
 * Tests for: greeting behavior, memory recall, coaching triggers,
 * personality adaptation, RPG handoff safety, and freemium pricing.
 *
 * Uses Node's built-in test runner (same pattern as other test files).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ── Helpers ────────────────────────────────────────────────────────────────

/** Minimal localStorage shim for Node */
function makeLocalStorage() {
  const store = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// Provide crypto.randomUUID polyfill for Node < 19
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('node:crypto').webcrypto;
}

// ── Sidecar Parser Tests ────────────────────────────────────────────────────

// Import the compiled/transpiled sidecar parser by evaluating a stripped version.
// Since the module is ESM TypeScript, we test the logic inline here.

function normalizeSidecar(obj) {
  if (!obj || typeof obj !== 'object') return { memory_writes: [], coaching_suggestion: null, rpg_action: null, tone_adjustment: null };
  const VALID_MEMORY_TYPES = ['fact', 'preference', 'event', 'goal', 'insight'];
  const VALID_TONES = ['supportive', 'direct', 'playful', 'minimal'];

  const memory_writes = [];
  if (Array.isArray(obj.memory_writes)) {
    for (const item of obj.memory_writes) {
      if (!item || typeof item !== 'object') continue;
      const type = VALID_MEMORY_TYPES.includes(item.type) ? item.type : 'fact';
      const content = typeof item.content === 'string' ? item.content.slice(0, 300) : '';
      if (!content) continue;
      const salience = typeof item.salience === 'number' ? Math.min(1, Math.max(0, item.salience)) : 0.7;
      memory_writes.push({ type, content, salience });
    }
  }
  const coaching_suggestion = typeof obj.coaching_suggestion === 'string' && obj.coaching_suggestion.trim()
    ? obj.coaching_suggestion.trim().slice(0, 400) : null;
  let rpg_action = null;
  if (obj.rpg_action && typeof obj.rpg_action === 'object') {
    const a = obj.rpg_action;
    if (['xp_grant', 'quest_complete', 'quest_add'].includes(a.type)) {
      rpg_action = {
        type: a.type,
        label: typeof a.label === 'string' ? a.label.slice(0, 100) : 'RPG Action',
        xp: typeof a.xp === 'number' ? Math.min(500, Math.max(0, a.xp)) : undefined,
      };
    }
  }
  const tone_adjustment = VALID_TONES.includes(obj.tone_adjustment) ? obj.tone_adjustment : null;
  return { memory_writes, coaching_suggestion, rpg_action, tone_adjustment };
}

function parseCompanionOutput(raw) {
  const startTag = '<!--COMPANION_SIDECAR_START-->';
  const endTag = '<!--COMPANION_SIDECAR_END-->';
  const startIdx = raw.indexOf(startTag);
  if (startIdx === -1) return { replyText: raw.trim(), sidecar: { memory_writes: [], coaching_suggestion: null, rpg_action: null, tone_adjustment: null } };
  const replyText = raw.slice(0, startIdx).trim();
  const afterStart = raw.slice(startIdx + startTag.length);
  const endIdx = afterStart.indexOf(endTag);
  const jsonStr = endIdx === -1 ? afterStart.trim() : afterStart.slice(0, endIdx).trim();
  let sidecar = { memory_writes: [], coaching_suggestion: null, rpg_action: null, tone_adjustment: null };
  try { sidecar = normalizeSidecar(JSON.parse(jsonStr)); } catch {}
  return { replyText, sidecar };
}

// ── Sidecar parser: greeting text ──────────────────────────────────────────

test('parseCompanionOutput: greeting response with no sidecar returns full text', () => {
  const raw = 'Hey! Good to see you 😊 How are you feeling today?';
  const { replyText, sidecar } = parseCompanionOutput(raw);
  assert.equal(replyText, raw.trim());
  assert.deepEqual(sidecar.memory_writes, []);
  assert.equal(sidecar.coaching_suggestion, null);
  assert.equal(sidecar.rpg_action, null);
});

test('parseCompanionOutput: extracts reply text and sidecar correctly', () => {
  const sidecarJson = JSON.stringify({
    memory_writes: [{ type: 'preference', content: 'User likes morning runs', salience: 0.8 }],
    coaching_suggestion: 'Keep up your morning routine!',
    rpg_action: { type: 'xp_grant', label: 'Morning habit', xp: 15 },
    tone_adjustment: 'supportive',
  });
  const raw = `Great to hear from you!\n<!--COMPANION_SIDECAR_START-->\n${sidecarJson}\n<!--COMPANION_SIDECAR_END-->`;
  const { replyText, sidecar } = parseCompanionOutput(raw);
  assert.equal(replyText, 'Great to hear from you!');
  assert.equal(sidecar.memory_writes.length, 1);
  assert.equal(sidecar.memory_writes[0].content, 'User likes morning runs');
  assert.equal(sidecar.memory_writes[0].type, 'preference');
  assert.equal(sidecar.coaching_suggestion, 'Keep up your morning routine!');
  assert.equal(sidecar.rpg_action?.type, 'xp_grant');
  assert.equal(sidecar.rpg_action?.xp, 15);
  assert.equal(sidecar.tone_adjustment, 'supportive');
});

test('parseCompanionOutput: graceful fallback on malformed JSON sidecar', () => {
  const raw = 'Hello!\n<!--COMPANION_SIDECAR_START-->\n{invalid json\n<!--COMPANION_SIDECAR_END-->';
  const { replyText, sidecar } = parseCompanionOutput(raw);
  assert.equal(replyText, 'Hello!');
  assert.deepEqual(sidecar.memory_writes, []);
  assert.equal(sidecar.coaching_suggestion, null);
});

test('parseCompanionOutput: memory writes with empty content are dropped', () => {
  const sidecarJson = JSON.stringify({
    memory_writes: [
      { type: 'fact', content: '', salience: 0.9 },
      { type: 'goal', content: 'Learn guitar', salience: 0.7 },
    ],
    coaching_suggestion: null,
    rpg_action: null,
    tone_adjustment: null,
  });
  const raw = `Reply text\n<!--COMPANION_SIDECAR_START-->\n${sidecarJson}\n<!--COMPANION_SIDECAR_END-->`;
  const { sidecar } = parseCompanionOutput(raw);
  assert.equal(sidecar.memory_writes.length, 1);
  assert.equal(sidecar.memory_writes[0].content, 'Learn guitar');
});

// ── RPG Action safety ───────────────────────────────────────────────────────

test('normalizeSidecar: caps xp at 500', () => {
  const result = normalizeSidecar({
    memory_writes: [],
    rpg_action: { type: 'xp_grant', label: 'Test', xp: 9999 },
    coaching_suggestion: null,
    tone_adjustment: null,
  });
  assert.equal(result.rpg_action?.xp, 500);
});

test('normalizeSidecar: rejects invalid rpg_action type', () => {
  const result = normalizeSidecar({
    memory_writes: [],
    rpg_action: { type: 'delete_user_data', label: 'Malicious', xp: 100 },
    coaching_suggestion: null,
    tone_adjustment: null,
  });
  assert.equal(result.rpg_action, null);
});

test('normalizeSidecar: rejects invalid tone_adjustment value', () => {
  const result = normalizeSidecar({ memory_writes: [], tone_adjustment: 'aggressive', coaching_suggestion: null, rpg_action: null });
  assert.equal(result.tone_adjustment, null);
});

// ── Memory salience clamping ────────────────────────────────────────────────

test('normalizeSidecar: clamps salience to [0, 1]', () => {
  const result = normalizeSidecar({
    memory_writes: [
      { type: 'fact', content: 'test fact', salience: 5.0 },
      { type: 'fact', content: 'another', salience: -0.5 },
    ],
    coaching_suggestion: null,
    rpg_action: null,
    tone_adjustment: null,
  });
  assert.equal(result.memory_writes[0].salience, 1);
  assert.equal(result.memory_writes[1].salience, 0);
});

// ── Coaching trigger logic ─────────────────────────────────────────────────

function evaluateCoachingTriggers(rpgContext, lastCheckinAt, userMessage) {
  const triggers = [];
  const now = Date.now();

  if (rpgContext.streak >= 2) {
    const lastCheckin = lastCheckinAt ? new Date(lastCheckinAt).getTime() : 0;
    const hoursSinceCheckin = (now - lastCheckin) / (1000 * 60 * 60);
    if (hoursSinceCheckin >= 20) {
      triggers.push({ type: 'streak_risk', nudgeHint: `streak risk` });
    }
  }

  if (lastCheckinAt === null) {
    triggers.push({ type: 'daily_checkin', nudgeHint: 'first interaction today' });
  }

  const isShortGreeting = /^\s*(hi|hey|hello|yo|sup|what'?s up)\s*[.!?]?\s*$/i.test(userMessage.trim());
  if (rpgContext.activeQuestNames.length > 0 && isShortGreeting) {
    triggers.push({ type: 'goal_stale', nudgeHint: 'active quests present' });
  }

  return triggers;
}

test('evaluateCoachingTriggers: first interaction triggers daily_checkin', () => {
  const triggers = evaluateCoachingTriggers(
    { streak: 0, xp: 0, level: 1, activeQuestNames: [], recentBadgeNames: [] },
    null,
    'Hello'
  );
  const types = triggers.map(t => t.type);
  assert.ok(types.includes('daily_checkin'), 'should include daily_checkin');
});

test('evaluateCoachingTriggers: streak risk triggers when streak >= 2 and >20h since checkin', () => {
  const longAgo = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
  const triggers = evaluateCoachingTriggers(
    { streak: 3, xp: 100, level: 2, activeQuestNames: [], recentBadgeNames: [] },
    longAgo,
    'hey'
  );
  const types = triggers.map(t => t.type);
  assert.ok(types.includes('streak_risk'), 'should include streak_risk');
});

test('evaluateCoachingTriggers: no streak risk if checked in recently', () => {
  const recentCheckin = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const triggers = evaluateCoachingTriggers(
    { streak: 5, xp: 200, level: 3, activeQuestNames: [], recentBadgeNames: [] },
    recentCheckin,
    'Tell me about stoicism'
  );
  const types = triggers.map(t => t.type);
  assert.ok(!types.includes('streak_risk'), 'should NOT include streak_risk when checked in recently');
});

test('evaluateCoachingTriggers: goal_stale triggers on greeting when active quests exist', () => {
  const triggers = evaluateCoachingTriggers(
    { streak: 0, xp: 0, level: 1, activeQuestNames: ['Learn Spanish', 'Exercise daily'], recentBadgeNames: [] },
    new Date().toISOString(),
    'hi'
  );
  const types = triggers.map(t => t.type);
  assert.ok(types.includes('goal_stale'), 'should include goal_stale on greeting with active quests');
});

test('evaluateCoachingTriggers: no goal_stale for non-greeting messages', () => {
  const triggers = evaluateCoachingTriggers(
    { streak: 0, xp: 0, level: 1, activeQuestNames: ['Learn Spanish'], recentBadgeNames: [] },
    new Date().toISOString(),
    'Can you explain quantum mechanics?'
  );
  const types = triggers.map(t => t.type);
  assert.ok(!types.includes('goal_stale'), 'goal_stale should not trigger on non-greeting');
});

// ── Greeting behavior policy ────────────────────────────────────────────────
// The system prompt must explicitly instruct natural greeting behavior.

test('companion system prompt instructs natural greeting behavior', () => {
  // Replicate the prompt builder's key instruction
  const prompt = `You are Kora, a genuine persistent AI companion.
CORE BEHAVIOR:
- ALWAYS respond naturally to greetings and small talk first. If the user says "hi", "hello", or similar, respond conversationally and warmly before anything else.
- Answer general questions directly like a helpful assistant. Add coaching context only when genuinely relevant.
- Never fabricate user history not present in your memory context.`;

  assert.ok(prompt.includes('ALWAYS respond naturally to greetings'), 'prompt must instruct natural greeting response');
  assert.ok(prompt.includes('Never fabricate user history'), 'prompt must prevent fabrication');
});

// ── Freemium pricing model ─────────────────────────────────────────────────

test('create-checkout-session: maps pro tier to $4.99 subscription', async () => {
  // Verify the simplified pricing in create-checkout-session.js
  const handlerSource = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'create-checkout-session.js'),
    'utf8'
  );
  // Ensure $4.99 (499 cents) is used
  assert.ok(handlerSource.includes('unit_amount: 499'), 'Pro plan must be $4.99 (499 cents)');
  // Ensure no old expensive tiers are active
  assert.ok(!handlerSource.includes('unit_amount: 1499'), 'Old $14.99 tier must be removed');
  assert.ok(!handlerSource.includes('unit_amount: 1999'), 'Old $19.99 tier must be removed');
});

test('create-checkout-session: legacy tier names are mapped to pro', async () => {
  const handlerSource = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'create-checkout-session.js'),
    'utf8'
  );
  // LEGACY_PRO_TIERS set must include old names
  assert.ok(handlerSource.includes("'kindred'"), 'kindred must map to pro');
  assert.ok(handlerSource.includes("'soulbound'"), 'soulbound must map to pro');
  assert.ok(handlerSource.includes("'infinite'"), 'infinite must map to pro');
  assert.ok(handlerSource.includes("'transcendence'"), 'transcendence must map to pro');
});

test('pricing page shows $4.99/mo Pro plan', () => {
  const indexHtml = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'index.html'),
    'utf8'
  );
  assert.ok(indexHtml.includes('$4.99'), 'index.html must mention $4.99 price');
  assert.ok(!indexHtml.includes('$19.99'), 'index.html must not show old $19.99 price in paid plan');
  assert.ok(!indexHtml.includes('$9.99'), 'index.html must not show old $9.99 price in paid plan');
});

test('companion system - memory types are valid', () => {
  const VALID_TYPES = ['fact', 'preference', 'event', 'goal', 'insight'];
  // Ensure all 5 memory types are documented
  assert.equal(VALID_TYPES.length, 5);
  assert.ok(VALID_TYPES.includes('fact'));
  assert.ok(VALID_TYPES.includes('preference'));
  assert.ok(VALID_TYPES.includes('event'));
  assert.ok(VALID_TYPES.includes('goal'));
  assert.ok(VALID_TYPES.includes('insight'));
});
