// Client-side settings for hivemind-webspeech.
//
// Three independent axes decide how the browser behaves, each defaulting to the
// original streaming behaviour so a page with no saved settings acts exactly as
// before:
//
//   wakeWord  — 'off'            : every VAD-segmented utterance is streamed
//               'precise-onnx-js': capture is gated behind an in-browser wake
//                                  word; audio is only streamed once it fires
//   transport — 'base64'         : utterances are sent as base64 WAV in a
//                                  recognizer_loop:b64_audio bus message
//               'binary'         : utterances are sent as raw-PCM WIRE-1 binary
//                                  frames (STT_AUDIO_HANDLE), smaller on the wire
//   tts       — 'server-text'    : the spoken reply is shown as text
//               'phoonnx-js'     : the reply text is synthesized in-browser and
//                                  played back
//
// The module is DOM-free and side-effect-free so it can be unit tested under
// Node with a plain object as the storage backend.

export const WAKE_WORD_MODES = ['off', 'precise-onnx-js'];
export const TRANSPORT_MODES = ['base64', 'binary'];
export const TTS_MODES = ['server-text', 'phoonnx-js'];

// A hosted precise-lite wake-word model. Any Precise `.onnx` URL works; this one
// is served from jsDelivr so the page needs no committed weights.
export const DEFAULT_PRECISE_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/OpenVoiceOS/precise-lite-models@master/wakewords/hey_mycroft/hey_mycroft.onnx';

// A phoonnx voice id (see the phoonnx.js voice registry). Piper / Home-Assistant
// compatible espeak voices and unicode voices are both valid.
export const DEFAULT_PHOONNX_VOICE = 'phoonnx_en-US_miro_unicode';

export const DEFAULTS = Object.freeze({
  wakeWord: 'off',
  transport: 'base64',
  tts: 'server-text',
  preciseModelUrl: DEFAULT_PRECISE_MODEL_URL,
  phoonnxVoice: DEFAULT_PHOONNX_VOICE,
});

const STORAGE_KEY = 'hivemind-webspeech.settings';

function pickEnum(value, allowed, fallback) {
  return allowed.indexOf(value) !== -1 ? value : fallback;
}

function pickString(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

// Coerce an arbitrary (possibly partial or hostile) object into a valid config,
// filling every field from DEFAULTS. Never throws.
export function normalizeConfig(partial) {
  const p = partial && typeof partial === 'object' ? partial : {};
  return {
    wakeWord: pickEnum(p.wakeWord, WAKE_WORD_MODES, DEFAULTS.wakeWord),
    transport: pickEnum(p.transport, TRANSPORT_MODES, DEFAULTS.transport),
    tts: pickEnum(p.tts, TTS_MODES, DEFAULTS.tts),
    preciseModelUrl: pickString(p.preciseModelUrl, DEFAULTS.preciseModelUrl),
    phoonnxVoice: pickString(p.phoonnxVoice, DEFAULTS.phoonnxVoice),
  };
}

// Read the saved config from a Storage-like backend (localStorage or any object
// exposing getItem). Returns the defaults when nothing is stored or the stored
// value is unparseable.
export function loadConfig(storage) {
  if (!storage || typeof storage.getItem !== 'function') return normalizeConfig();
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (_) {
    return normalizeConfig();
  }
  if (!raw) return normalizeConfig();
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch (_) {
    return normalizeConfig();
  }
}

// Persist a config (after normalizing it) to a Storage-like backend. Returns the
// normalized config that was written.
export function saveConfig(storage, config) {
  const normalized = normalizeConfig(config);
  if (storage && typeof storage.setItem === 'function') {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (_) {
      /* storage full or unavailable — the in-memory config still applies */
    }
  }
  return normalized;
}

export { STORAGE_KEY };
