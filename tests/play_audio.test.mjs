/**
 * playAudioBlob revokes the object URL it creates once playback ends, fails
 * to start, or errors.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { playAudioBlob } from '../src/audio.js';

function fakes({ playRejects = false } = {}) {
  const revoked = [];
  let n = 0;
  const urlApi = {
    createObjectURL: () => `blob:fake/${++n}`,
    revokeObjectURL: (u) => revoked.push(u),
  };
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.listeners = {};
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    fire(type) { this.listeners[type]?.(); }
    play() { return playRejects ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }
  }
  return { revoked, urlApi, FakeAudio };
}

test('the object URL is revoked when playback ends', async () => {
  const { revoked, urlApi, FakeAudio } = fakes();
  const audio = await playAudioBlob({}, FakeAudio, urlApi);
  assert.deepEqual(revoked, []);
  audio.fire('ended');
  audio.fire('error');
  assert.deepEqual(revoked, ['blob:fake/1']);
});

test('the object URL is revoked when play() rejects', async () => {
  const { revoked, urlApi, FakeAudio } = fakes({ playRejects: true });
  await assert.rejects(playAudioBlob({}, FakeAudio, urlApi), /NotAllowedError/);
  assert.deepEqual(revoked, ['blob:fake/1']);
});

test('the object URL is revoked on a playback error', async () => {
  const { revoked, urlApi, FakeAudio } = fakes();
  const audio = await playAudioBlob({}, FakeAudio, urlApi);
  audio.fire('error');
  assert.deepEqual(revoked, ['blob:fake/1']);
});
