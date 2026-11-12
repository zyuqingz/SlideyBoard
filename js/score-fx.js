// Row combos stack for the turn and bank once their popup finishes.
import { Ease } from './fx.js';

export function createScorePresentation() {
  return { displayScore: 0, scoreScale: 1, scoreFx: null, comboFx: null };
}

export function stackScore(present, award, effects, origin) {
  const t0 = effects.now();
  present.scoreFx = { pts: award.pts, t0, origin, exit: 0 };
  present.comboFx = award.mult > 1 ? { mult: award.mult, t0, alpha: 1 } : null;
}

// More than one settled turn can finish while the same popup is visible.
// Each award owns exactly one transfer, regardless of how many callers await it.
const transfers = new WeakMap();

export function bankScore(present, effects, current = () => true) {
  const fx = present.scoreFx;
  if (!fx) return Promise.resolve(true);
  if (!transfers.has(fx)) transfers.set(fx, transferScore(present, effects, current, fx));
  return transfers.get(fx);
}

async function transferScore(present, effects, current, fx) {
  const { tween, wait } = effects;
  const combo = present.comboFx;
  if (!await wait(Math.max(0, 480 - (effects.now() - fx.t0))) || !current()) return false;
  if (!await tween(560, p => {
    fx.exit = p;
    if (combo) combo.alpha = 1 - p;
  }, p => p ** 4) || !current()) return false;
  // A newer award may already own the popup if input resumed during this exit.
  if (present.scoreFx !== fx) {
    present.displayScore += fx.pts;
    return true;
  }
  present.scoreFx = null;
  present.comboFx = null;

  return scoreImpact(present, effects, current, () => { present.displayScore += fx.pts; });
}

async function scoreImpact(present, { tween }, current, bank) {
  // Impact first; the old number remains visible until the reaction peaks.
  if (!await tween(70, p => { present.scoreScale = 1 + 0.28 * p; }, Ease.out) || !current()) return false;
  bank();
  // One small rebound keeps the impact crisp without a lingering wobble.
  if (!await tween(150, p => { present.scoreScale = 1 + 0.28 * (1 - p); }, Ease.outBack) || !current()) return false;
  present.scoreScale = 1;
  return true;
}
