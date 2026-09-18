/**
 * The resolver refuses a HiveMind-js copy the page does not pin.
 *
 * The reviewer of #29 showed two cells where a different build sat where the
 * suites look first (a stale tests/vendor/hivemind.cjs, a sibling checkout)
 * and 34 of 34 tests passed against it with no fetch. Every candidate is now
 * hashed against the page's integrity attribute. These tests run offline:
 * `fetch` is a stub, and every path is in a temporary directory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HiveMindJsMismatch,
  hivemindJsIntegrityFromPage,
  resolveHivemindJs,
  sha384Of,
} from './hivemind_js_pin.mjs';

const GOOD = Buffer.from('module.exports = { build: "pinned" };\n');
const STALE = Buffer.from('module.exports = { build: "stale" };\n');
const WANT = sha384Of(GOOD);

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'webspeech-resolver-'));
  return {
    dir,
    sibling: join(dir, 'HiveMind-js', 'static', 'js', 'hivemind.js'),
    vendored: join(dir, 'vendor', 'hivemind.cjs'),
    log: () => {},
    integrity: WANT,
    url: 'https://example.invalid/hivemind.js',
    env: {},
  };
}

function servedBody(bytes, calls) {
  return async (url) => {
    calls.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => bytes };
  };
}

const never = async () => { throw new Error('fetch must not run'); };

test('the page carries a sha384 for HiveMind-js and it has the SRI shape', () => {
  assert.match(hivemindJsIntegrityFromPage(), /^sha384-[A-Za-z0-9+/]{64}$/);
});

test('a stale vendored copy is fetched again and overwritten', async () => {
  const o = scratch();
  try {
    mkdirSync(join(o.dir, 'vendor'), { recursive: true });
    writeFileSync(o.vendored, STALE);
    const calls = [];
    const path = await resolveHivemindJs({ ...o, fetch: servedBody(GOOD, calls) });
    assert.equal(path, o.vendored);
    assert.deepEqual(calls, [o.url]);
    assert.equal(sha384Of(readFileSync(o.vendored)), WANT, 'the stale copy was not replaced');
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('a vendored copy that matches is used with no fetch', async () => {
  const o = scratch();
  try {
    mkdirSync(join(o.dir, 'vendor'), { recursive: true });
    writeFileSync(o.vendored, GOOD);
    assert.equal(await resolveHivemindJs({ ...o, fetch: never }), o.vendored);
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('a sibling checkout that does not match is an error, not a fallback', async () => {
  const o = scratch();
  try {
    mkdirSync(join(o.dir, 'HiveMind-js', 'static', 'js'), { recursive: true });
    writeFileSync(o.sibling, STALE);
    await assert.rejects(
      resolveHivemindJs({ ...o, fetch: never }),
      (err) => err instanceof HiveMindJsMismatch && err.where === 'sibling checkout'
        && err.path === o.sibling && /src\/index\.html pins/.test(err.message),
    );
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('a sibling checkout that matches is used with no fetch', async () => {
  const o = scratch();
  try {
    mkdirSync(join(o.dir, 'HiveMind-js', 'static', 'js'), { recursive: true });
    writeFileSync(o.sibling, GOOD);
    assert.equal(await resolveHivemindJs({ ...o, fetch: never }), o.sibling);
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('HIVEMIND_JS_PATH that does not match is an error naming the path', async () => {
  const o = scratch();
  try {
    const named = join(o.dir, 'my-build.js');
    writeFileSync(named, STALE);
    await assert.rejects(
      resolveHivemindJs({ ...o, env: { HIVEMIND_JS_PATH: named }, fetch: never }),
      (err) => err instanceof HiveMindJsMismatch && err.where === 'HIVEMIND_JS_PATH'
        && err.path === named && err.message.includes(sha384Of(STALE)),
    );
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('HIVEMIND_JS_PATH wins over a vendored copy when it matches', async () => {
  const o = scratch();
  try {
    const named = join(o.dir, 'my-build.js');
    writeFileSync(named, GOOD);
    mkdirSync(join(o.dir, 'vendor'), { recursive: true });
    writeFileSync(o.vendored, STALE);
    assert.equal(
      await resolveHivemindJs({ ...o, env: { HIVEMIND_JS_PATH: named }, fetch: never }),
      named,
    );
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('fetched bytes that do not match the page are refused and not vendored', async () => {
  const o = scratch();
  try {
    await assert.rejects(
      resolveHivemindJs({ ...o, fetch: servedBody(STALE, []) }),
      (err) => err instanceof HiveMindJsMismatch && err.where === 'fetched',
    );
    assert.throws(() => readFileSync(o.vendored), 'a refused fetch must not be written');
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});

test('a failed fetch is a plain error that names HIVEMIND_JS_PATH', async () => {
  const o = scratch();
  try {
    const gone = async () => ({ ok: false, status: 404 });
    await assert.rejects(
      resolveHivemindJs({ ...o, fetch: gone }),
      (err) => !(err instanceof HiveMindJsMismatch) && /HTTP 404/.test(err.message)
        && /HIVEMIND_JS_PATH/.test(err.message),
    );
  } finally {
    rmSync(o.dir, { recursive: true, force: true });
  }
});
