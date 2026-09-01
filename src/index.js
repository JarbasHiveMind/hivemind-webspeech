// @ts-nocheck
//
// hivemind-webspeech browser glue. Three independent, persisted options decide
// behaviour (see src/config.js); each defaults to the original behaviour:
//   - wake word : off (VAD push-to-talk) | precise-onnx-js (in-browser gating)
//   - transport : base64 bus message     | binary WIRE-1 audio frames
//   - tts       : server reply as text   | phoonnx.js in-browser synthesis
//
// The DOM-free logic (config, PCM encoding, capture gating) lives in the sibling
// modules and is unit tested; this file wires it to the page, the microphone,
// and the HiveMind-js client.

import { loadConfig, saveConfig, WAKE_WORD_MODES, TRANSPORT_MODES, TTS_MODES } from './config.js';
import {
  floatTo16BitPCM,
  encodeAudioBinaryFrame,
  CaptureGate,
  detectWakeWordInUtterance,
} from './audio.js';

// ── Library CDN locations (loaded lazily, only when the matching mode is on) ───
// precise-onnx-js ships plain browser scripts that export globals; phoonnx.js is
// an ESM package built on demand by esm.sh. Neither is fetched under the default
// settings, so the default page is unchanged.
const PRECISE_MFCC_URL = 'https://cdn.jsdelivr.net/gh/TigreGotico/precise-onnx-js@main/src/mfcc.js';
const PRECISE_WW_URL = 'https://cdn.jsdelivr.net/gh/TigreGotico/precise-onnx-js@main/src/wakeword.js';
const PHOONNX_ESM_URL = 'https://esm.sh/gh/TigreGotico/phoonnx.js';
const PHOONNX_VOICES_ESM_URL = 'https://esm.sh/gh/TigreGotico/phoonnx.js/voices';

let config = loadConfig(globalThis.localStorage);

function getToggleButton() {
  return document.getElementById('toggleVAD');
}

function logLine(text) {
  const speechList = document.getElementById('audio-list');
  if (!speechList) return;
  const entry = document.createElement('p');
  entry.textContent = text;
  speechList.prepend(entry);
}

// ── HiveMind-js client ────────────────────────────────────────────────────────
// The handshake, encryption, and the recognizer_loop:b64_audio bus message are
// handled by the client; it negotiates the highest protocol version both peers
// support (WIRE-1) and falls back to the legacy v1 handshake against older
// hivemind-core instances.
const hivemind_connection = new JarbasHiveMind();

hivemind_connection.onHiveConnected = function () {
  window.alert('Connected to HiveMind!');
};

hivemind_connection.onMycroftSpeak = function (mycroft_message) {
  const utterance = mycroft_message.data.utterance;
  logLine('HiveMind says: ' + utterance);
  if (config.tts === 'phoonnx-js' && utterance) {
    speakWithPhoonnx(utterance).catch((e) => console.error('phoonnx TTS failed:', e));
  }
};

hivemind_connection.onHiveDisconnected = function () {
  window.alert('Hivemind connection lost...');
};

// A close code 1008 (Policy Violation) means the hub rejected the
// credentials/handshake — terminal, not a transient drop. The client does not
// auto-retry (connect() only fires once, from page load), but without this the
// user only sees the generic "connection lost" alert with no indication why.
hivemind_connection.onHiveError = function (error) {
  console.error('HiveMind error:', error);
  logLine('HiveMind error: ' + (error && error.message ? error.message : error));
};

window.hivemind_connection = hivemind_connection;

// ── Binary audio transport (WIRE-1 STT_AUDIO_HANDLE frames) ───────────────────
// HiveMind-js has no convenience method for raw-audio binary frames, so this
// builds and sends one directly: the same bitstring codec the client uses, then
// its own encrypted-send path (Noise transport for v3, AES-GCM binary for v1).
function canSendBinary(conn) {
  return !!(conn._noiseTransport || conn._binarize);
}

async function sendAudioBinary(conn, pcmBytes, meta) {
  const frame = encodeAudioBinaryFrame(
    globalThis.encodeBitstring,
    globalThis.BIN_TYPES,
    pcmBytes,
    meta
  );
  if (conn._noiseTransport) {
    const v3frame = await conn._noiseTransport.encryptFrame(frame);
    conn.ws.send(v3frame.buffer);
  } else {
    await conn._sendEncryptedBinary(frame);
  }
}

// ── Wake word (precise-onnx-js), loaded on demand ─────────────────────────────
let _preciseLoaded = null;
function loadScriptOnce(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + url));
    document.head.appendChild(s);
  });
}

async function ensurePrecise() {
  if (!_preciseLoaded) {
    _preciseLoaded = (async () => {
      // mfcc.js must load before wakeword.js; both need globalThis.ort (already
      // present — onnxruntime-web is loaded for the VAD).
      await loadScriptOnce(PRECISE_MFCC_URL);
      await loadScriptOnce(PRECISE_WW_URL);
      return globalThis.PreciseOnnxWakeWord;
    })();
  }
  return _preciseLoaded;
}

let _wakeDetector = null;
async function getWakeDetector() {
  if (!_wakeDetector) {
    const PreciseOnnxWakeWord = await ensurePrecise();
    _wakeDetector = await PreciseOnnxWakeWord.load(config.preciseModelUrl);
  }
  return _wakeDetector;
}

const captureGate = new CaptureGate(config.wakeWord, async (float32) => {
  const detector = await getWakeDetector();
  return detectWakeWordInUtterance(detector, float32);
});

