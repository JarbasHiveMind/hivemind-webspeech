# Configuration

hivemind-webspeech has no config file. You enter connection details in the
page's credential form at connect time. You choose behavioral options in the
page's **Settings** panel, and the browser saves them. A few requirements must
be met on hivemind-core. This page covers all of it.

## Credential form

The page presents four fields. They map directly to the
[HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js)
`connect(host, port, username, accessKey, password)` call.

| Field | Maps to | Default / placeholder | Notes |
|---|---|---|---|
| **IP** | `host` | `0.0.0.0` | hivemind-core's address. `127.0.0.1` for same-machine, a LAN IP, or a hostname. |
| **Port** | `port` | `5678` | hivemind-core's WebSocket port. |
| **Access Key** | `accessKey` | (none) | Issued by `hivemind-core add-client`. |
| **Password** | `password` | (none) | The **Password** from `hivemind-core add-client`. The V1 client derives the AES-GCM session key from it during the handshake. |

The client identifies itself to hivemind-core with the fixed useragent
`HivemindWebSpeechV0.2`.

## Settings panel

The **Settings** section of the page exposes three independent options, each
saved in `localStorage` under `hivemind-webspeech.settings`. Every option
defaults to the value that reproduces the base behavior, so a browser with no
saved settings behaves exactly as the minimal client does.

| Option | Values | Default | Effect |
|---|---|---|---|
| **Wake word** | `off`, `precise-onnx-js` | `off` | `off` streams every VAD-segmented utterance. `precise-onnx-js` loads a [Precise](https://github.com/MycroftAI/mycroft-precise) `.onnx` model in the browser and gates capture. Nothing is streamed until the wake word fires. The following utterance is then sent. |
| **Audio transport** | `base64`, `binary` | `base64` | `base64` sends each utterance as a base64 WAV `recognizer_loop:b64_audio` bus message. `binary` sends it as a WIRE-1 `STT_AUDIO_HANDLE` raw-PCM binary frame instead. This is smaller on the wire, with no base64 inflation. |
| **Text to speech** | `server-text`, `phoonnx-js` | `server-text` | `server-text` renders the spoken reply as text. `phoonnx-js` also synthesizes the reply text in the browser with [phoonnx.js](https://github.com/TigreGotico/phoonnx.js) and plays it. |

Two text fields tune the non-default modes:

- **Wake-word model URL**: any Precise `.onnx` model URL. The default points at
  a hosted `hey_mycroft` model, so no weights are committed to this
  repository. Host your own model anywhere the browser can fetch it
  (respecting CORS).
- **phoonnx voice id**: a voice id from the phoonnx.js voice registry (for
  example `phoonnx_en-US_miro_unicode` or a piper/Home-Assistant-compatible
  espeak voice). The model is downloaded from HuggingFace and cached by the
  browser on first use.

### How each mode loads its library

The wake-word and TTS libraries load only when their mode is enabled, so the
default page loads nothing extra:

- **precise-onnx-js**: its browser scripts (`mfcc.js`, then `wakeword.js`) are
  injected from jsDelivr and reuse the `onnxruntime-web` runtime already loaded
  for the VAD.
- **phoonnx.js**: imported on demand as an ES module from `esm.sh`, which
  builds the package from source. For a fully self-contained deployment,
  bundle phoonnx.js into `dist/` with your own build step instead of
  importing it at runtime.

### Transport requirements

The `binary` transport needs a session that carries binary frames: a
protocol-v3 (Noise) session, or a v1 session where hivemind-core negotiated
binarization. When neither is available, the client automatically falls back
to `base64` for that utterance, so audio always flows.

## hivemind-core requirements

hivemind-core must be prepared to receive audio:

1. **Speech service version.** The OVOS speech service behind hivemind-core
   must run `ovos-dinkum-listener >= 0.0.3a19`, which understands base64 audio
   over the bus.
2. **Allowed message.** hivemind-core must permit the audio bus message this
   client sends:

   ```bash
   hivemind-core allow-msg "recognizer_loop:b64_audio"
   ```

   Without this the WebSocket connects but audio is dropped and you get no
   reply. The `binary` transport instead uses hivemind-core's WIRE-1
   `STT_AUDIO_HANDLE` binary handler, which is admitted by hivemind-core's
   binary policy rather than the bus allow-list.

STT, TTS, intent, and skills are all configured on hivemind-core, not here.
The browser cannot choose the speech engine. The operator owns it behind
access-key auth.

## The TLS / mixed-content rule

This is the single most common source of "it won't connect" problems.

Browsers enforce mixed-content and secure-context rules on WebSockets:

- A page served over **`https://`** may only open a **`wss://`** (TLS)
  WebSocket. A plain `ws://` target is blocked.
- A plain **`ws://`** WebSocket is only permitted to **`127.0.0.1`** (or
  `localhost`).

What this means in practice:

| Page served from | hivemind-core reachable at | Works? |
|---|---|---|
| `http://localhost` or local file | `ws://127.0.0.1:5678` | Yes |
| `https://…` (e.g. the hosted demo) | `wss://<host>:5678` (TLS hivemind-core) | Yes |
| `https://…` | `ws://<remote-host>:5678` (plain ws://) | No (blocked) |
| `http://<lan-ip>` | `ws://<remote-host>` | Browser-dependent, avoid |

To reach a remote hivemind-core instance from the hosted (`https://`) demo,
hivemind-core's WebSocket must terminate TLS (`wss://`). For purely local
experiments, serve the page on `localhost` and use plain `ws://` to
`127.0.0.1`.

## Network access on first load

`src/index.html` pulls its dependencies from CDNs at runtime:

- [HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js) (WebSocket client
  and crypto shims)
- `onnxruntime-web` (runs the VAD model)
- `@ricky0123/vad-web` (the VAD itself)
- Bulma CSS (styling)

When the matching Settings option is enabled, two further libraries load on
demand: [precise-onnx-js](https://github.com/TigreGotico/precise-onnx-js)
(wake word) and [phoonnx.js](https://github.com/TigreGotico/phoonnx.js)
(in-browser TTS). Under the default settings neither is fetched.

The page therefore needs network access to load these. Once loaded, the only
ongoing traffic is the encrypted WebSocket to your hivemind-core instance.

## Microphone permission

Voice capture uses `getUserMedia`, which requires a **secure context**. The
page must be served over `https://` or from `http://localhost`. Opened any
other way, the browser will not grant microphone access, and the **Start
VAD** button will not function.

---
[← Getting started](getting-started.md) · [Home](index.md) · [Audio pipeline →](architecture.md)
