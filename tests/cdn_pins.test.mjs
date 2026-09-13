/**
 * Supply-chain guard: every CDN script the page loads names an exact version
 * or a full commit sha and carries a sha384 integrity hash.
 *
 * One exception, and it is a limitation of the platform rather than a gap
 * here: a dynamic ``import()`` takes no integrity attribute, so the two
 * @noble modules the page imports for its v3 handshake can only be pinned by
 * version. They are checked for that below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'src', 'index.html'), 'utf8');
const js = readFileSync(resolve(__dirname, '..', 'src', 'index.js'), 'utf8');

const PINNED = /@(\d+\.\d+\.\d+|[0-9a-f]{40})\//;

test('every external script tag is pinned and has an integrity hash', () => {
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc="(https:[^"]+)"[^>]*>/gs)];
  assert.ok(tags.length >= 3);
  for (const [tag, src] of tags) {
    assert.match(src, PINNED, `unpinned: ${src}`);
    assert.match(tag, /\bintegrity="sha384-[A-Za-z0-9+/]{64}"/, `no integrity: ${src}`);
    assert.match(tag, /\bcrossorigin="anonymous"/, `no crossorigin: ${src}`);
  }
});

test('the lazily loaded precise-onnx-js scripts are pinned and hashed', () => {
  assert.doesNotMatch(js, /precise-onnx-js@main/);
  assert.match(js, /const PRECISE_COMMIT = '[0-9a-f]{40}'/);
  assert.match(js, /PRECISE_MFCC_SRI = 'sha384-[A-Za-z0-9+/]{64}'/);
  assert.match(js, /PRECISE_WW_SRI = 'sha384-[A-Za-z0-9+/]{64}'/);
  assert.match(js, /s\.integrity = integrity/);
});


test('the dynamically imported @noble modules are version pinned', () => {
  const imports = [...html.matchAll(/import\('(https:[^']+)'\)/g)].map(m => m[1]);
  assert.ok(imports.length >= 2, 'the @noble imports are gone from the page');
  for (const url of imports) {
    assert.match(url, /@\d+\.\d+\.\d+\//, `unpinned dynamic import: ${url}`);
  }
});
