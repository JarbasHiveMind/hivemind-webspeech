/**
 * The tests must drive the HiveMind-js build the page ships.
 *
 * Three suites load hivemind-js. Each used to default to
 * `HiveMind-js@dev`, so `npm test` could pass against a client the page never
 * loads, and a break between the pinned build and dev would show up only in a
 * browser. These checks are offline: they read the repository, not the CDN.
 * `npm run verify:pins` is the one that fetches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { hivemindJsPinFromPage, hivemindJsUrlFromPage, CLIENT_URL } from './hivemind_js_pin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(resolve(__dirname, '..', ...p), 'utf8');

const SUITES = [
  'binary_transport.test.mjs',
  'e2e.test.mjs',
  'v3_negotiation.test.mjs',
];

test('the page pins HiveMind-js to a full commit', () => {
  assert.match(hivemindJsPinFromPage(), /^[0-9a-f]{40}$/);
  assert.equal(CLIENT_URL, hivemindJsUrlFromPage());
});

test('no suite falls back to a branch build of HiveMind-js', () => {
  for (const name of SUITES) {
    const src = read('tests', name);
    assert.doesNotMatch(src, /HiveMind-js@(dev|master|main)\b/, `${name} names a branch`);
    assert.match(src, /from '\.\/hivemind_js_pin\.mjs'/, `${name} does not read the page's pin`);
  }
});

test('the CI checkout of HiveMind-js is the commit the page pins', () => {
  const wf = read('.github', 'workflows', 'e2e.yml');
  const ref = wf.match(/repository: JarbasHiveMind\/HiveMind-js\s*\n\s*ref: (\S+)/);
  assert.ok(ref, 'e2e.yml has no HiveMind-js checkout');
  assert.equal(ref[1], hivemindJsPinFromPage());
});

test('verify_pins.mjs covers the page tags and the precise scripts', () => {
  const script = read('scripts', 'verify_pins.mjs');
  assert.match(script, /createHash\('sha384'\)/);
  assert.match(script, /PRECISE_COMMIT/);
  assert.match(script, /index\.html/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['verify:pins'], 'node scripts/verify_pins.mjs');
  assert.doesNotMatch(pkg.scripts.test, /verify_pins/, 'npm test must stay offline');
});
