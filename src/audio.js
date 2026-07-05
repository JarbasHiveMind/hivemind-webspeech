// Audio helpers and the capture state machine shared by src/index.js.
//
// Everything here is DOM-free and network-free: the browser-only pieces (wake
// word model, phoonnx voice, HiveMind-js socket) are injected as callables so
// the routing/gating/encoding logic can be unit tested under Node.

import { BIN_TYPES_FALLBACK } from './constants.js';

// Convert normalized float32 PCM ([-1, 1], as produced by the VAD) to 16-bit
// little-endian PCM bytes — the raw audio hivemind-core's binary STT handlers
// wrap in a speech_recognition AudioData (sample_width = 2).
export function floatTo16BitPCM(float32) {
  const out = new Uint8Array(float32.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < float32.length; i++) {
    let s = float32[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

// Build the WIRE-1 binary frame (bitstring) for one complete utterance, ready to
// be encrypted and sent. `encodeBitstring` and `binTypes` come from HiveMind-js
// (globalThis) so this stays a pure function.
export function encodeAudioBinaryFrame(encodeBitstring, binTypes, pcmBytes, meta) {
  const types = binTypes || BIN_TYPES_FALLBACK;
  const metadata = Object.assign(
    { sample_rate: 16000, sample_width: 2 },
    meta || {}
  );
  return encodeBitstring('bin', pcmBytes, metadata, types.STT_AUDIO_HANDLE);
}

// Gate that decides, per VAD-segmented utterance, whether it should be streamed.
//
//   'off'             -> every utterance is sent.
//   'precise-onnx-js' -> the gate stays disarmed until the wake word fires
//                        inside an utterance; the utterance that trips it is
//                        swallowed, and the NEXT utterance is streamed, after
//                        which the gate disarms again.
//
// `detect` is an async (Float32Array) => boolean that reports whether the wake
// word fired somewhere in the utterance. It is only consulted while disarmed.
export class CaptureGate {
  constructor(mode, detect) {
    this.mode = mode;
    this.detect = detect;
    this.armed = false;
  }

  reset() {
    this.armed = false;
  }

  // Returns { send, armed } for a completed utterance.
  async consider(float32) {
    if (this.mode !== 'precise-onnx-js') {
      return { send: true, armed: false };
    }
    if (this.armed) {
      this.armed = false;
      return { send: true, armed: false };
    }
    let fired = false;
    try {
      fired = await this.detect(float32);
    } catch (_) {
      fired = false;
    }
    this.armed = !!fired;
    return { send: false, armed: this.armed };
  }
}

// Feed a whole utterance to a streaming Precise detector in fixed-size chunks,
// reporting whether it fired at any point. `detector.predict(chunk)` follows the
// precise-onnx-js API (2048-sample Float32Array chunks, returns boolean).
export async function detectWakeWordInUtterance(detector, float32, chunkSize = 2048) {
  if (typeof detector.clear === 'function') detector.clear();
  let fired = false;
  for (let off = 0; off < float32.length; off += chunkSize) {
    let chunk = float32.subarray(off, off + chunkSize);
    if (chunk.length < chunkSize) {
      const padded = new Float32Array(chunkSize);
      padded.set(chunk);
      chunk = padded;
    }
    if (await detector.predict(chunk)) fired = true;
  }
  return fired;
}
