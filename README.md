# hivemind-webspeech

send speech from browser to hivemind

performs VAD in browser via [ricky0123/vad](https://www.vad.ricky0123.com/) and sends audio via [HivemindJS](https://github.com/JarbasHiveMind/HiveMind-js) for processing

online demo [here](https://jarbashivemind.github.io/hivemind-webspeech)

![imagem](https://github.com/JarbasHiveMind/hivemind-webspeech/assets/33701864/d3a19394-6bf5-42ca-aa1e-e30e6d9e5b81)

NOTE: your browser will refuse to connect to a non-ssl websocket unless it's 127.0.0.1

## Configuration

Hivemind master needs ovos-dinkum-listener >= 0.0.3a19

```bash
$ hivemind-core allow-msg "recognizer_loop:b64_audio"
```
