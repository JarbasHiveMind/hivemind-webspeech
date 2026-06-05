# hivemind-webspeech — Documentation

hivemind-webspeech is a **browser** speech client for
[HiveMind](https://github.com/JarbasHiveMind/HiveMind-core). It captures your
microphone, runs voice activity detection (VAD) in the page, and streams each spoken
utterance as base64 audio to a HiveMind hub over an encrypted WebSocket. The hub
handles speech-to-text, intent, skills, and the reply.

No install, no Python, no audio drivers — a web page and a microphone.

## The satellite spectrum

HiveMind satellites differ by **where the work happens**. This client sits at the
thin end (browser variant): microphone capture and VAD run locally, everything else
runs on the hub.

| Client | Runs locally | Runs on the hub |
|---|---|---|
| [HiveMind-cli](https://github.com/JarbasHiveMind/HiveMind-cli) | nothing (text only) | STT · TTS · intent · skills |
| **hivemind-webspeech** ← you are here | microphone · VAD | STT · TTS · intent · skills |
| [hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite) | microphone · VAD | STT · TTS · intent · skills |
| [HiveMind-voice-relay](https://github.com/JarbasHiveMind/HiveMind-voice-relay) | mic · VAD · wake-word | STT · TTS · intent · skills |
| [HiveMind-voice-sat](https://github.com/JarbasHiveMind/HiveMind-voice-sat) | mic · VAD · wake-word · STT · TTS | intent · skills |

hivemind-webspeech is the browser counterpart of the native
[hivemind-mic-satellite](https://github.com/JarbasHiveMind/hivemind-mic-satellite):
the same division of labour, a web page instead of a Python process, built on
[HiveMind-js](https://github.com/JarbasHiveMind/HiveMind-js) rather than
[hivemind-websocket-client](https://github.com/JarbasHiveMind/hivemind-websocket-client).

## Documentation pages

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Pair, allow the audio message, open the page, speak |
| [Configuration](configuration.md) | Credential fields, ports, the TLS / mixed-content rule, hub requirements |
| [Audio pipeline](architecture.md) | How mic → VAD → WAV → base64 → bus → reply works on the wire |
| [Troubleshooting](troubleshooting.md) | Connection, TLS, audio, and VAD problems |

## Quick reference

```bash
# on the hub:
hivemind-core add-client                              # → Access Key + Password
hivemind-core allow-msg "recognizer_loop:b64_audio"   # permit audio over the bus
```

Then open the [demo](https://jarbashivemind.github.io/hivemind-webspeech) (or your
own build), enter IP / port / access key / crypto key, click **CONNECT**, then
**Start VAD**, and speak.
