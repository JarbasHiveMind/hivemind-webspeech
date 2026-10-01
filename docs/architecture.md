# Audio pipeline and architecture

hivemind-webspeech is a static web page that turns the browser into a thin
HiveMind satellite. It does two things locally: capture the microphone and run
voice activity detection. It delegates everything else to the hub. This page
traces what happens on the wire.

## The division of labor

| Stage | Where it runs |
|---|---|
| Microphone capture | Browser |
| Voice activity detection (VAD) | Browser (Silero model via `onnxruntime-web`) |
| PCM conversion + base64 | Browser |
| Transport (encrypted WebSocket) | Browser ↔ Hub (HiveMind-js) |
| Speech-to-text (STT) | Hub |
| Intent matching + skills | Hub (OVOS) |
| Text-to-speech (TTS) | Hub |
| Rendering the reply | Browser |

The browser never runs a speech engine. It ships audio, and the hub turns audio
into meaning and a reply.

## Components

The page (`src/index.html`) loads its runtime dependencies from CDNs:

- **[HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js)**: the HiveMind
  Protocol V1 WebSocket client (loaded from jsDelivr). It handles authentication
  with the access key, the password handshake (PBKDF2-HMAC-SHA256 key
  derivation), AES-GCM encryption, and the HiveMind message envelope, all over
  native Web Crypto, so no separate crypto shims are needed.
- **`onnxruntime-web`**: runs the VAD neural model in the browser.
- **`@ricky0123/vad-web`**: the VAD wrapper. It handles microphone access, the
  Silero model, and `onSpeechStart` / `onSpeechEnd` callbacks, plus PCM/base64
  utilities.
- **Bulma**: CSS only.

`src/index.js` wires these together.

## The pipeline, step by step

### 1. Connect

When you click **CONNECT**, the page reads the four form fields and calls:

```js
hivemind_connection.connect(ip, port, "HivemindWebSpeechV0.2", key, password)
```

HiveMind-js opens the WebSocket, authenticates with the access key, then runs
the V1 password handshake to derive the AES-GCM session key before any payload
is sent. On success, `onHiveConnected` fires, the status line (`role="status"`) shows
`Connected to HiveMind.`, and the microphone starts. A dropped connection fires
`onHiveDisconnected`: the status line shows `HiveMind connection lost.` and the
microphone pauses. A microphone start failure or an audio send failure also
shows its cause on the status line.

### 2. Detect speech

`vad.MicVAD` runs continuously once the connection is up. It uses the
Silero VAD model to detect speech boundaries:

- `onSpeechStart`: logged when you begin speaking.
- `onSpeechEnd(samples)`: fires when you stop, handing back the captured audio
  samples for just that utterance.

There is no wake word. The VAD toggle button is the gate. While VAD is
running, every detected utterance is sent.

### 3. Encode

On speech end, the samples are encoded and serialized:

```js
const pcm    = floatTo16BitPCM(samples)
const base64 = vad.utils.arrayBufferToBase64(pcm.buffer)
```

The whole utterance goes as a single base64 string. The bytes are headerless
16-bit little-endian PCM at 16 kHz: HIVEMIND-AUDIO-1 §2 says the STT audio
"carries **uncompressed PCM** samples", and the receiver builds its audio
object from the field with the rate and the width it is given, so a RIFF header
in there is transcribed as audio — a click in front of the utterance. There is
no streaming or chunking.

A WAV is built as well, from the same samples, for the on-page playback control
only: a browser can not play bare samples. The container never reaches the
wire.

### 4. Send

The base64 audio is wrapped in an OVOS bus message and sent inside a HiveMind
`bus` envelope:

```js
{
  msg_type: "bus",
  payload: {
    type: "recognizer_loop:b64_audio",
    data: { audio: <base64 headerless 16-bit PCM> },
    context: {
      source: "javascript",
      destination: "HiveMind",
      platform: "JarbasHivemindJsV0.2"
    }
  }
}
```

The message carries the audio field and nothing that describes it: the V1
client's `sendAudioB64(base64)` takes the string alone. HIVEMIND-AUDIO-1 §2
covers that case — a receiver "**MUST** fall back to the defaults" when the
metadata is absent, and the defaults are signed 16-bit PCM, 16000 Hz, mono,
which is exactly what this page sends. The `binary` transport does state
`sample_rate` and `sample_width`, because a WIRE-1 binary frame has a metadata
block to put them in.

This whole `bus` envelope is AES-GCM-encrypted by HiveMind-js (using the
session key derived during the handshake) before it leaves the browser. What
crosses the wire is ciphertext, not the JSON above. The convenience method
`sendAudioB64(base64)` on the V1 client builds and encrypts this message for
you. The hub must be configured to accept the decoded message
(`hivemind-core allow-msg "recognizer_loop:b64_audio"`) and run an OVOS speech service new
enough to decode it (`ovos-dinkum-listener >= 0.0.3a19`).

### 5. Hub processing

On the hub, `recognizer_loop:b64_audio` feeds the audio into the OVOS
pipeline: speech-to-text, then intent matching, then skill execution, then
text-to-speech. All of this is the hub operator's configuration. The browser
has no say in which engines are used.

### 6. Reply

When a skill speaks, the hub emits a `speak` message back over the WebSocket.
HiveMind-js fires `onMycroftSpeak`, and the page renders the text:

```
HiveMind says: It's 3:45 PM.
```

The reply here is **text**, the spoken utterance string, rendered on the page,
not played as audio.

## Relationship to the native satellite

This is the browser counterpart of
[hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite),
which performs the identical mic-capture, VAD, and ship-to-hub role as a
Python process using
[hivemind-websocket-client](https://github.com/JarbasHiveMind/hivemind-websocket-client).
The thicker satellites add local stages on top of this base: a wake word
([HiveMind-voice-relay](https://github.com/JarbasHiveMind/HiveMind-voice-relay)),
and finally on-device STT and TTS
([HiveMind-voice-sat](https://github.com/JarbasHiveMind/HiveMind-voice-sat)).

---
[← Configuration](configuration.md) · [Home](index.md) · [Troubleshooting →](troubleshooting.md)
