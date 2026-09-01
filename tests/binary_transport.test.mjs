/**
 * Binary-transport interop test. The 'binary' audio option builds a WIRE-1
 * bin frame with the real HiveMind-js codec; this asserts the exact frame the
 * page emits round-trips back through the client's decoder as a STT_AUDIO_HANDLE
 * binary message carrying the original PCM bytes and the sample-rate/width
 * metadata hivemind-core reads. It self-skips when HiveMind-js is not resolvable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { floatTo16BitPCM, encodeAudioBinaryFrame } from '../src/audio.js';
import { BIN_TYPES_FALLBACK } from '../src/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// hivemind-js is not published to npm; fall back to the same vendored/fetched
// copy tests/e2e.test.mjs and tests/v3_negotiation.test.mjs use, so this test
// runs (rather than silently skipping) on a plain `npm install && npm test`.
const CLIENT_URL = process.env.HIVEMIND_JS_URL ||
    'https://cdn.jsdelivr.net/gh/JarbasHiveMind/HiveMind-js@dev/static/js/hivemind.js';

async function resolveHivemindJs() {
  if (process.env.HIVEMIND_JS_PATH) return resolve(process.env.HIVEMIND_JS_PATH);
  try {
    return require.resolve('hivemind-js');
  } catch {
    const sibling = resolve(__dirname, '..', '..', 'HiveMind-js', 'static', 'js', 'hivemind.js');
    if (existsSync(sibling)) return sibling;
    const vendored = resolve(__dirname, 'vendor', 'hivemind.cjs');
    if (existsSync(vendored)) return vendored;
    try {
      const res = await fetch(CLIENT_URL);
      if (!res.ok) return null;
      const body = await res.text();
      mkdirSync(resolve(__dirname, 'vendor'), { recursive: true });
      writeFileSync(vendored, body);
      return vendored;
    } catch {
      return null;
    }
  }
}

const hmPath = await resolveHivemindJs();

test('binary audio frame round-trips through the HiveMind-js WIRE-1 codec', { skip: !hmPath ? 'HiveMind-js not found (set HIVEMIND_JS_PATH)' : false }, async () => {
  const hm = require(hmPath);
  const { encodeBitstring, decodeBitstring, BIN_TYPES } = hm;

  const samples = new Float32Array([0.25, -0.25, 0.5, -0.5]);
  const pcm = floatTo16BitPCM(samples);

  const frame = encodeAudioBinaryFrame(encodeBitstring, BIN_TYPES, pcm, { lang: 'en-us' });
  const decoded = await decodeBitstring(frame);

  assert.equal(decoded.msgType, 'bin');
  assert.equal(decoded.binType, (BIN_TYPES || BIN_TYPES_FALLBACK).STT_AUDIO_HANDLE);
  assert.equal(decoded.metadata.sample_rate, 16000);
  assert.equal(decoded.metadata.sample_width, 2);
  assert.equal(decoded.metadata.lang, 'en-us');
  assert.deepEqual([...new Uint8Array(decoded.payload)], [...pcm]);
});
