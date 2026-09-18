/**
 * The HiveMind-js pin the page ships, and the one resolver every suite uses.
 *
 * src/index.html is the single source of truth. The tests read it instead of
 * naming a commit of their own, so a test can never drive a different build of
 * the client than the page loads.
 *
 * Reading the URL is not enough on its own. The resolver looks at
 * HIVEMIND_JS_PATH, require.resolve, a sibling checkout and a vendored copy
 * before it fetches, so a stale copy in any of those places used to pass the
 * whole suite with no fetch. Now every candidate is hashed and compared to the
 * page's integrity attribute. A stale vendored copy is fetched again. A path
 * the developer named, or a sibling checkout, that does not match is an error:
 * the page pins one build, and the fix is to move the pin, not the test.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** The HiveMind-js script tag of src/index.html: its URL and integrity. */
function hivemindJsTagFromPage() {
  const html = readFileSync(resolve(__dirname, '..', 'src', 'index.html'), 'utf8');
  const m = html.match(
    /<script\b[^>]*\bsrc="(https:\/\/cdn\.jsdelivr\.net\/gh\/JarbasHiveMind\/HiveMind-js@[0-9a-f]{40}\/static\/js\/hivemind\.js)"[^>]*>/s
  );
  if (!m) {
    throw new Error(
      'src/index.html has no HiveMind-js script tag pinned to a 40-character commit'
    );
  }
  const integrity = m[0].match(/\bintegrity="(sha384-[A-Za-z0-9+/=]+)"/);
  if (!integrity) {
    throw new Error('the HiveMind-js script tag in src/index.html has no sha384 integrity attribute');
  }
  return { url: m[1], integrity: integrity[1] };
}

/** The full https URL of the HiveMind-js script tag in src/index.html. */
export function hivemindJsUrlFromPage() {
  return hivemindJsTagFromPage().url;
}

/** The 40-character commit sha of that pin. */
export function hivemindJsPinFromPage() {
  return hivemindJsUrlFromPage().match(/@([0-9a-f]{40})\//)[1];
}

/** The sha384 integrity value the page carries for HiveMind-js. */
export function hivemindJsIntegrityFromPage() {
  return hivemindJsTagFromPage().integrity;
}

/** The SRI form of a buffer's sha384. */
export function sha384Of(bytes) {
  return 'sha384-' + createHash('sha384').update(bytes).digest('base64');
}

/**
 * What a test should fetch: the env override first, else the page's pin.
 * HIVEMIND_JS_URL stays, so CI and a developer can point at a local server.
 * The bytes it serves are still checked against the page's integrity.
 */
export const CLIENT_URL = process.env.HIVEMIND_JS_URL || hivemindJsUrlFromPage();

/** A HiveMind-js file was found, and it is not the build the page pins. */
export class HiveMindJsMismatch extends Error {
  constructor(where, path, got, want) {
    super(
      `${where} ${path} is not the HiveMind-js build src/index.html pins: ` +
      `got ${got}, page carries ${want}. Move the pin in src/index.html, ` +
      'or point HIVEMIND_JS_PATH at the pinned build.'
    );
    this.name = 'HiveMindJsMismatch';
    this.where = where;
    this.path = path;
  }
}

/**
 * Resolve the HiveMind-js file the suites load, checked against the page.
 *
 * Order: HIVEMIND_JS_PATH, require.resolve('hivemind-js'), a sibling
 * checkout, tests/vendor/hivemind.cjs, then a fetch of CLIENT_URL. The first
 * three throw HiveMindJsMismatch when their sha384 differs from the page's.
 * A vendored copy that differs is fetched again and overwritten. Fetched
 * bytes that differ throw too, so a moved CDN never passes as the pin.
 *
 * `opts` exists for the tests of this resolver: env, sibling, vendored,
 * integrity and fetch can each be swapped.
 */
export async function resolveHivemindJs(opts = {}) {
  const env = opts.env || process.env;
  const want = opts.integrity || hivemindJsIntegrityFromPage();
  const url = opts.url || CLIENT_URL;
  const fetchImpl = opts.fetch || fetch;
  const sibling = opts.sibling
    || resolve(__dirname, '..', '..', 'HiveMind-js', 'static', 'js', 'hivemind.js');
  const vendored = opts.vendored || resolve(__dirname, 'vendor', 'hivemind.cjs');
  const log = opts.log || ((s) => console.log(s));

  const checked = (where, path) => {
    const got = sha384Of(readFileSync(path));
    if (got !== want) throw new HiveMindJsMismatch(where, path, got, want);
    return path;
  };

  if (env.HIVEMIND_JS_PATH) return checked('HIVEMIND_JS_PATH', resolve(env.HIVEMIND_JS_PATH));
  let fromNodeModules = null;
  try {
    fromNodeModules = require.resolve('hivemind-js');
  } catch {
    fromNodeModules = null;
  }
  if (fromNodeModules) return checked('node_modules', fromNodeModules);
  if (existsSync(sibling)) return checked('sibling checkout', sibling);

  if (existsSync(vendored)) {
    const got = sha384Of(readFileSync(vendored));
    if (got === want) return vendored;
    log(`[*] ${vendored} is ${got}, the page pins ${want}; fetching ${url}`);
  } else {
    log(`[*] No local client found; fetching ${url}`);
  }
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(
      `hivemind-js not found and fetch failed: HTTP ${res.status}. Set HIVEMIND_JS_PATH.`);
  }
  const body = Buffer.from(await res.arrayBuffer());
  const got = sha384Of(body);
  if (got !== want) throw new HiveMindJsMismatch('fetched', url, got, want);
  mkdirSync(dirname(vendored), { recursive: true });
  writeFileSync(vendored, body);
  return vendored;
}
