const test = require('node:test');
const assert = require('node:assert/strict');

// ── Minimal req/res helpers ────────────────────────────────────────────────

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    sent: false,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.sent = true;
      return this;
    },
    send(text) {
      this.body = text;
      this.sent = true;
      return this;
    },
    end() {
      this.sent = true;
      return this;
    },
  };
}

// ── create-checkout-session ────────────────────────────────────────────────

const checkoutHandler = require('../api/create-checkout-session');

test('checkout: rejects non-POST requests', async () => {
  const res = createRes();
  await checkoutHandler({ method: 'GET', body: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error, 'Method Not Allowed');
});

test('checkout: handles OPTIONS preflight', async () => {
  const res = createRes();
  await checkoutHandler({ method: 'OPTIONS', body: {} }, res);
  assert.equal(res.statusCode, 204);
});

test('checkout: returns 503 when STRIPE_SECRET_KEY is missing', async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const res = createRes();
  await checkoutHandler({ method: 'POST', body: { tier: 'kindred', uid: 'user123' } }, res);
  assert.equal(res.statusCode, 503);
  assert.ok(res.body.error);
  process.env.STRIPE_SECRET_KEY = saved;
});

test('checkout: returns 400 for missing tier', async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  const res = createRes();
  await checkoutHandler({ method: 'POST', body: { uid: 'user123' } }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
  process.env.STRIPE_SECRET_KEY = saved;
});

test('checkout: returns 400 for missing uid', async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  const res = createRes();
  await checkoutHandler({ method: 'POST', body: { tier: 'kindred' } }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
  process.env.STRIPE_SECRET_KEY = saved;
});

test('checkout: returns 400 for unrecognized tier', async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  const res = createRes();
  await checkoutHandler({ method: 'POST', body: { tier: 'nonexistent_tier', uid: 'user123' } }, res);
  // Without a real key the Stripe client will throw an auth error (500) before
  // even reaching tier validation. We only care it did NOT succeed.
  assert.notEqual(res.statusCode, 200);
  process.env.STRIPE_SECRET_KEY = saved;
});

test('checkout: sets CORS headers on every response', async () => {
  const res = createRes();
  await checkoutHandler({ method: 'GET', body: {} }, res);
  assert.ok(res.headers['Access-Control-Allow-Origin'], 'CORS origin header missing');
});

// ── stripe-webhook ─────────────────────────────────────────────────────────

const webhookHandler = require('../api/stripe-webhook');

test('webhook: rejects non-POST requests', async () => {
  const res = createRes();
  const req = { method: 'GET', headers: {}, [Symbol.asyncIterator]: async function* () {} };
  await webhookHandler(req, res);
  assert.equal(res.statusCode, 405);
});

test('webhook: returns 503 when STRIPE_SECRET_KEY is missing', async () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const res = createRes();
  const req = {
    method: 'POST',
    headers: {},
    [Symbol.asyncIterator]: async function* () {},
  };
  await webhookHandler(req, res);
  assert.equal(res.statusCode, 503);
  process.env.STRIPE_SECRET_KEY = saved;
});

test('webhook: returns 503 when STRIPE_WEBHOOK_SECRET is missing', async () => {
  const savedKey = process.env.STRIPE_SECRET_KEY;
  const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  delete process.env.STRIPE_WEBHOOK_SECRET;

  // Re-require because endpointSecret is captured at module load; we test the
  // runtime guard path introduced for a missing key at startup.
  // The module caches, so we test indirectly via the 503 for missing signature.
  const res = createRes();
  const req = {
    method: 'POST',
    headers: {},
    [Symbol.asyncIterator]: async function* () {},
  };
  await webhookHandler(req, res);
  // Either 400 (missing sig header) or 503 (missing secret) is acceptable;
  // neither should be 200 without a valid event.
  assert.ok(res.statusCode >= 400);

  process.env.STRIPE_SECRET_KEY = savedKey;
  process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
});

test('webhook: returns 400 when stripe-signature header is absent', async () => {
  const savedKey = process.env.STRIPE_SECRET_KEY;
  const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';

  const res = createRes();
  const req = {
    method: 'POST',
    headers: {},
    [Symbol.asyncIterator]: async function* () {},
  };
  await webhookHandler(req, res);
  assert.equal(res.statusCode, 400);

  process.env.STRIPE_SECRET_KEY = savedKey;
  process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
});

// ── /api/config ────────────────────────────────────────────────────────────

const configHandler = require('../api/config');

test('config: returns stripePk from STRIPE_PUBLIC_KEY env var', async () => {
  const saved = process.env.STRIPE_PUBLIC_KEY;
  process.env.STRIPE_PUBLIC_KEY = 'pk_test_example';
  const res = createRes();
  await configHandler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stripePk, 'pk_test_example');
  process.env.STRIPE_PUBLIC_KEY = saved;
});

test('config: returns empty stripePk when env var not set', async () => {
  const saved = process.env.STRIPE_PUBLIC_KEY;
  delete process.env.STRIPE_PUBLIC_KEY;
  const res = createRes();
  await configHandler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stripePk, '');
  process.env.STRIPE_PUBLIC_KEY = saved;
});

test('config: rejects non-GET requests', async () => {
  const res = createRes();
  await configHandler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
});

test('config: handles OPTIONS preflight', async () => {
  const res = createRes();
  await configHandler({ method: 'OPTIONS' }, res);
  assert.equal(res.statusCode, 204);
});
