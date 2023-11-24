# hivemind-webspeech

send speech from browser to hivemind

performs VAD in browser via [ricky0123/vad](https://github.com/ricky0123/vad) and sends audio via [HivemindJS](https://github.com/JarbasHiveMind/HiveMind-js) for processing

## Configuration

Hivemind master needs https://github.com/OpenVoiceOS/ovos-dinkum-listener/pull/75

```bash
$ hivemind-core allow-msg "recognizer_loop:b64_audio"
```