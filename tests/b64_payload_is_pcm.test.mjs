/**
 * What the base64 transport actually puts on the wire.
 *
 * The other page tests stub `vad.utils.arrayBufferToBase64` as `() => 'AAAA'`,
 * which hides the bytes: with that stub the field reads the same whether the
 * page sends a WAV, headerless PCM, or nothing at all. This file supplies REAL
 * encoders and reads the payload back.
 *
 * The contract is HIVEMIND-AUDIO-1 §2 — the audio inside the STT tags "carries
 * uncompressed PCM samples" — and panel decision
 * `hivemind-b64-stt-audio-pcm-or-wav`, answered `pcm`. hivemind-core's b64
 * handler builds a `speech_recognition.AudioData` from this field with the rate
 * and the width it is given, so a container header in it is transcribed as
 * audio: a click in front of the utterance and an offset on everything after.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { floatTo16BitPCM } from '../src/audio.js';

class FakeElement {
  constructor(tag, id) {
    this.tagName = tag;
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.children = [];
    this.attrs = {};
    const classes = new Set();
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    };
  }
  prepend(child) { this.children.unshift(child); }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
}

// The real encoders, not stubs. `encodeWAV` writes a 44-byte RIFF header in
// front of the same frames, which is what the <audio> preview needs and what
// the wire must not get.
function arrayBufferToBase64(buffer) {
  return Buffer.from(new Uint8Array(buffer)).toString('base64');
}

function encodeWAV(float32, sampleRate = 16000) {
  const pcm = floatTo16BitPCM(float32);
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out.buffer;
}

let counter = 0;
async function loadPage() {
  const ids = ['hmip', 'hmport', 'hmkey', 'hmpassword', 'hmpsk', 'hmserverkey',
    'toggleVAD', 'audio-list', 'status', 'cfgWakeWord', 'cfgTransport', 'cfgTts',
    'cfgPreciseModel', 'cfgPhoonnxVoice'];
  const els = Object.fromEntries(ids.map((id) => [id, new FakeElement('x', id)]));
  const sent = [];
  const connections = [];
  globalThis.document = {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => new FakeElement(tag),
    head: new FakeElement('head'),
  };
  globalThis.window = globalThis;
  globalThis.alert = () => {};
  globalThis.JarbasHiveMind = class {
    constructor() { connections.push(this); }
    connect() {}
    sendAudioB64(b64) { sent.push(b64); return Promise.resolve(); }
  };
  let mic;
  globalThis.vad = {
    MicVAD: {
      new: async (opts) => {
        mic = { opts, listening: false, start() { this.listening = true; }, pause() { this.listening = false; } };
        return mic;
      },
    },
    utils: { encodeWAV, arrayBufferToBase64 },
  };
  counter += 1;
  await import(`../src/index.js?pcmcase=${counter}`);
  await new Promise((r) => setImmediate(r));
  return { els, sent, conn: connections[connections.length - 1], mic: () => mic };
}

const flush = () => new Promise((r) => setImmediate(r));

// a short ramp, so every sample is distinct and a one-sample shift is visible
function utterance(n = 320) {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = (i % 64) / 64 - 0.5;
  return arr;
}

test('the base64 transport sends headerless PCM, not a WAV', async () => {
  const { sent, conn, mic } = await loadPage();
  window.onConnect();
  conn.onHiveConnected();
  await flush();
  await flush();

  const arr = utterance();
  mic().opts.onSpeechEnd(arr);
  await flush();
  await flush();

  assert.equal(sent.length, 1, 'exactly one base64 payload reached the socket');
  const payload = Buffer.from(sent[0], 'base64');

  // the frames themselves, byte for byte
  assert.deepEqual(new Uint8Array(payload), floatTo16BitPCM(arr));

  // and no container in front of them
  assert.notEqual(payload.subarray(0, 4).toString('latin1'), 'RIFF',
    'the b64 STT field carries uncompressed PCM (HIVEMIND-AUDIO-1 §2); '
    + 'a RIFF header here is transcribed as audio');
  assert.equal(payload.length, arr.length * 2,
    'a 44-byte header would make the payload longer than the frames');
});

test('the <audio> preview still gets a playable WAV', async () => {
  // The container is not wrong everywhere: a browser can not play headerless
  // samples. The preview keeps it, the wire does not get it.
  const { els, conn, mic } = await loadPage();
  window.onConnect();
  conn.onHiveConnected();
  await flush();
  await flush();

  mic().opts.onSpeechEnd(utterance());
  await flush();
  await flush();

  const entry = els['audio-list'].children[0];
  const audio = entry.children[0];
  assert.equal(audio.tagName, 'audio');
  assert.match(audio.src, /^data:audio\/wav;base64,/);
  const wav = Buffer.from(audio.src.split(',')[1], 'base64');
  assert.equal(wav.subarray(0, 4).toString('latin1'), 'RIFF');
});
