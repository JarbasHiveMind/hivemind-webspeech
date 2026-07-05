// HiveMind-js exposes BIN_TYPES on globalThis when loaded via <script>. This
// mirror is used only as a fallback when that global is unavailable (eg. in a
// unit test that has not loaded the client), keeping the WIRE-1 binary sub-type
// values in one place.
export const BIN_TYPES_FALLBACK = Object.freeze({
  UNDEFINED: 0,
  RAW_AUDIO: 1,
  NUMPY_IMAGE: 2,
  FILE: 3,
  STT_AUDIO_TRANSCRIBE: 4,
  STT_AUDIO_HANDLE: 5,
  TTS_AUDIO: 6,
});
