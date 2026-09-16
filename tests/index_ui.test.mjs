/**
 * Page glue tests for src/index.js. A small fake DOM and stub globals
 * (JarbasHiveMind, vad) stand in for the browser, so the connection and
 * microphone state machine runs under node without a network or a mic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

function makePage() {
  const ids = ['hmip', 'hmport', 'hmkey', 'hmpassword', 'hmpsk', 'hmserverkey',
    'toggleVAD', 'audio-list', 'status', 'cfgWakeWord', 'cfgTransport', 'cfgTts',
    'cfgPreciseModel', 'cfgPhoonnxVoice'];
  const els = Object.fromEntries(ids.map((id) => [id, new FakeElement('x', id)]));
  els.toggleVAD.disabled = true;
  els.toggleVAD.classList.add('is-loading');
  return els;
}

let counter = 0;
async function loadPage({ micNew, sendAudioB64 }) {
  const els = makePage();
  const alerts = [];
  const connections = [];
  globalThis.document = {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => new FakeElement(tag),
    head: new FakeElement('head'),
  };
  globalThis.window = globalThis;
  globalThis.alert = (msg) => alerts.push(msg);
  globalThis.JarbasHiveMind = class {
    constructor() { connections.push(this); }
    connect() {}
    sendAudioB64(b64) { return sendAudioB64 ? sendAudioB64(b64) : Promise.resolve(); }
  };
  globalThis.vad = {
    MicVAD: { new: micNew },
    utils: { encodeWAV: () => new ArrayBuffer(4), arrayBufferToBase64: () => 'AAAA' },
  };
  counter += 1;
  await import(`../src/index.js?case=${counter}`);
  await new Promise((r) => setImmediate(r));
  return { els, alerts, conn: connections[connections.length - 1] };
}

const flush = () => new Promise((r) => setImmediate(r));

function fakeMic(opts) {
  return {
    listening: false,
    opts,
    start() { this.listening = true; },
    pause() { this.listening = false; },
  };
}

test('a rejected MicVAD.new shows the cause and CONNECT does not throw', async () => {
  let calls = 0;
  const { els, alerts, conn } = await loadPage({
    micNew: async () => { calls += 1; throw new Error('Permission denied'); },
  });

  assert.equal(typeof window.toggleVAD, 'function');
  await assert.doesNotReject(async () => window.onConnect());
  assert.equal(calls, 0, 'the microphone must not start before the handshake');

  conn.onHiveConnected();
  await flush();
  await flush();

  assert.equal(calls, 1);
  assert.match(els.status.textContent, /Microphone failed: Permission denied/);
  assert.equal(els.toggleVAD.disabled, false);
  assert.equal(els.toggleVAD.classList.contains('is-loading'), false);
  assert.deepEqual(alerts, []);

  // A click retries the start instead of throwing.
  await assert.doesNotReject(async () => window.toggleVAD());
  assert.equal(calls, 2);
});

test('the microphone starts on onHiveConnected and a send failure is visible', async () => {
  let mic;
  const { els, alerts, conn } = await loadPage({
    micNew: async (opts) => { mic = fakeMic(opts); return mic; },
    sendAudioB64: async () => { throw new Error('socket closed'); },
  });

  window.onConnect();
  assert.equal(mic, undefined, 'the microphone must not start before the handshake');
  conn.onHiveConnected();
  await flush();
  await flush();
  assert.equal(mic.listening, true);
  assert.equal(els.toggleVAD.textContent, 'Stop VAD');
  assert.equal(els.status.textContent, 'Listening.');

  mic.opts.onSpeechEnd(new Float32Array(16));
  await flush();
  await flush();
  assert.match(els.status.textContent, /Failed to send audio: socket closed/);

  conn.onHiveDisconnected();
  assert.equal(els.status.textContent, 'HiveMind connection lost.');
  assert.equal(mic.listening, false);
  assert.deepEqual(alerts, []);
});
