/**
 * Config plumbing + capture-routing unit tests. These are DOM-free and
 * network-free: they exercise the persisted settings model (src/config.js) and
 * the audio helpers / capture gate (src/audio.js) that decide, per option, how
 * the page behaves. Browser-only pieces (the wake-word model, the phoonnx voice,
 * the live socket) are stubbed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULTS,
  WAKE_WORD_MODES,
  TRANSPORT_MODES,
  TTS_MODES,
  normalizeConfig,
  loadConfig,
  saveConfig,
  STORAGE_KEY,
} from '../src/config.js';

import {
  floatTo16BitPCM,
  encodeAudioBinaryFrame,
  CaptureGate,
  detectWakeWordInUtterance,
} from '../src/audio.js';

import { BIN_TYPES_FALLBACK } from '../src/constants.js';

// A minimal localStorage-like backend.
function memStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
}

// ── defaults ──────────────────────────────────────────────────────────────────

test('defaults preserve the original behaviour on every axis', () => {
  assert.equal(DEFAULTS.wakeWord, 'off');
  assert.equal(DEFAULTS.transport, 'base64');
  assert.equal(DEFAULTS.tts, 'server-text');
});

test('loadConfig returns the defaults when storage is empty or missing', () => {
  assert.deepEqual(loadConfig(memStorage()), normalizeConfig());
  assert.deepEqual(loadConfig(null), normalizeConfig());
  assert.deepEqual(loadConfig(memStorage({ [STORAGE_KEY]: '{ not json' })), normalizeConfig());
});

// ── normalization / hardening ─────────────────────────────────────────────────

test('normalizeConfig rejects unknown enum values and falls back to defaults', () => {
  const c = normalizeConfig({ wakeWord: 'bogus', transport: 'udp', tts: 42 });
  assert.equal(c.wakeWord, 'off');
  assert.equal(c.transport, 'base64');
  assert.equal(c.tts, 'server-text');
});

test('normalizeConfig accepts every valid enum value', () => {
  for (const w of WAKE_WORD_MODES) assert.equal(normalizeConfig({ wakeWord: w }).wakeWord, w);
  for (const t of TRANSPORT_MODES) assert.equal(normalizeConfig({ transport: t }).transport, t);
  for (const t of TTS_MODES) assert.equal(normalizeConfig({ tts: t }).tts, t);
});

test('blank string fields fall back to defaults', () => {
  const c = normalizeConfig({ preciseModelUrl: '   ', phoonnxVoice: '' });
  assert.equal(c.preciseModelUrl, DEFAULTS.preciseModelUrl);
  assert.equal(c.phoonnxVoice, DEFAULTS.phoonnxVoice);
});

// ── round-trip ────────────────────────────────────────────────────────────────

test('saveConfig then loadConfig round-trips a full non-default config', () => {
  const storage = memStorage();
  const written = saveConfig(storage, {
    wakeWord: 'precise-onnx-js',
    transport: 'binary',
    tts: 'phoonnx-js',
    preciseModelUrl: 'https://example/ww.onnx',
    phoonnxVoice: 'phoonnx_eu-ES_dii_unicode',
  });
  const read = loadConfig(storage);
  assert.deepEqual(read, written);
  assert.equal(read.transport, 'binary');
  assert.equal(read.wakeWord, 'precise-onnx-js');
  assert.equal(read.tts, 'phoonnx-js');
});

// ── binary transport encoding ─────────────────────────────────────────────────

test('floatTo16BitPCM produces little-endian 16-bit samples clamped to range', () => {
  const pcm = floatTo16BitPCM(new Float32Array([0, 1, -1, 2, -2]));
  assert.equal(pcm.length, 10);
  const view = new DataView(pcm.buffer);
  assert.equal(view.getInt16(0, true), 0);
  assert.equal(view.getInt16(2, true), 0x7fff); // +1 full scale
  assert.equal(view.getInt16(4, true), -0x8000); // -1 full scale
  assert.equal(view.getInt16(6, true), 0x7fff); // +2 clamped
  assert.equal(view.getInt16(8, true), -0x8000); // -2 clamped
});

test('encodeAudioBinaryFrame builds a STT_AUDIO_HANDLE bin frame the client can decode', () => {
  // Use the real HiveMind-js codec if available; otherwise assert the fallback
  // bin-type wiring (the frame is opaque without the decoder).
  const captured = {};
  const fakeEncode = (msgType, payload, metadata, binType) => {
    Object.assign(captured, { msgType, payload, metadata, binType });
    return new Uint8Array([1, 2, 3]);
  };
  const pcm = floatTo16BitPCM(new Float32Array([0.5, -0.5]));
  const frame = encodeAudioBinaryFrame(fakeEncode, BIN_TYPES_FALLBACK, pcm, { lang: 'en-us' });
  assert.deepEqual([...frame], [1, 2, 3]);
  assert.equal(captured.msgType, 'bin');
  assert.equal(captured.binType, BIN_TYPES_FALLBACK.STT_AUDIO_HANDLE);
  assert.equal(captured.payload, pcm);
  assert.equal(captured.metadata.sample_rate, 16000);
  assert.equal(captured.metadata.sample_width, 2);
  assert.equal(captured.metadata.lang, 'en-us');
});

// ── wake-word capture gate ────────────────────────────────────────────────────

test("wake word 'off' streams every utterance", async () => {
  const gate = new CaptureGate('off', async () => true);
  for (let i = 0; i < 3; i++) {
    const d = await gate.consider(new Float32Array(4));
    assert.equal(d.send, true);
  }
});

test('precise gate swallows the wake-word utterance then streams the next one', async () => {
  let fire = false;
  const gate = new CaptureGate('precise-onnx-js', async () => fire);

  // No wake word yet — nothing is streamed.
  assert.deepEqual(await gate.consider(new Float32Array(4)), { send: false, armed: false });

  // Wake word fires: this utterance is swallowed, the gate arms.
  fire = true;
  assert.deepEqual(await gate.consider(new Float32Array(4)), { send: false, armed: true });

  // Next utterance (the command) streams; the gate disarms.
  fire = false;
  assert.deepEqual(await gate.consider(new Float32Array(4)), { send: true, armed: false });

  // And we are back to requiring the wake word again.
  assert.deepEqual(await gate.consider(new Float32Array(4)), { send: false, armed: false });
});

test('a detector error is treated as no-detection (fail safe, stays disarmed)', async () => {
  const gate = new CaptureGate('precise-onnx-js', async () => {
    throw new Error('model blew up');
  });
  assert.deepEqual(await gate.consider(new Float32Array(4)), { send: false, armed: false });
});

test('detectWakeWordInUtterance feeds fixed chunks and reports any activation', async () => {
  const chunks = [];
  const detector = {
    clear() {},
    async predict(chunk) {
      chunks.push(chunk.length);
      return chunk[0] === 9; // fire on the marked chunk only
    },
  };
  const utt = new Float32Array(5000); // 3 chunks of 2048 (last padded)
  utt[2048] = 9; // mark the start of the 2nd chunk
  const fired = await detectWakeWordInUtterance(detector, utt, 2048);
  assert.equal(fired, true);
  assert.deepEqual(chunks, [2048, 2048, 2048]); // last chunk zero-padded to size
});
