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
    if (stored === 'standard' || stored === 'tetris' || stored === 'totem-building') return stored;
    if (stored === 'totem') return 'tetris';
    const legacy = localStorage.getItem('slidey_totems');
    if (legacy === 'false') return 'standard';
    if (legacy) return 'tetris';
    return 'totem-building';
  } catch { return 'totem-building'; }
}

export function savePlayMode(value) {
  try { localStorage.setItem('slidey_play_mode', value); } catch {}
}

export function loadBuildingMode() {
  try {
    const stored = localStorage.getItem('slidey_building_mode');
    if (stored === '1') return 1;
    return 2;
  } catch { return 2; }
}

export function saveBuildingMode(value) {
  try { localStorage.setItem('slidey_building_mode', value === 2 ? '2' : '1'); } catch {}
}

const POWER_BUTTON_KEY = 'slidey_power_button';

export function loadPowerButton() {
  try { return localStorage.getItem(POWER_BUTTON_KEY) === '1'; }
  catch { return false; }
}

export function savePowerButton(value) {
  try { localStorage.setItem(POWER_BUTTON_KEY, value ? '1' : '0'); } catch {}
}
