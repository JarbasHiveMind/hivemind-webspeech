/**
 * ensurePrecise() resolves the precise-onnx-js constructor.
 *
 * wakeword.js declares `class PreciseOnnxWakeWord` at the top level of a
 * classic script. In a browser that is a lexical binding in the global scope:
 * a module reads it by name, and globalThis.PreciseOnnxWakeWord stays
 * undefined. Node cannot reproduce a global lexical binding that ES module
 * scope can see, so that branch is measured in a real browser instead, in
 * knowledge/wiki/audits/hivemind/evidence/T-2739-precise-lexical-binding.md.
 *
 * What node can hold is the other half: a build that does attach the class to
 * globalThis still resolves, and a load that produces neither shape fails with
 * a named error instead of a TypeError on undefined.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

let counter = 0;

/**
 * Import src/index.js headlessly with a document whose appendChild fires
 * onload, so loadScriptOnce() resolves. `attach` runs at that moment and
 * stands in for the script that the browser would have executed.
 */
async function loadModule(attach) {
  const loaded = [];
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ set src(v) { this._src = v; }, get src() { return this._src; } }),
    head: {
      appendChild(el) {
        loaded.push(el.src);
        attach(el.src);
        queueMicrotask(() => el.onload());
      },
    },
  };
  globalThis.window = globalThis;
  globalThis.alert = () => {};
  globalThis.JarbasHiveMind = class {
    connect() {}
    sendAudioB64() { return Promise.resolve(); }
  };
  globalThis.vad = {
    MicVAD: { new: async () => ({ start() {}, pause() {} }) },
    utils: { encodeWAV: () => new ArrayBuffer(4), arrayBufferToBase64: () => 'AAAA' },
  };
  counter += 1;
  const mod = await import(`../src/index.js?precise=${counter}`);
  return { mod, loaded };
}

test('a build that attaches the class to globalThis still resolves', async () => {
  class PreciseOnnxWakeWord {
    static async load(url) { return { url }; }
  }
  const { mod, loaded } = await loadModule((src) => {
    if (src.endsWith('wakeword.js')) globalThis.PreciseOnnxWakeWord = PreciseOnnxWakeWord;
  });

  const Precise = await mod.__ensurePreciseForTest();
  assert.equal(Precise, PreciseOnnxWakeWord);
  assert.equal(typeof Precise.load, 'function');
  assert.equal(loaded.length, 2, 'mfcc.js then wakeword.js');
  assert.match(loaded[0], /mfcc\.js$/);
  assert.match(loaded[1], /wakeword\.js$/);
  delete globalThis.PreciseOnnxWakeWord;
});

test('neither shape present fails with a named error, not a TypeError', async () => {
  delete globalThis.PreciseOnnxWakeWord;
  const { mod } = await loadModule(() => {});

  await assert.rejects(
    () => mod.__ensurePreciseForTest(),
    (err) => {
      assert.equal(err.name, 'Error');
      assert.match(err.message, /PreciseOnnxWakeWord\.load is not a function/);
      assert.doesNotMatch(err.message, /Cannot read properties of undefined/);
      return true;
    }
  );
});
