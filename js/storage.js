// Browser persistence adapter for scores and shared gameplay preferences.
const BEST_KEY = 'slidey_best';
const keyFor = mode => mode === 'classic' ? BEST_KEY : `${BEST_KEY}_${mode}`;

export function loadBest(mode = 'classic') {
  try { return parseInt(localStorage.getItem(keyFor(mode)) || '0', 10) || 0; }
  catch { return 0; }
}

export function saveBest(mode, value) {
  try { localStorage.setItem(keyFor(mode), String(value)); } catch {}
}

export function loadDifficulty() {
  try { return localStorage.getItem('slidey_difficulty') === 'normal' ? 'normal' : 'hard'; }
  catch { return 'hard'; }
}

export function saveDifficulty(value) {
  try { localStorage.setItem('slidey_difficulty', value); } catch {}
}

export function loadTotems() {
  try { return localStorage.getItem('slidey_totems') !== 'false'; }
  catch { return true; }
}

export function saveTotems(value) {
  try { localStorage.setItem('slidey_totems', String(value)); } catch {}
}
