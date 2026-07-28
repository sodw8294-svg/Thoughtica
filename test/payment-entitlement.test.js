const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'index.html'),
  'utf8'
);

const indexTsx = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'index.tsx'),
  'utf8'
);

const webhookJs = fs.readFileSync(
  path.join(__dirname, '..', 'api', 'stripe-webhook.js'),
  'utf8'
);

const checkoutJs = fs.readFileSync(
  path.join(__dirname, '..', 'api', 'create-checkout-session.js'),
  'utf8'
);

// ── index.html payment_success URL param security ─────────────────────────────

test('payment_success URL param does not set isPremium in index.html', () => {
  // Locate the payment_success handler block
  const idx = indexHtml.indexOf("params.get('payment_success')");
  assert.ok(idx !== -1, 'payment_success handler must exist');
  // Extract the next ~600 chars to cover the handler body
  const block = indexHtml.slice(idx, idx + 600);
  assert.equal(block.includes('isPremium'), false,
    'payment_success handler must not set isPremium');
  assert.equal(block.includes("tier: '"), false,
    'payment_success handler must not set tier');
  assert.equal(block.includes('trialActive'), false,
    'payment_success handler must not set trialActive');
});

test('payment_success toast message does not claim plan is already unlocked', () => {
  assert.equal(
    indexHtml.includes('unlocked! Welcome to your upgraded Sanctuary'),
    false,
    'Toast must not falsely claim plan is unlocked on checkout return'
  );
  assert.ok(
    indexHtml.includes('Payment received'),
    'Toast should show a neutral payment-received message'
  );
});

// ── React app (index.tsx) local premium grant removal ─────────────────────────

test('React app upgrade buttons do not directly set tier to pro', () => {
  assert.equal(
    indexTsx.includes("tier: 'pro', trialActive: true"),
    false,
    'No direct tier:pro grant allowed in React UI handlers'
  );
});

test('React app upgrade buttons do not directly set aiInteractionsRemaining to 9999', () => {
  assert.equal(
    indexTsx.includes('aiInteractionsRemaining: 9999'),
    false,
    'aiInteractionsRemaining must not be set to 9999 locally from UI'
  );
});

test('React app upgrade flow calls purchaseTierStripe instead of setState', () => {
  assert.ok(
    indexTsx.includes('purchaseTierStripe'),
    'purchaseTierStripe function must exist in React app'
  );
  // purchaseTierStripe must call the checkout API endpoint
  assert.ok(
    indexTsx.includes('/api/create-checkout-session'),
    'purchaseTierStripe must fetch /api/create-checkout-session'
  );
});

// ── Webhook idempotency ────────────────────────────────────────────────────────

test('stripe-webhook has idempotency protection via processedStripeEvents collection', () => {
  assert.ok(
    webhookJs.includes('processedStripeEvents'),
    'Webhook must store processed event IDs for idempotency'
  );
});

test('stripe-webhook verifies Stripe signature before processing', () => {
  assert.ok(
    webhookJs.includes('constructEvent'),
    'Webhook must call stripe.webhooks.constructEvent for signature verification'
  );
  assert.ok(
    webhookJs.includes('stripe-signature'),
    'Webhook must read the stripe-signature header'
  );
});

test('stripe-webhook handles subscription deletion to revoke premium', () => {
  assert.ok(
    webhookJs.includes('customer.subscription.deleted'),
    'Webhook must handle subscription deletion to revoke entitlement'
  );
});

// ── create-checkout-session has no entitlement writes ─────────────────────────

test('create-checkout-session does not write isPremium to Firebase', () => {
  assert.equal(
    checkoutJs.includes('isPremium'),
    false,
    'Checkout session creator must not write isPremium'
  );
});

test('create-checkout-session does not write user entitlement to Firestore', () => {
  assert.equal(
    checkoutJs.includes('userRef'),
    false,
    'Checkout session creator must not write user entitlement'
  );
});

test('create-checkout-session success_url does not include tier as URL proof of entitlement', () => {
  // The success URL should not pass tier as a URL param that could be spoofed
  assert.equal(
    checkoutJs.includes('payment_success=true&tier='),
    false,
    'success_url must not embed tier as a spoofable URL param'
  );
});

// ── Env var validation ────────────────────────────────────────────────────────

test('stripe-webhook validates required env vars at startup', () => {
  assert.ok(
    webhookJs.includes('STRIPE_WEBHOOK_SECRET'),
    'Webhook must reference STRIPE_WEBHOOK_SECRET'
  );
  assert.ok(
    webhookJs.includes('FIREBASE_SERVICE_ACCOUNT'),
    'Webhook must reference FIREBASE_SERVICE_ACCOUNT'
  );
});

test('create-checkout-session validates required env vars at startup', () => {
  assert.ok(
    checkoutJs.includes('STRIPE_SECRET_KEY'),
    'Checkout handler must reference STRIPE_SECRET_KEY'
  );
  assert.ok(
    checkoutJs.includes('PUBLIC_URL'),
    'Checkout handler must reference PUBLIC_URL'
  );
});
