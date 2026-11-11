import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, SFX } from '../js/audio.js';

function mockStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    data
  };
}

test('audio imports and mute works when the browser storage getter throws', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Access denied', 'SecurityError'); }
  });
  try {
    const module = await import('../js/audio.js?blocked-storage');
    assert.equal(module.isMuted(), false);
    assert.equal(module.setMuted(true), true);
    assert.equal(module.playSfx('click'), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('muted playback is a no-op and persists', () => {
  const storage = mockStorage();
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1; this.playbackRate = 1; this.preload = ''; }
    cloneNode() { return new FakeAudio(this.src); }
    play() { return Promise.resolve(); }
  }
  const audio = createAudio({ storage, AudioCtor: FakeAudio, base: 'assets/sfx/' });
  assert.equal(audio.play('click'), false);
  audio.setMuted(true);
  assert.equal(audio.play('click'), false);
  assert.equal(storage.data.slidey_muted, '1');
  const restored = createAudio({ storage, AudioCtor: FakeAudio });
  assert.equal(restored.isMuted(), true);
  assert.equal(restored.play('slide'), false);
});

test('cue map has no shipped files', () => {
  assert.deepEqual(SFX, {});
});
