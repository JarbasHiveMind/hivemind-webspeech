/**
 * End-to-end test: drive the modernized HiveMind Protocol V1 client
 * (hivemind-js >= 0.2.0) — the exact library src/index.html loads — against a
 * real loopback hivemind-core hub, and prove an encrypted utterance crosses the
 * wire.
 *
 * Flow:
 *   1. Spawn tests/loopback_hub.py (Python, hivemind-e2e venv) which starts a
 *      real WebSocket hub and prints HUB_URL=ws://127.0.0.1:<port>/.
 *   2. Load hivemind-js, polyfill globalThis.WebSocket with `ws`, and run the
 *      V1 connect() → password handshake → sendUtterance() flow.
 *   3. Close the hub's stdin; its exit code is 0 only if it received the
 *      utterance we sent (i.e. handshake + AES-GCM round-trip succeeded).
 *
 * Mirrors hivemind-test-harness/test_helpers/js_e2e_driver.mjs.
 *
 * Env knobs:
 *   HIVEMIND_JS_PATH  - path to hivemind.js (default: node_modules/hivemind-js)
 *   E2E_PYTHON        - python interpreter (default: ~/.venvs/hivemind-e2e/bin/python)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// `ws` is required to run hivemind-js outside a browser.
globalThis.WebSocket = require('ws');

function resolveHivemindJs() {
    if (process.env.HIVEMIND_JS_PATH) return resolve(process.env.HIVEMIND_JS_PATH);
    // Installed dependency (CI: `npm ci`).
    try {
        return require.resolve('hivemind-js');
    } catch {
        // Fallback: sibling checkout in the workspace.
        const sibling = resolve(
            __dirname, '..', '..', 'HiveMind-js', 'static', 'js', 'hivemind.js');
        if (existsSync(sibling)) return sibling;
        throw new Error(
            'hivemind-js not found. Run `npm ci`, or set HIVEMIND_JS_PATH.');
    }
}

function resolvePython() {
    if (process.env.E2E_PYTHON) return process.env.E2E_PYTHON;
    return resolve(homedir(), '.venvs', 'hivemind-e2e', 'bin', 'python');
}

test('V1 client handshake + encrypted utterance reaches a real hub', async (t) => {
    const python = resolvePython();
    if (!existsSync(python)) {
        t.skip(`hivemind-e2e python not found at ${python}`);
        return;
    }
    const { JarbasHiveMind } = require(resolveHivemindJs());

    const SAT_KEY = 'webspeech-key';
    const SAT_PASSWORD = 'W3bsp33ch-C0rrect-H0rse-Batt3ry-v3';
    const UTTERANCE = 'hello from hivemind webspeech';

    const hub = spawn(python, [
        resolve(__dirname, 'loopback_hub.py'),
        SAT_KEY, SAT_PASSWORD, UTTERANCE,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    // Buffer the hub's stderr (verdict line + asyncio teardown noise) and only
    // surface it if the test fails.
    let hubStderr = '';
    hub.stderr.on('data', (chunk) => { hubStderr += chunk.toString(); });

    // Read HUB_URL=... from the first stdout line.
    const hubUrl = await new Promise((resolveUrl, rejectUrl) => {
        const timer = setTimeout(
            () => rejectUrl(new Error('hub did not print HUB_URL in time')), 20000);
        let buf = '';
        hub.stdout.on('data', (chunk) => {
            buf += chunk.toString();
            const line = buf.split('\n').find((l) => l.startsWith('HUB_URL='));
            if (line) {
                clearTimeout(timer);
                resolveUrl(line.slice('HUB_URL='.length).trim());
            }
        });
        hub.on('exit', (code) => {
            clearTimeout(timer);
            rejectUrl(new Error(`hub exited early with code ${code}`));
        });
    });

    const url = new URL(hubUrl);
    const host = url.hostname;
    const port = parseInt(url.port, 10) || 5678;

    const client = new JarbasHiveMind();
    try {
        await new Promise((resolveConn, rejectConn) => {
            const timer = setTimeout(
                () => rejectConn(new Error('handshake timeout')), 15000);
            client.onHiveConnected = () => { clearTimeout(timer); resolveConn(); };
            client.onHiveDisconnected = () => {
                clearTimeout(timer);
                rejectConn(new Error('disconnected during handshake'));
            };
            client.connect(host, port, 'webspeech-sat', SAT_KEY, SAT_PASSWORD);
        });

        await client.sendUtterance(UTTERANCE);
        // Give the hub a moment to inject the decrypted message onto its bus.
        await new Promise((r) => setTimeout(r, 1000));
    } finally {
        if (client.ws) client.ws.close();
    }

    // Closing stdin tells the hub to verify what it received and exit.
    const hubExit = new Promise((resolveExit) => hub.on('exit', resolveExit));
    hub.stdin.end();
    const code = await hubExit;

    assert.equal(
        code, 0,
        `hub did not receive the utterance (exit ${code})\n--- hub stderr ---\n${hubStderr}`);
});
