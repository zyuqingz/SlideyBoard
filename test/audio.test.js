import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
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
  const plays = [];
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1; this.playbackRate = 1; this.preload = ''; }
    cloneNode() { return new FakeAudio(this.src); }
    play() { plays.push(this.src); return Promise.resolve(); }
  }
  const storage = mockStorage();
  const audio = createAudio({ storage, AudioCtor: FakeAudio, base: 'assets/sfx/' });
  assert.equal(audio.play('click'), true);
  assert.equal(plays.length, 1);
  audio.setMuted(true);
  assert.equal(audio.play('click'), false);
  assert.equal(plays.length, 1);
  assert.equal(storage.data.slidey_muted, '1');
  const restored = createAudio({ storage, AudioCtor: FakeAudio });
  assert.equal(restored.isMuted(), true);
  assert.equal(restored.play('slide'), false);
});

test('cue map covers the shipped files', async () => {
  assert.equal('land' in SFX, false);
  assert.equal('tick' in SFX, false);
  for (const file of Object.values(SFX)) {
    assert.match(file, /\.wav$/);
    await access(new URL(`../assets/sfx/${file}`, import.meta.url));
  }
});

test('playback rate stays at or below original pitch', () => {
  const clips = [];
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1; this.playbackRate = 1; }
    cloneNode() { const c = new FakeAudio(this.src); clips.push(c); return c; }
    play() { return Promise.resolve(); }
  }
  const audio = createAudio({ storage: mockStorage(), AudioCtor: FakeAudio });
  audio.play('place', { rate: 1.4 });
  assert.equal(clips[0].playbackRate, 1);
});
