// Browser persistence adapter. Gameplay only receives/returns numeric best scores.
const BEST_KEY = 'slidey_best';
const keyFor = mode => mode === 'classic' ? BEST_KEY : `${BEST_KEY}_${mode}`;

export function loadBest(mode = 'classic') {
  try { return parseInt(localStorage.getItem(keyFor(mode)) || '0', 10) || 0; }
  catch { return 0; }
}

export function saveBest(mode, value) {
  try { localStorage.setItem(keyFor(mode), String(value)); } catch {}
}
