/**
 * The HiveMind-js pin the page ships.
 *
 * src/index.html is the single source of truth. The tests read it instead of
 * naming a commit of their own, so a test can never drive a different build of
 * the client than the page loads.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** The full https URL of the HiveMind-js script tag in src/index.html. */
export function hivemindJsUrlFromPage() {
  const html = readFileSync(resolve(__dirname, '..', 'src', 'index.html'), 'utf8');
  const m = html.match(
    /src="(https:\/\/cdn\.jsdelivr\.net\/gh\/JarbasHiveMind\/HiveMind-js@[0-9a-f]{40}\/static\/js\/hivemind\.js)"/
  );
  if (!m) {
    throw new Error(
      'src/index.html has no HiveMind-js script tag pinned to a 40-character commit'
    );
  }
  return m[1];
}

/** The 40-character commit sha of that pin. */
export function hivemindJsPinFromPage() {
  return hivemindJsUrlFromPage().match(/@([0-9a-f]{40})\//)[1];
}

/**
 * What a test should fetch: the env override first, else the page's pin.
 * HIVEMIND_JS_URL stays, so CI and a developer can point at a local build.
 */
export const CLIENT_URL = process.env.HIVEMIND_JS_URL || hivemindJsUrlFromPage();
