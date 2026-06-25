# hivemind-webspeech

Talk to a [HiveMind](https://github.com/JarbasHiveMind/HiveMind-core) hub from your
web browser — no install, no audio drivers, no Python. Open a page, grant
microphone access, and speak.

The browser captures your microphone, runs voice activity detection (VAD) locally to
isolate spoken utterances, and streams each one as base64-encoded audio over an
encrypted WebSocket to the hub using
[HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js) — the **HiveMind
Protocol V1** client: a password handshake (PBKDF2-HMAC-SHA256 key derivation) plus
AES-GCM encryption, all over native Web Crypto with no extra crypto shims. The hub
does everything else — speech-to-text, intent matching, skills, and the spoken
reply — and sends the answer back as text rendered on the page.

[Online demo](https://jarbashivemind.github.io/hivemind-webspeech)

![screenshot](https://github.com/JarbasHiveMind/hivemind-webspeech/assets/33701864/d3a19394-6bf5-42ca-aa1e-e30e6d9e5b81)

## Where it fits — the satellite spectrum

HiveMind satellites differ by **where the work happens**. The thinner the client,
the more the hub does. hivemind-webspeech is a browser variant of the thin end: the
page does microphone capture and VAD, and the hub does the rest.

| Client | Runs locally | Runs on the hub |
|---|---|---|
| [HiveMind-cli](https://github.com/JarbasHiveMind/HiveMind-cli) | nothing (text only) | STT · TTS · intent · skills |
| **hivemind-webspeech** (this, in-browser) | microphone · VAD | STT · TTS · intent · skills |
| [hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite) | microphone · VAD | STT · TTS · intent · skills |
| [HiveMind-voice-relay](https://github.com/JarbasHiveMind/HiveMind-voice-relay) | mic · VAD · wake-word | STT · TTS · intent · skills |
| [HiveMind-voice-sat](https://github.com/JarbasHiveMind/HiveMind-voice-sat) | mic · VAD · wake-word · STT · TTS | intent · skills |

hivemind-webspeech is functionally the browser counterpart of
[hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite):
both capture the mic and run VAD locally, then hand the audio to the hub. The
difference is the runtime — a web page instead of a Python process — and the
transport library ([HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js)
instead of
[hivemind-websocket-client](https://github.com/JarbasHiveMind/hivemind-websocket-client)).
There is no wake-word: speech detection is push-to-talk style, gated by the VAD
toggle button.

STT, TTS, intent matching, and skills all live on the hub and are owned by the hive
operator behind access-key authentication — the browser cannot choose the speech
engine, it only ships audio.

## Prerequisites

- A reachable [HiveMind-core](https://github.com/JarbasHiveMind/HiveMind-core) hub.
- The hub's listener running `ovos-dinkum-listener >= 0.0.3a19` so it can accept
  audio over the bus.
- A modern browser with `getUserMedia` (microphone) support. The VAD model
  (Silero, via `onnxruntime-web`) loads from a CDN, so the page needs network
  access on first load.

### The TLS rule (read this first)

Browsers refuse to open a **non-SSL** WebSocket from a page served over HTTPS, and
will only allow plain `ws://` to `127.0.0.1`. In practice this means:

- **Local testing on the same machine** — serve the page over `http://localhost`
  (or open the file directly) and connect to a hub on `127.0.0.1` over plain `ws://`.
- **Anything remote** — both the page and the hub's WebSocket must be served over
  TLS (`https://` page → `wss://` hub). A hub reachable only over plain `ws://`
  cannot be used from an `https://` page.

## Quickstart

### 1. Pair — issue credentials on the hub

On the machine running HiveMind-core:

```bash
hivemind-core add-client
# → Access Key: <key>   Password: <password>
```

The browser form's **Password** field is this password — the V1 client uses it to
derive the AES-GCM session key during the handshake.

### 2. Allow audio messages on the hub

The hub must be told to accept the audio bus message this client sends:

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
4. Each detected utterance is sent to the hub; the spoken reply appears in the page
   as `HiveMind says: …`, and the captured audio is listed with a playback control.
5. Click **Stop VAD** to mute capture.

## Build

Runtime dependencies (HiveMind-js, `onnxruntime-web`, `@ricky0123/vad-web`, Bulma
CSS) load from CDNs declared in `src/index.html` — there is nothing to compile to
run the page. The HiveMind-js V1 client is pulled from jsDelivr:

```html
<script src="https://cdn.jsdelivr.net/npm/hivemind-js@0.2.0/static/js/hivemind.js"></script>
```

Serve `src/` directly with any static web server, or produce a bundled `dist/` with
`esbuild` (the only build-time tool, run via `npx`):

```bash
npm run build      # → ./build.sh: bundles src/*.js into dist/ and copies the HTML
npm run serve      # static server on http://localhost:8000 (DIR=dist to serve a build)
```

The hosted demo is published to the repo's `gh-pages` branch.

## Tests

An end-to-end test drives the **same** HiveMind-js V1 client the page loads against a
real loopback `hivemind-core` hub: it performs the full password handshake, sends an
AES-GCM-encrypted utterance, and asserts the hub decrypted and received it.

```bash
# Node side: the `ws` WebSocket polyfill used to run the browser client headless.
npm install

# Python side: a venv with the loopback hub. hivescope floors the whole
# HiveMind 2.x stack itself, so a plain min-pin pulls the right packages.
python -m venv .venv
.venv/bin/python -m pip install "hivescope>=0.5.2a1"

# Run, pointing the test at that venv.
E2E_PYTHON=.venv/bin/python npm test
```

The test (`tests/e2e.test.mjs`, Node's built-in runner) spawns a Python loopback hub
(`tests/loopback_hub.py`, backed by
[hivescope](https://github.com/JarbasHiveMind/hivescope)) and exercises the client
over a real WebSocket via `ws`. It self-skips when no Python hub environment is
available; point it at one with `E2E_PYTHON=/path/to/venv/bin/python`. CI provisions
the hub automatically — see [`.github/workflows/e2e.yml`](.github/workflows/e2e.yml).

## How it works

1. The page instantiates `JarbasHiveMind` (HiveMind-js) and connects with your
   credentials over an encrypted WebSocket.
2. `@ricky0123/vad-web` runs the Silero VAD model in the browser (via
   `onnxruntime-web`) to detect when you start and stop speaking.
3. On speech end, the captured samples are encoded to a WAV buffer and base64.
4. The base64 audio is wrapped in a `recognizer_loop:b64_audio` bus message and sent
   to the hub.
5. The hub runs STT → intent → skill → TTS and replies; the client renders the
   spoken text from the `speak` message it receives.

See [`docs/`](docs/index.md) for the full setup walkthrough, configuration
reference, the audio pipeline, and troubleshooting.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser refuses to connect | Non-TLS WebSocket from an HTTPS page, or remote `ws://`. See [the TLS rule](#the-tls-rule-read-this-first). |
| `Connected` but no reply | Hub missing `allow-msg "recognizer_loop:b64_audio"`, or listener older than `0.0.3a19`. |
| VAD button never enables | The VAD model failed to load (no network for the CDN, or microphone permission denied). Check the browser console. |
| No microphone prompt | The page must be served over `https://` or `http://localhost` for `getUserMedia` to work. |

More in [docs/troubleshooting.md](docs/troubleshooting.md).

## Related

| Project | Role |
|---|---|
| [HiveMind-core](https://github.com/JarbasHiveMind/HiveMind-core) | The hub — runs OVOS, manages satellites, owns STT/TTS. |
| [HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js) | The browser WebSocket client library this page is built on. |
| [hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite) | The native (Python) equivalent: mic + VAD local, hub does the rest. |
| [HiveMind-webchat](https://github.com/JarbasHiveMind/HiveMind-webchat) | Browser text chat client (no audio). |

## License

Apache-2.0
