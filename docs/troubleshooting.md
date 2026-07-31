# Troubleshooting

Symptoms are grouped by stage: connection, audio capture, and the reply. Open
the browser developer console (F12) first. `src/index.js` logs each stage
there.

## Connection

### The browser refuses to connect, or a WebSocket error appears in the console

Almost always the TLS / mixed-content rule. Browsers block a plain `ws://`
WebSocket from an `https://` page, and only allow `ws://` at all to
`127.0.0.1`.

- From the hosted (`https://`) demo, the hub must be reachable over
  **`wss://`** (TLS). A plain-`ws://` hub cannot be used.
- For local testing, serve the page over `http://localhost` and connect to a
  hub on `ws://127.0.0.1`.

See [Configuration: the TLS rule](configuration.md#the-tls--mixed-content-rule).

### "Hivemind connection lost..."

The WebSocket dropped after connecting. Check:

- The hub is still running and reachable at the IP/port you entered.
- The **Access Key** and **Password** are correct, and the key has not been
  revoked on the hub (`hivemind-core` client management). A wrong password
  fails the V1 handshake, so the connection drops before any audio is sent.
- Firewall or NAT between you and the hub.

### Connect succeeds but nothing happens when you speak

The connection is fine, but the hub is dropping the audio message. Confirm on
the hub:

```bash
hivemind-core allow-msg "recognizer_loop:b64_audio"
```

and that the listener is `ovos-dinkum-listener >= 0.0.3a19`. Without both,
audio arrives and is discarded.

## Audio capture / VAD

### The "Start VAD" button never enables (stays loading)

The VAD failed to initialize. Causes:

- **No network on first load.** The VAD model and `onnxruntime-web` load from
  a CDN. Check the console for failed CDN requests.
- **Microphone permission denied.** Grant it and reload.
- **Insecure context.** `getUserMedia` only works over `https://` or
  `http://localhost`. Opened any other way, the mic is unavailable.

### No microphone permission prompt appears

The page is not in a secure context. Serve it over `https://` or
`http://localhost`.

### VAD runs but utterances are never sent

Open the console. You should see `Speech start` / `Speech end` logs when you
talk. If they do not appear, the VAD is not hearing you. Check the OS/browser
microphone selection and input level. If they do appear but no reply comes,
the problem is on the hub side (see "Connect succeeds but nothing happens"
above).

### Audio is cut off or split oddly

The VAD decides utterance boundaries. Very short pauses can split a sentence
into two sends, and background noise can trigger spurious sends. Each send is
listed with a playback control. Play it back to hear exactly what was
captured.

## Reply

### I speak, the audio is listed, but no "HiveMind says:" text appears

The audio reached the page's list (so capture and encode worked), but no
`speak` message came back. This is a hub-side issue:

- The audio message may be blocked. Re-check `allow-msg`.
- STT on the hub may have produced no transcript (silence, noise, wrong
  language).
- The intent may not have matched any skill, so nothing spoke.

Inspect the hub logs to see whether the utterance was transcribed and which
skill, if any, handled it.

## Still stuck

- Confirm the hosted demo works against a known-good `wss://` hub first, to
  isolate whether the problem is the page or your hub.
- Cross-check the hub setup against
  [hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite).
  It sends the same `recognizer_loop:b64_audio` message and has the same hub
  requirements, so a working mic-satellite confirms the hub side is correct.

---
[← Audio pipeline](architecture.md) · [Home](index.md)
