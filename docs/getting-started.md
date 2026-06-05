# Getting Started

This walks you from zero to a working browser voice session against a HiveMind hub.

You need:

- A reachable [HiveMind-core](https://github.com/JarbasHiveMind/HiveMind-core) hub,
  with its listener running `ovos-dinkum-listener >= 0.0.3a19`.
- A browser with microphone support.
- Network access on first page load (the VAD model and client libraries load from
  CDNs).

---

## 1. Pair — get credentials from the hub

Credentials are issued on the **hub** side. On the machine running HiveMind-core:

```bash
hivemind-core add-client
```

It prints an **Access Key** and a **Password**. Copy both. In the browser form, the
Password is entered in the field labelled **Crypto Key** — it is the same value.

---

## 2. Allow the audio message on the hub

By default the hub does not accept audio over the bus. Permit the message this
client sends:

```bash
hivemind-core allow-msg "recognizer_loop:b64_audio"
```

Without this, the connection succeeds but spoken utterances are silently dropped and
you get no reply.

---

## 3. Open the page

Use the hosted demo:

<https://jarbashivemind.github.io/hivemind-webspeech>

or serve your own copy — see [Build](#building-your-own-copy) below.

> **TLS / mixed-content rule.** A browser will not open a plain `ws://` WebSocket
> from a page served over `https://`, and only allows `ws://` at all to
> `127.0.0.1`. So:
> - **Same machine / local test** — serve the page over `http://localhost` and use
>   `ws://` to a hub on `127.0.0.1`.
> - **Remote hub** — both the page (`https://`) and the hub WebSocket (`wss://`)
>   must use TLS.
>
> See [Configuration](configuration.md) for details.

---

## 4. Connect

Fill the form:

| Field | Value |
|---|---|
| **IP** | The hub's address (e.g. `127.0.0.1` or `192.168.1.10`) |
| **Port** | The hub WebSocket port (default `5678`) |
| **Access Key** | From `hivemind-core add-client` |
| **Crypto Key** | The Password from `hivemind-core add-client` |

Click **CONNECT**. An alert confirms:

```
Connected to HiveMind!
```

If the connection drops later you get `Hivemind connection lost...`.

---

## 5. Speak

After connecting, the **Start VAD** button activates.

1. Click **Start VAD** (the page asks for microphone permission the first time).
2. Just talk. Voice activity detection runs in the browser and detects when you
   start and stop speaking — there is no wake-word.
3. Each detected utterance is sent to the hub. The spoken reply appears as:

   ```
   HiveMind says: It's 3:45 PM.
   ```

   and the captured audio is added to the list with a playback control.
4. Click **Stop VAD** to mute capture.

That's it — you are talking to your hive from the browser.

---

## What just happened

1. The page connected to the hub over an encrypted WebSocket using your access key
   and crypto key (via [HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js)).
2. The browser ran VAD on your microphone and isolated one utterance.
3. The utterance was encoded to WAV, base64-ed, and sent as a
   `recognizer_loop:b64_audio` bus message.
4. The hub ran STT → intent → skill → TTS and replied; the page rendered the spoken
   text.

No speech engine ran in your browser — only capture and VAD. See
[the audio pipeline](architecture.md) for the full picture.

---

## Building your own copy

There is no Python package and no `package.json`. Runtime dependencies load from
CDNs; the only build tool is `esbuild` via `npx`:

```bash
./build.sh
```

This bundles `src/*.js` into `dist/` and copies the HTML. Serve `dist/` (or `src/`)
with any static web server that satisfies the TLS rule above. The hosted demo is
published to the repo's `gh-pages` branch.
