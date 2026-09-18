/**
 * Accessibility checks for the page: every form field has a label, the page
 * declares its language, the logo link has a name, the reply list announces
 * new lines and holds only <li> children, and the mic toggle exposes its state
 * with aria-pressed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'src', 'index.html'), 'utf8');

test('html declares a language', () => {
  assert.match(html, /<html[^>]*\slang="[a-z]{2}/);
});

test('every input and select has a label', () => {
  const ids = [...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 11);
  for (const id of ids) {
    assert.match(html, new RegExp(`<label[^>]*\\bfor="${id}"`), `no label for #${id}`);
  }
});

test('the logo link has an accessible name', () => {
  const link = html.match(/<a\b[^>]*href="https:\/\/github.com\/JarbasHiveMind\/"[^>]*>/);
  assert.ok(link);
  assert.match(link[0], /aria-label="[^"]+"/);
});

test('the reply list is a live region and the toggle starts unpressed', () => {
  assert.match(html, /<ul id="audio-list"[^>]*aria-live="polite"/);
  assert.match(html, /id="toggleVAD"[^>]*aria-pressed="false"/s);
});

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.value = '';
    this.textContent = '';
    this.children = [];
    this.attrs = {};
    this.classList = { add() {}, remove() {} };
  }
  prepend(child) { this.children.unshift(child); }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
}

test('log lines are <li> and the toggle updates aria-pressed', async () => {
  const els = {};
  globalThis.document = {
    getElementById: (id) => (els[id] ||= new FakeElement('x')),
    createElement: (tag) => new FakeElement(tag),
    head: new FakeElement('head'),
  };
  globalThis.window = globalThis;
  globalThis.alert = () => {};
  let hive;
  globalThis.JarbasHiveMind = class { constructor() { hive = this; } connect() {} };
  const mic = { listening: false, start() { this.listening = true; }, pause() { this.listening = false; } };
  globalThis.vad = { MicVAD: { new: async () => mic }, utils: {} };

  await import('../src/index.js');
  hive.onHiveError(new Error('boom'));
  const line = els['audio-list'].children[0];
  assert.equal(line.tagName, 'li');

  // Let any microphone start triggered by page load or connection finish.
  hive.onHiveConnected?.();
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  if (!mic.listening) await window.toggleVAD();
  assert.equal(els.toggleVAD.attrs['aria-pressed'], 'true');
  await window.toggleVAD();
  assert.equal(els.toggleVAD.attrs['aria-pressed'], 'false');
});
