export const PLAY_MODES = Object.freeze(['standard', 'tetris', 'totem-building']);
export const BUILDING_LINES_PER_LEVEL = 5;
export const TOTEM_SMILE_MAX = 3;
export const TOTEM_COLLECT_SCORE = 50;
export const BUILDING_SPAWN_CAP = 5;
// Turns between tetromino drops. Later levels speed up, but stay sparse.
export function tetrisDropInterval(level) {
  return (level || 1) <= 1 ? 5 : 4;
}

export function levelForBuildingLines(lines) {
  const n = Math.max(0, lines | 0);
  return 1 + Math.floor(n / BUILDING_LINES_PER_LEVEL);
}

export function buildingTotemsForLevelUp(fromLevel, toLevel) {
  let n = 0;
  for (let lv = (fromLevel | 0) + 1; lv <= (toLevel | 0); lv++) {
    n += Math.min(lv, BUILDING_SPAWN_CAP);
  }
  return n;
}

export function buildingLevelProgress(lines) {
  const n = Math.max(0, lines | 0);
  return (n % BUILDING_LINES_PER_LEVEL) / BUILDING_LINES_PER_LEVEL;
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
