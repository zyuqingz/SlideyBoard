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
  const storage = mockStorage();
  class FakeAudio {
    constructor(src) {
      this.src = src; this.volume = 1; this.playbackRate = 1; this.preload = ''; this.currentTime = 0;
    }
    cloneNode() { return new FakeAudio(this.src); }
    play() { return Promise.resolve(); }
  }
  const audio = createAudio({ storage, AudioCtor: FakeAudio, base: 'assets/sfx/' });
  audio.unlock();
  assert.equal(audio.play('click'), true);
  audio.setMuted(true);
  assert.equal(audio.play('click'), false);
  assert.equal(storage.data.slidey_muted, '1');
  const restored = createAudio({ storage, AudioCtor: FakeAudio });
  assert.equal(restored.isMuted(), true);
  assert.equal(restored.play('click'), false);
  assert.equal(restored.play('missing'), false);
});

test('every sound cue ships a wav', async () => {
  assert.deepEqual(Object.keys(SFX).sort(), [
    'clear', 'click', 'drag', 'fail', 'fall', 'god-clear',
    'totem-clear', 'totem-spawn', 'totem-submit', 'trim'
  ]);
  for (const file of Object.values(SFX)) {
    await access(new URL(`../assets/sfx/${file}`, import.meta.url));
  }
});

function webAudioSetup({ fetcher, AudioCtor = null } = {}) {
  let context;
  const requests = [], sources = [], gains = [];
  class FakeContext {
    constructor(options) {
      context = this;
      this.options = options;
      this.state = 'suspended';
      this.currentTime = 12;
      this.destination = {};
      this.resumes = 0;
      this.decodes = 0;
    }
    async resume() { this.resumes++; this.state = 'running'; }
    async decodeAudioData(data) { this.decodes++; return { data }; }
    createBufferSource() {
      const source = {
        playbackRate: { value: 1 },
        connect(target) { this.target = target; },
        disconnect() { this.disconnected = true; },
        start(time) { this.startedAt = time; }
      };
      sources.push(source);
      return source;
    }
    createGain() {
      const gain = {
        gain: { value: 1 },
        connect(target) { this.target = target; },
        disconnect() { this.disconnected = true; }
      };
      gains.push(gain);
      return gain;
    }
  }
  const audio = createAudio({
    storage: mockStorage(), AudioCtor, ContextCtor: FakeContext,
    fetcher: fetcher ?? (async url => {
      requests.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    })
  });
  const ready = () => Promise.all(Object.keys(SFX).map(name => audio.load(name)));
  return { audio, context, requests, sources, gains, ready };
}

test('predecoded cues start immediately and overlap without reloading', async () => {
  const { audio, context, requests, sources, gains, ready } = webAudioSetup();
  await ready();
  assert.equal(context.options.latencyHint, 'interactive');
  assert.equal(context.resumes, 0, 'preloading must not start audio');
  assert.equal(requests.length, Object.keys(SFX).length);
  audio.unlock();
  assert.equal(audio.play('fall', { volume: 0.4, rate: 1.06 }), true);
  assert.equal(audio.play('fall'), true);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].buffer, sources[1].buffer);
  assert.equal(sources[0].startedAt, context.currentTime);
  assert.equal(sources[0].playbackRate.value, 1.06);
  assert.equal(gains[0].gain.value, 0.4);
  assert.equal(sources[0].target, gains[0]);
  assert.equal(gains[0].target, context.destination);
  await ready();
  assert.equal(context.decodes, Object.keys(SFX).length);
  sources[0].onended();
  assert.equal(sources[0].disconnected, true);
  assert.equal(gains[0].disconnected, true);
  audio.setMuted(true);
  assert.equal(audio.play('fall'), false);
  assert.equal(sources.length, 2);
});

test('loading never queues a stale sound for later playback', async () => {
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const { audio, sources, ready } = webAudioSetup({ fetcher: () => response });
  audio.unlock();
  assert.equal(audio.play('click'), false);
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await ready();
  assert.equal(sources.length, 0);
  assert.equal(audio.play('click'), true);
  assert.equal(sources.length, 1);
});

test('interrupted audio resumes on another gesture without queuing contacts', async () => {
  const { audio, context, sources, ready } = webAudioSetup();
  await ready();
  let resume;
  context.resume = () => {
    context.resumes++;
    return new Promise(resolve => {
      resume = () => { context.state = 'running'; resolve(); };
    });
  };
  audio.unlock();
  assert.equal(audio.play('fall'), false);
  assert.equal(context.resumes, 1);
  resume();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sources.length, 0);
  assert.equal(audio.play('fall'), true);
  context.state = 'interrupted';
  audio.unlock();
  assert.equal(context.resumes, 2);
  resume();
});

test('failed Web Audio decoding retains media-element playback', async () => {
  let plays = 0;
  class FakeAudio {
    cloneNode() { return new FakeAudio(); }
    play() { plays++; return Promise.resolve(); }
  }
  class FakeContext {
    constructor() { this.state = 'running'; }
    async decodeAudioData() { throw new Error('Unsupported audio'); }
  }
  const audio = createAudio({
    storage: mockStorage(), AudioCtor: FakeAudio, ContextCtor: FakeContext,
    fetcher: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  });
  await audio.load('click');
  audio.unlock();
  assert.equal(audio.play('click'), true);
  assert.equal(plays, 1);
});

test('opening cues never resume audio; a gesture retries even a pending resume', async () => {
  const { audio, context, sources, ready } = webAudioSetup();
  await ready();
  assert.equal(audio.play('totem-spawn'), false);
  assert.equal(context.resumes, 0);
  context.resume = () => {
    context.resumes++;
    if (context.resumes === 1) return new Promise(() => {});
    context.state = 'running';
    return Promise.resolve();
  };
  audio.unlock();
  assert.equal(audio.play('click'), false);
  assert.equal(context.resumes, 1, 'playback must not attempt autoplay unlock');
  audio.unlock();
  assert.equal(context.resumes, 2, 'a pending resume must not block the next gesture');
  assert.equal(audio.play('fall'), true);
  assert.equal(sources.length, 1);
});

test('suspended or loading Web Audio uses media fallback without replaying cues', async () => {
  let plays = 0, finish;
  class FakeAudio {
    cloneNode() { return new FakeAudio(); }
    play() { plays++; return Promise.resolve(); }
  }
  const response = new Promise(resolve => { finish = resolve; });
  const { audio, context, sources, ready } = webAudioSetup({
    AudioCtor: FakeAudio, fetcher: () => response
  });
  assert.equal(audio.play('totem-spawn'), false);
  assert.equal(plays, 0);
  context.resume = () => new Promise(() => {});
  audio.unlock();
  assert.equal(audio.play('click'), true);
  assert.equal(plays, 1);
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await ready();
  assert.equal(audio.play('fall'), true, 'decoded but suspended still has fallback');
  assert.equal(plays, 2);
  assert.equal(sources.length, 0);
  context.state = 'running';
  assert.equal(audio.play('fall'), true);
  assert.equal(sources.length, 1);
  assert.equal(plays, 2);
  audio.setMuted(true);
  context.state = 'suspended';
  assert.equal(audio.play('click'), false);
  assert.equal(plays, 2);
});
