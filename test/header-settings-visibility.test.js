const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'index.html'),
  'utf8'
);

test('header layout allows controls to wrap instead of clipping settings', () => {
  assert.match(
    indexHtml,
    /<header class="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-white\/5 mb-3">/,
    'header should wrap crowded controls'
  );

  assert.match(
    indexHtml,
    /<div class="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">/,
    'header controls container should wrap and keep trailing actions aligned right'
  );
});

test('settings button remains prioritized over lower-priority header controls', () => {
  assert.match(
    indexHtml,
    /id="btn-settings"[^>]*class="order-last shrink-0[^"]*"/,
    'settings button should resist shrinking when the header gets crowded'
  );

  assert.match(
    indexHtml,
    /openKoraLiveVoiceModal\(\)"[^>]*class="hidden sm:flex[^"]*"/,
    'Ask Kora control should hide on smaller screens before settings'
  );

  assert.match(
    indexHtml,
    /openUpgradeModal\(\)"[^>]*class="hidden xs:flex[^"]*"/,
    'Upgrade control should hide on the smallest screens before settings'
  );
});
