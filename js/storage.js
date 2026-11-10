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

const DIFFICULTY_KEY = 'slidey_difficulty_v2';

export function loadDifficulty() {
  try {
    const value = localStorage.getItem(DIFFICULTY_KEY);
    if (value === 'easy' || value === 'normal') return value;
    const legacy = localStorage.getItem('slidey_difficulty');
    if (legacy === 'normal') return 'easy';
    return 'normal';
  } catch { return 'normal'; }
}

export function saveDifficulty(value) {
  try { localStorage.setItem(DIFFICULTY_KEY, value); } catch {}
}

export function loadPlayMode() {
  try {
    const stored = localStorage.getItem('slidey_play_mode');
    if (stored === 'standard' || stored === 'totem' || stored === 'totem-building') return stored;
    const legacy = localStorage.getItem('slidey_totems');
    if (legacy === 'false') return 'standard';
    return 'totem';
  } catch { return 'totem'; }
}

export function savePlayMode(value) {
  try { localStorage.setItem('slidey_play_mode', value); } catch {}
}
