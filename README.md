# hivemind-webspeech

> [!WARNING]
> HiveMind is pre-release software under active development. Expect bugs and
> breaking changes between releases.

Talk to a [hivemind-core](https://github.com/JarbasHiveMind/HiveMind-core) instance
from your web browser. No install, no audio drivers, and no Python are needed. Open
a page, grant microphone access, and speak.

The browser captures your microphone and runs voice activity detection (VAD)
locally to isolate spoken utterances. It streams each utterance as base64-encoded
audio over an encrypted WebSocket to hivemind-core, using
[HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js).

The client negotiates the highest HiveMind protocol version both peers support
(WIRE-1). Against a **protocol v3** hivemind-core instance it runs the Noise
handshake over the default `Noise_XXpsk2_25519_ChaChaPoly_SHA256` suite, giving
full cipher parity with hivemind-core. Against older hivemind-core versions it
falls back to the legacy **v1** password handshake (PBKDF2-HMAC-SHA256 key
derivation plus AES-GCM encryption). It pairs native Web Crypto with the pure-JS
`@noble/ciphers` + `@noble/hashes` bundle for the two primitives Web Crypto lacks
(ChaCha20-Poly1305 and argon2id). hivemind-core does everything else: speech-to-text,
intent matching, skills, and the spoken reply. It sends the answer back as text
rendered on the page.

### Protocol v3 (Noise)

Against a v3 hivemind-core instance (hivemind-bus-client 0.10.1a1 / hivemind-core
4.7.0a1 or newer), the browser negotiates the **default**
`Noise_XXpsk2_25519_ChaChaPoly_SHA256` suite and derives the PSK as
`argon2id(password, SHA-256(node_id))` in the browser. This is byte-for-byte
identical to what hivemind-core computes. So the **Password** field alone is
enough:

- **Password (default):** type the client password from `hivemind-core
  add-client`. Nothing else is required. There is no server-side KDF change and no
  provisioning step. The client runs ChaCha20-Poly1305 via `@noble/ciphers` and
  argon2id via `@noble/hashes`.
- **Provisioned PSK (optional):** paste a 64-hex-char PSK (equal to
  `argon2id(password, SHA-256(node_id))`) into the *Protocol v3* section of the
  connect form to skip on-device derivation. An optional **server key pin** enables
  KKpsk0 TOFU pinning.
- **PBKDF2 (fallback):** if a hivemind-core instance explicitly advertises the
  PBKDF2 PSK KDF, the client derives the PSK with PBKDF2 from the password
  instead.

There is one caveat. A **minimal** page bundle shipped without the `@noble`
primitives degrades to the Web-Crypto-only AES-GCM (`25519_AESGCM_SHA256`) +
PBKDF2 subset, and then needs a provisioned PSK or a PBKDF2-advertising
hivemind-core instance. If no PSK is available for a v3 hivemind-core instance at
all, the client logs a warning and falls back to the legacy v1 handshake, so the
existing UX keeps working against every hivemind-core instance.

[Online demo](https://jarbashivemind.github.io/hivemind-webspeech)

![screenshot](https://github.com/JarbasHiveMind/hivemind-webspeech/assets/33701864/d3a19394-6bf5-42ca-aa1e-e30e6d9e5b81)

## Where it fits: the satellite spectrum

HiveMind satellites differ by where the work happens. The thinner the client, the
more hivemind-core does. hivemind-webspeech is a browser variant of the thin end:
the page does microphone capture and VAD, and hivemind-core does the rest.

| Client | Runs locally | Runs on hivemind-core |
|---|---|---|
| [HiveMind-cli](https://github.com/JarbasHiveMind/HiveMind-cli) | nothing (text only) | STT · TTS · intent · skills |
| **hivemind-webspeech** (this, in-browser) | microphone · VAD · (optional wake-word · TTS) | STT · intent · skills · (TTS) |
| [hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite) | microphone · VAD | STT · TTS · intent · skills |
| [HiveMind-voice-relay](https://github.com/JarbasHiveMind/HiveMind-voice-relay) | mic · VAD · wake-word | STT · TTS · intent · skills |
| [HiveMind-voice-sat](https://github.com/JarbasHiveMind/HiveMind-voice-sat) | mic · VAD · wake-word · STT · TTS | intent · skills |

hivemind-webspeech is functionally the browser counterpart of
[hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite).
Both capture the mic and run VAD locally, then hand the audio to hivemind-core.
The difference is the runtime (a web page instead of a Python process) and the
transport library ([HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js)
instead of
[hivemind-websocket-client](https://github.com/JarbasHiveMind/hivemind-websocket-client)).
By default speech detection is push-to-talk style, gated by the VAD toggle button,
and hivemind-core does all speech work. The [Settings](#client-side-options) panel
can optionally move a wake word and text-to-speech into the browser.

STT, intent matching, and skills always live on hivemind-core and are owned by the
operator behind access-key authentication. The browser cannot choose the speech
engine. It only ships audio, and optionally speaks the reply locally.

## Client-side options

Three independent options in the page's **Settings** panel control where work
happens. Each is saved in the browser and defaults to the base behavior, so an
untouched page acts exactly as the minimal client. Nothing regresses.

| Option | Default | Alternative | What the alternative does |
|---|---|---|---|
| **Wake word** | `off` | `precise-onnx-js` | Runs a [Precise](https://github.com/MycroftAI/mycroft-precise) `.onnx` wake word in the browser via [precise-onnx-js](https://github.com/TigreGotico/precise-onnx-js) and gates capture. Audio is streamed only after the wake word fires. |
| **Audio transport** | `base64` | `binary` | Sends each utterance as a WIRE-1 `STT_AUDIO_HANDLE` raw-PCM binary frame instead of a base64 WAV bus message, which is smaller and faster on the wire. Falls back to `base64` automatically when the session cannot carry binary frames. |
| **Text to speech** | `server-text` | `phoonnx-js` | Synthesizes the spoken reply in the browser with [phoonnx.js](https://github.com/TigreGotico/phoonnx.js) and plays it, in addition to showing the text. A voice selector picks the model. |

The wake-word and TTS libraries load only when their option is enabled, so the
default page loads nothing extra. The wake-word model is referenced by URL (a
hosted `hey_mycroft` model by default; no weights are committed here) and the
phoonnx voice by id. See
[docs/configuration.md](docs/configuration.md#settings-panel) for the full option
reference, model/voice hosting, and the transport and build notes.

## Prerequisites

- A reachable [HiveMind-core](https://github.com/JarbasHiveMind/HiveMind-core) instance.
- the OVOS speech service behind hivemind-core running `ovos-dinkum-listener >= 0.0.3a19` so it can accept
  audio over the bus.
- A modern browser with `getUserMedia` (microphone) support. The VAD model
  (Silero, via `onnxruntime-web`) loads from a CDN, so the page needs network
  access on first load.

### The TLS rule (read this first)

Browsers refuse to open a non-SSL WebSocket from a page served over HTTPS, and
will only allow plain `ws://` to `127.0.0.1`. In practice this means:

- **Local testing on the same machine.** Serve the page over `http://localhost`
  (or open the file directly) and connect to a hivemind-core instance on
  `127.0.0.1` over plain `ws://`.
- **Anything remote.** Both the page and hivemind-core's WebSocket must be served
  over TLS (`https://` page to `wss://` hivemind-core). A hivemind-core instance
  reachable only over plain `ws://` cannot be used from an `https://` page.

## Quickstart

### 1. Pair: issue credentials on hivemind-core

On the machine running HiveMind-core:

```bash
hivemind-core add-client
# → Access Key: <key>   Password: <password>
```

The browser form's **Password** field is this password. Against a v3
hivemind-core instance the client stretches it with argon2id in the browser to
the Noise PSK, and on the legacy path it derives the AES-GCM session key from it.
See [Protocol v3](#protocol-v3-noise) for the details.

### 2. Allow audio messages on hivemind-core

hivemind-core must be told to accept the audio bus message this client sends:

```bash
hivemind-core allow-msg "recognizer_loop:b64_audio"
```

### 3. Open the page

Use the [hosted demo](https://jarbashivemind.github.io/hivemind-webspeech) or serve
your own copy (see [Build](#build)).

### 4. Connect and speak

1. Fill in **IP**, **Port** (default `5678`), **Access Key**, and **Password**.
2. Click **CONNECT**. An alert confirms `Connected to HiveMind!`.
3. The VAD toggle activates. Click **Start VAD**, then just talk.
4. Each detected utterance is sent to hivemind-core. The spoken reply appears in
   the page as `HiveMind says: …`, and the captured audio is listed with a
   playback control.
5. Click **Stop VAD** to mute capture.

## Build

Runtime dependencies (HiveMind-js, `onnxruntime-web`, `@ricky0123/vad-web`, Bulma
CSS) load from CDNs declared in `src/index.html`, so there is nothing to compile
to run the page. The HiveMind-js client is pulled from jsDelivr, tracking the
`dev` branch so the page always loads the current protocol-v3 client:

```html
<script src="https://cdn.jsdelivr.net/gh/JarbasHiveMind/HiveMind-js@dev/static/js/hivemind.js"></script>
```

Serve `src/` directly with any static web server, or produce a bundled `dist/`
with `esbuild` (the only build-time tool, run via `npx`):

```bash
npm run build      # → ./build.sh: bundles src/*.js into dist/ and copies the HTML
npm run serve      # static server on http://localhost:8000 (DIR=dist to serve a build)
```

The hosted demo is published to the repo's `gh-pages` branch.

## Tests

An end-to-end test drives the same HiveMind-js client the page loads against a
real loopback `hivemind-core` instance. It performs the full handshake, sends an
AES-GCM-encrypted utterance, and asserts hivemind-core decrypted and received it.
A second test exercises the browser client's protocol-v3 negotiation path
directly (see `tests/v3_negotiation.test.mjs`). It feeds the client a synthetic
v3 ServerHello and asserts it selects the AES-GCM Noise suite and derives a valid
PSK from the password via the PBKDF2 KDF. (The loopback hivemind-core floors an
older stack that predates the v3 suite, so full v3-over-the-wire is not exercised
end to end.)

```bash
# Node side: the `ws` WebSocket polyfill used to run the browser client headless.
npm install

# Python side: a venv with the loopback hivemind-core. hivescope floors the whole
# HiveMind 2.x stack itself, so a plain min-pin pulls the right packages.
python -m venv .venv
.venv/bin/python -m pip install "hivescope>=0.5.2a1"

# Run, pointing the test at that venv.
E2E_PYTHON=.venv/bin/python npm test
```

The test (`tests/e2e.test.mjs`, Node's built-in runner) spawns a Python loopback
hivemind-core instance (`tests/loopback_hub.py`, backed by
[hivescope](https://github.com/JarbasHiveMind/hivescope)) and exercises the client
over a real WebSocket via `ws`. It self-skips when no Python hivemind-core
environment is available. Point it at one with
`E2E_PYTHON=/path/to/venv/bin/python`. CI provisions hivemind-core automatically,
see [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml).

## How it works

1. The page instantiates `JarbasHiveMind` (HiveMind-js) and connects with your
   credentials over an encrypted WebSocket.
2. `@ricky0123/vad-web` runs the Silero VAD model in the browser (via
   `onnxruntime-web`) to detect when you start and stop speaking.
3. On speech end, the captured samples are encoded to a WAV buffer and base64.
4. The base64 audio is wrapped in a `recognizer_loop:b64_audio` bus message and
   sent to hivemind-core.
5. hivemind-core runs STT, then intent, then skill, then TTS, and replies. The
   client renders the spoken text from the `speak` message it receives. With the
   `phoonnx-js` TTS option, it also synthesizes and plays that text in the
   browser.

The [Settings](#client-side-options) panel can move the wake word into the
browser (step 2 gates capture behind it) and switch step 4 to raw-PCM binary
frames.

See [`docs/`](docs/index.md) for the full setup walkthrough, configuration
reference, the audio pipeline, and troubleshooting.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser refuses to connect | Non-TLS WebSocket from an HTTPS page, or remote `ws://`. See [the TLS rule](#the-tls-rule-read-this-first). |
| `Connected` but no reply | hivemind-core missing `allow-msg "recognizer_loop:b64_audio"`, or `ovos-dinkum-listener` older than `0.0.3a19`. |
| VAD button never enables | The VAD model failed to load (no network for the CDN, or microphone permission denied). Check the browser console. |
| No microphone prompt | The page must be served over `https://` or `http://localhost` for `getUserMedia` to work. |

More in [docs/troubleshooting.md](docs/troubleshooting.md).

## Related

| Project | Role |
|---|---|
| [HiveMind-core](https://github.com/JarbasHiveMind/HiveMind-core) | hivemind-core. Runs OVOS, manages satellites, owns STT/TTS. |
| [HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js) | The browser WebSocket client library this page is built on. |
| [hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite) | The native (Python) equivalent: mic + VAD local, hivemind-core does the rest. |
| [HiveMind-webchat](https://github.com/JarbasHiveMind/HiveMind-webchat) | Browser text chat client (no audio). |

## License

Apache-2.0