// ── TTS (phoonnx.js), loaded on demand ────────────────────────────────────────
let _phoonnx = null;
async function ensurePhoonnx() {
  if (!_phoonnx) {
    _phoonnx = (async () => {
      const [mod, voicesMod] = await Promise.all([
        import(/* @vite-ignore */ PHOONNX_ESM_URL),
        import(/* @vite-ignore */ PHOONNX_VOICES_ESM_URL),
      ]);
      return { mod, voicesMod, voice: null };
    })();
  }
  return _phoonnx;
}

async function speakWithPhoonnx(text) {
  const p = await ensurePhoonnx();
  if (!p.voice) {
    const entry = p.voicesMod.getVoice(config.phoonnxVoice);
    if (!entry) throw new Error('unknown phoonnx voice: ' + config.phoonnxVoice);
    p.voice = await p.mod.loadVoice(entry);
  }
  const blob = await p.mod.synthesizeWav(p.voice, text);
  const audio = new Audio(URL.createObjectURL(blob));
  await audio.play();
}

// ── Connect ───────────────────────────────────────────────────────────────────
window.onConnect = () => {
  console.log('connecting to HiveMind');
  const ip = document.getElementById('hmip').value;
  const port = document.getElementById('hmport').value;
  const key = document.getElementById('hmkey').value;
  // The password alone is normally enough: against a v3 hivemind-core instance
  // HiveMind-js derives the Noise PSK as argon2id(password, SHA-256(node_id))
  // in-browser and negotiates the default ChaChaPoly suite; on the legacy v1
  // path it drives the PBKDF2-HMAC-SHA256 handshake + AES-GCM session key.
  const password = document.getElementById('hmpassword').value;
  const user = 'HivemindWebSpeechV0.2';

  const options = {};
  const psk = (document.getElementById('hmpsk').value || '').trim();
  if (psk) options.psk = psk;
  const serverKey = (document.getElementById('hmserverkey').value || '').trim();
  if (serverKey) options.serverNoiseKey = serverKey;

  hivemind_connection.connect(ip, port, user, key, password, options);

  window.toggleVAD();
  getToggleButton().disabled = false;
  getToggleButton().classList.remove('is-loading');
};

// ── Settings panel ────────────────────────────────────────────────────────────
function applyConfigToForm() {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  set('cfgWakeWord', config.wakeWord);
  set('cfgTransport', config.transport);
  set('cfgTts', config.tts);
  set('cfgPreciseModel', config.preciseModelUrl);
  set('cfgPhoonnxVoice', config.phoonnxVoice);
}

function readConfigFromForm() {
  const val = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  };
  return {
    wakeWord: val('cfgWakeWord', config.wakeWord),
    transport: val('cfgTransport', config.transport),
    tts: val('cfgTts', config.tts),
    preciseModelUrl: val('cfgPreciseModel', config.preciseModelUrl),
    phoonnxVoice: val('cfgPhoonnxVoice', config.phoonnxVoice),
  };
}

window.onSaveSettings = () => {
  config = saveConfig(globalThis.localStorage, readConfigFromForm());
  // Re-target the pieces that hold state from the previous config.
  captureGate.mode = config.wakeWord;
  captureGate.reset();
  _wakeDetector = null; // reload if the model URL changed
  if (_phoonnx) _phoonnx = null; // reload if the voice changed
  applyConfigToForm();
  logLine('Settings saved.');
};

// ── Microphone + VAD ──────────────────────────────────────────────────────────
async function main() {
  applyConfigToForm();

  function addAudio(audioUrl) {
    const entry = document.createElement('li');
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = audioUrl;
    entry.appendChild(audio);
    return entry;
  }

  async function handleUtterance(arr) {
    const decision = await captureGate.consider(arr);
    if (!decision.send) {
      if (decision.armed) logLine('Wake word detected — listening…');
      return;
    }

    const wavBuffer = vad.utils.encodeWAV(arr);
    const base64 = vad.utils.arrayBufferToBase64(wavBuffer);
    const url = `data:audio/wav;base64,${base64}`;
    document.getElementById('audio-list').prepend(addAudio(url));

    try {
      if (config.transport === 'binary' && canSendBinary(hivemind_connection)) {
        const pcm = floatTo16BitPCM(arr);
        await sendAudioBinary(hivemind_connection, pcm, { sample_rate: 16000, sample_width: 2 });
      } else {
        if (config.transport === 'binary') {
          console.warn('binary transport not negotiated; using base64');
        }
        await hivemind_connection.sendAudioB64(base64);
      }
    } catch (e) {
      console.error('failed to send audio:', e);
    }
  }

  try {
    const myvad = await vad.MicVAD.new({
      onSpeechStart: () => console.log('Speech start'),
      onSpeechEnd: (arr) => {
        console.log('Speech end');
        handleUtterance(arr).catch((e) => console.error(e));
      },
    });

    window.myvad = myvad;

    window.toggleVAD = () => {
      if (myvad.listening === false) {
        myvad.start();
        getToggleButton().textContent = 'Stop VAD';
      } else {
        myvad.pause();
        getToggleButton().textContent = 'Start VAD';
      }
    };
  } catch (e) {
    console.error('Failed:', e);
  }
}

// Guard the DOM bootstrap so the module can be imported headlessly in tests.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  // Exposed for reference / debugging.
  window.WAKE_WORD_MODES = WAKE_WORD_MODES;
  window.TRANSPORT_MODES = TRANSPORT_MODES;
  window.TTS_MODES = TTS_MODES;
  main();
}
