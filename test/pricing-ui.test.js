const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

for (const file of ['index.html', 'src/index.html']) {
  test(`${file}: pricing UI only renders canonical Pro plan`, () => {
    const source = read(file);
    assert.match(source, /buySubscription\('pro'\)/, 'should render canonical Pro checkout action');
    assert.match(source, /Thoughtica Pro/, 'should label the plan as Thoughtica Pro');
    assert.match(source, /\$4\.99\/mo/, 'should keep Pro price at $4.99/mo');
    assert.doesNotMatch(source, /buySubscription\('plus'\)/, 'should not render plus plan action');
    assert.doesNotMatch(source, /buySubscription\('infinite'\)/, 'should not render infinite plan action');
  });

  test(`${file}: legacy aliases normalize to pro in UI state`, () => {
    const source = read(file);
    assert.match(source, /const LEGACY_PRO_TIER_ALIASES = new Set\(\['pro', 'kindred', 'soulbound', 'plus', 'infinite', 'transcendence'\]\)/);
    assert.match(source, /return LEGACY_PRO_TIER_ALIASES\.has\(normalizedTier\) \? 'pro' : normalizedTier;/);
    assert.match(source, /const tierRaw = urlParams\.get\('tier'\) \|\| 'pro';/, 'payment return should default to pro');
    assert.match(source, /S\.subscriptionTier = tier;/, 'normalized tier should be stored in UI state');
  });
}

test('checkout API keeps legacy aliases compatible with Pro checkout', () => {
  const source = read('api/create-checkout-session.js');
  for (const legacyTier of ['kindred', 'soulbound', 'plus', 'infinite', 'transcendence']) {
    assert.match(source, new RegExp(`'${legacyTier}'`), `${legacyTier} should remain accepted by checkout`);
  }
  assert.match(source, /unit_amount: 499/, 'Pro checkout price should remain $4.99/mo');
});
