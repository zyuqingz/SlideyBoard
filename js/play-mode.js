export const PLAY_MODES = Object.freeze(['standard', 'tetris', 'totem-building']);
export const ENERGY_PER_LAYER = 3;
// Turns between tetromino drops. Later levels speed up, but stay sparse.
export function tetrisDropInterval(level) {
  return (level || 1) <= 1 ? 5 : 4;
}

export function resolvePlayMode({ playMode, totemsEnabled } = {}, fallback = 'standard') {
  if (playMode === 'totem') playMode = 'tetris';
  if (PLAY_MODES.includes(playMode)) return playMode;
  if (totemsEnabled === true) return 'tetris';
  if (totemsEnabled === false) return 'standard';
  return fallback;
}

export function nextPlayMode(id) {
  const index = PLAY_MODES.indexOf(id);
  return PLAY_MODES[(index < 0 ? 0 : index + 1) % PLAY_MODES.length];
}

export const isTetris = state => state.playMode === 'tetris';
export const isBuilding = state => state.playMode === 'totem-building';
export const usesTotems = state => isTetris(state) || isBuilding(state);
