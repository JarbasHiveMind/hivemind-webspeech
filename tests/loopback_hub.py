#!/usr/bin/env python3
"""
Standalone loopback HiveMind hub for the hivemind-webspeech e2e test.

Starts a real WebSocket hivemind-core master via hivescope's
LoopbackNetworkProtocol, registers one satellite (key/password), and prints the
hub URL on the first line of stdout as:

    HUB_URL=ws://127.0.0.1:<port>/

It then blocks reading stdin. When stdin closes (the Node test is done), it
inspects the messages the hub injected onto its agent bus and exits 0 only if it
received a ``recognizer_loop:utterance`` carrying the expected text — proving the
JS V1 client completed the password handshake and delivered an encrypted
utterance end to end.

Usage:
    loopback_hub.py <sat_key> <sat_password> <expected_utterance>

Requires a venv with hivescope (which floors the HiveMind 2.x stack):
    python -m pip install "hivescope>=0.5.2a1"
    /path/to/venv/bin/python tests/loopback_hub.py ...
"""
import sys

from hivescope.topology import TopologyBuilder


def main() -> int:
    if len(sys.argv) < 4:
        print("Usage: loopback_hub.py <sat_key> <sat_password> <expected_utterance>",
              file=sys.stderr)
        return 2
    sat_key, sat_password, expected = sys.argv[1], sys.argv[2], sys.argv[3]

    b = TopologyBuilder()
    m = b.add_master("M0", use_loopback=True)
    m.register_satellite(
        sat_key,
        password=sat_password,
        allowed_types=["recognizer_loop:utterance", "recognizer_loop:b64_audio"],
    )
    b.start_all()

    try:
        url = m.network_protocol.url
        # First stdout line is the contract the Node test reads.
        print(f"HUB_URL={url}", flush=True)

        # Block until the Node test finishes and closes our stdin.
        try:
            sys.stdin.read()
        except KeyboardInterrupt:
            pass

        injected = m.agent_protocol.injected
        utterances = [
            msg for msg in injected
            if msg.msg_type == "recognizer_loop:utterance"
        ]
        if not utterances:
            print(f"[hub] FAIL: no utterance injected (got {[x.msg_type for x in injected]})",
                  file=sys.stderr)
            return 1

        for msg in utterances:
            texts = (msg.data or {}).get("utterances", [])
            if expected in texts:
                print(f"[hub] OK: received utterance {texts!r}", file=sys.stderr)
                return 0
        print(f"[hub] FAIL: expected {expected!r} not found in "
              f"{[ (u.data or {}).get('utterances') for u in utterances ]}",
              file=sys.stderr)
        return 1
    finally:
        b.stop_all()


if __name__ == "__main__":
    sys.exit(main())
