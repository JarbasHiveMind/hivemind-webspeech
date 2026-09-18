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
import { resolveHivemindJs, HiveMindJsMismatch } from './hivemind_js_pin.mjs';

import { floatTo16BitPCM, encodeAudioBinaryFrame } from '../src/audio.js';
import { BIN_TYPES_FALLBACK } from '../src/constants.js';

const require = createRequire(import.meta.url);

// hivemind-js is not published to npm. resolveHivemindJs in
// hivemind_js_pin.mjs finds the file and checks its sha384 against the
// integrity attribute src/index.html carries, so this suite drives the build
// the page loads, or fails and says which file differs.

// A mismatch is an error, not a skip: the file is there and it is the wrong
// build. Only a missing client (no fetch possible) skips the test.
async function resolveOrNull() {
  try {
    return await resolveHivemindJs();
  } catch (err) {
    if (err instanceof HiveMindJsMismatch) throw err;
    return null;
  }
}

const hmPath = await resolveOrNull();

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
