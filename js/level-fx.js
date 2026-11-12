// Owns level-bar transitions, including the full-bar hold before a Junior drop.
import { Ease } from './fx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createLevelPresentation(present, { tween }) {
  let pendingProgress = null, motion = 0;

  function celebrate() {
    const fx = { scale: 0, alpha: 1, rise: 0 };
    present.levelUpFx = fx;
    tween(1600, p => {
      fx.scale = Ease.outBack(clamp(p * 1600 / 240, 0, 1));
      fx.alpha = 1 - Ease.in(clamp((p * 1600 - 1180) / 420, 0, 1));
      fx.rise = 24 * Ease.out(p);
      if (p === 1 && present.levelUpFx === fx) present.levelUpFx = null;
    }, Ease.lin);
  }

  function advance(snapshot, holdForSpawn) {
    const from = present.displayProgress, level = present.displayLevel;
    const target = snapshot.levelProgress ?? 0, nextLevel = snapshot.level ?? level;
    const levelUp = nextLevel > level;
    if (levelUp && holdForSpawn) pendingProgress = target;
    const held = pendingProgress !== null;
    if (held) pendingProgress = target;
    if (!levelUp && target === from) return Promise.resolve(true);
    const stamp = ++motion;
    let celebrated = false;
    // Finish with the clear so cascades cannot compete with an incoming drop.
    const duration = levelUp ? 400 : 240;
    return tween(duration, p => {
      if (stamp !== motion) return;
      const elapsed = p * duration;
      const fill = Ease.out(clamp(elapsed / 220, 0, 1));
      present.displayProgress = from + ((levelUp || held ? 1 : target) - from) * fill;
      present.levelScale = 1 + 0.12 * Math.sin(Math.PI * p);
      if (levelUp && elapsed >= 220 && !celebrated) {
        celebrated = true;
        present.displayLevel = nextLevel;
        celebrate();
      }
      if (levelUp && !held && elapsed > 320)
        present.displayProgress = 1 + (target - 1) * Ease.out((elapsed - 320) / 80);
      if (p === 1) {
        present.displayProgress = held ? 1 : target;
        present.displayLevel = nextLevel;
        present.levelScale = 1;
      }
    }, Ease.lin);
  }

  function release() {
    if (pendingProgress === null) return;
    const target = pendingProgress, from = present.displayProgress;
    const stamp = ++motion;
    pendingProgress = null;
    tween(180, p => {
      if (stamp === motion)
        present.displayProgress = p === 1 ? target : from + (target - from) * p;
    }, Ease.out);
  }

  return { advance, release, reset() { pendingProgress = null; motion++; } };
}
