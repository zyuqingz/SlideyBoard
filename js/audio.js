// Browser SFX adapter. Presentation-only; never imported by the engine.
const KEY = 'slidey_muted';
const BASE = 'assets/sfx/';

export const SFX = {};

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function createAudio({
  storage = browserStorage(),
  AudioCtor = typeof Audio === 'undefined' ? null : Audio,
  base = BASE
} = {}) {
  let muted = false;
  try { muted = storage?.getItem(KEY) === '1'; } catch {}
  let unlocked = false;
  const cache = new Map();

  function src(name) {
    return base + (SFX[name] || name);
  }

  function load(name) {
    if (!AudioCtor || cache.has(name)) return cache.get(name);
    const clip = new AudioCtor(src(name));
    clip.preload = 'auto';
    cache.set(name, clip);
    return clip;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    for (const name of Object.keys(SFX)) load(name);
  }

  function isMuted() {
    return muted;
  }

  function setMuted(next) {
    muted = !!next;
    try { storage?.setItem(KEY, muted ? '1' : '0'); } catch {}
    return muted;
  }

  function play(name, { volume = 1, rate = 1 } = {}) {
    if (muted || !AudioCtor || !SFX[name]) return false;
    unlock();
    const proto = load(name);
    if (!proto) return false;
    const clip = proto.cloneNode ? proto.cloneNode() : new AudioCtor(src(name));
    clip.volume = Math.max(0, Math.min(1, volume));
    clip.playbackRate = Math.max(0.75, Math.min(1, rate));
    const started = clip.play?.();
    if (started && typeof started.catch === 'function') started.catch(() => {});
    return true;
  }

  return { play, unlock, isMuted, setMuted, load };
}

const audio = createAudio();
export const playSfx = (name, opts) => audio.play(name, opts);
export const unlockAudio = () => audio.unlock();
export const isMuted = () => audio.isMuted();
export const setMuted = next => audio.setMuted(next);
