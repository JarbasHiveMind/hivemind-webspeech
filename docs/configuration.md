# Configuration

hivemind-webspeech has no config file. Everything is entered in the page's
credential form at connect time, and a few requirements must be satisfied on the
hub. This page covers all of it.

## Credential form

The page presents four fields. They map directly to the
[HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js)
`connect(host, port, username, accessKey, password)` call.

| Field | Maps to | Default / placeholder | Notes |
|---|---|---|---|
| **IP** | `host` | `0.0.0.0` | The hub's address. `127.0.0.1` for same-machine, a LAN IP, or a hostname. |
| **Port** | `port` | `5678` | The hub's WebSocket port. |
| **Access Key** | `accessKey` | — | Issued by `hivemind-core add-client`. |
| **Crypto Key** | `password` | — | The **Password** from `hivemind-core add-client`. Same value, different label. |

The client identifies itself to the hub with the fixed useragent
`HivemindWebSpeechV0.1`.

## Hub requirements

The hub must be prepared to receive audio:

1. **Listener version** — the hub's listener must run
   `ovos-dinkum-listener >= 0.0.3a19`, which understands base64 audio over the bus.
2. **Allowed message** — the hub must permit the audio bus message this client
   sends:

   ```bash
   hivemind-core allow-msg "recognizer_loop:b64_audio"
   ```

   Without this the WebSocket connects but audio is dropped and you get no reply.

STT, TTS, intent, and skills are all configured on the hub, not here. The browser
cannot choose the speech engine — the operator owns it behind access-key auth.

## The TLS / mixed-content rule

This is the single most common source of "it won't connect" problems.

Browsers enforce mixed-content and secure-context rules on WebSockets:

- A page served over **`https://`** may only open a **`wss://`** (TLS) WebSocket.
  A plain `ws://` target is blocked.
- A plain **`ws://`** WebSocket is only permitted to **`127.0.0.1`** (or
  `localhost`).

What this means in practice:

| Page served from | Hub reachable at | Works? |
|---|---|---|
| `http://localhost` or local file | `ws://127.0.0.1:5678` | Yes |
| `https://…` (e.g. the hosted demo) | `wss://<host>:5678` (TLS hub) | Yes |
| `https://…` | `ws://<remote-host>:5678` (plain) | **No** — blocked |
| `http://<lan-ip>` | `ws://<remote-host>` | Browser-dependent; avoid |

To reach a remote hub from the hosted (`https://`) demo, the hub's WebSocket must
terminate TLS (`wss://`). For purely local experiments, serve the page on
`localhost` and use plain `ws://` to `127.0.0.1`.

## Network access on first load

`src/index.html` pulls its dependencies from CDNs at runtime:

- [HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js) (WebSocket client +
  crypto shims)
- `onnxruntime-web` (runs the VAD model)
- `@ricky0123/vad-web` (the VAD itself)
- Bulma CSS (styling)

The page therefore needs network access to load these. Once loaded, the only
ongoing traffic is the encrypted WebSocket to your hub.

## Microphone permission

Voice capture uses `getUserMedia`, which requires a **secure context**: the page
must be served over `https://` or from `http://localhost`. Opened any other way, the
browser will not grant microphone access and the **Start VAD** button will not
function.
