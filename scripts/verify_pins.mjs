#!/usr/bin/env node
/**
 * Verify every pinned CDN asset the page loads.
 *
 * tests/cdn_pins.test.mjs proves the page NAMES an exact version or commit and
 * carries a sha384 attribute. It cannot prove the attribute matches the bytes
 * the CDN serves, because that needs the network. This script fetches each
 * pinned URL and recomputes the hash.
 *
 * Deliberately not part of `npm test`: the suite must run offline. Run it with
 * `npm run verify:pins`, and in a scheduled or dispatched job.
 *
 * Exit code 0 when every asset matches, 1 otherwise. Every asset is checked
 * before the exit, so one bad hash does not hide the next.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'src', 'index.html'), 'utf8');
const js = readFileSync(resolve(root, 'src', 'index.js'), 'utf8');

/** Every <script src=… integrity=…> tag of the page. */
function pagePins() {
  const out = [];
  for (const [tag, src] of html.matchAll(/<script\b[^>]*\bsrc="(https:[^"]+)"[^>]*>/gs)) {
    const integrity = tag.match(/\bintegrity="(sha384-[A-Za-z0-9+/=]+)"/);
    out.push({ what: 'script tag', url: src, integrity: integrity && integrity[1] });
  }
  return out;
}

/** The two precise-onnx-js scripts src/index.js loads on demand. */
function precisePins() {
  const commit = js.match(/const PRECISE_COMMIT = '([0-9a-f]{40})'/);
  if (!commit) return [];
  const base = `https://cdn.jsdelivr.net/gh/TigreGotico/precise-onnx-js@${commit[1]}/src`;
  const mfcc = js.match(/PRECISE_MFCC_SRI = '(sha384-[A-Za-z0-9+/=]+)'/);
  const ww = js.match(/PRECISE_WW_SRI = '(sha384-[A-Za-z0-9+/=]+)'/);
  return [
    { what: 'precise mfcc', url: `${base}/mfcc.js`, integrity: mfcc && mfcc[1] },
    { what: 'precise wakeword', url: `${base}/wakeword.js`, integrity: ww && ww[1] },
  ];
}

async function check(pin) {
  if (!pin.integrity) return { ...pin, ok: false, why: 'no integrity attribute' };
  const res = await fetch(pin.url);
  if (!res.ok) return { ...pin, ok: false, why: `HTTP ${res.status}` };
  const body = Buffer.from(await res.arrayBuffer());
  const got = 'sha384-' + createHash('sha384').update(body).digest('base64');
  return got === pin.integrity
    ? { ...pin, ok: true, bytes: body.length }
    : { ...pin, ok: false, why: `hash mismatch: served ${got}` };
}

const pins = [...pagePins(), ...precisePins()];
if (pins.length === 0) {
  console.error('no pinned assets found — check src/index.html and src/index.js');
  process.exit(1);
}

let bad = 0;
for (const pin of pins) {
  const r = await check(pin);
  if (r.ok) {
    console.log(`OK    ${r.what}: ${r.url} (${r.bytes} bytes)`);
  } else {
    bad += 1;
    console.error(`FAIL  ${r.what}: ${r.url}\n      ${r.why}\n      pinned ${r.integrity}`);
  }
}
console.log(`${pins.length - bad}/${pins.length} pinned assets match their sha384`);
process.exit(bad === 0 ? 0 : 1);
