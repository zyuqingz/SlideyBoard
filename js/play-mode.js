export const PLAY_MODES = Object.freeze(['standard', 'tetris', 'totem-building']);
// Last level whose line requirement still grows. Later levels keep leveling with that same count.
export const LINES_GROWTH_LAST_LEVEL = 10;
export const CLASSIC_LINES_BASE = 12;
export const CLASSIC_LINES_STEP = 1;
export const BUILDING_LINES_BASE = 8;
export const BUILDING_LINES_STEP = 1;
export const TOTEM_SMILE_MAX = 3;
export const BUILDING_SPAWN_CAP = 1;
// Ordinary-tile refill target shared by all play modes.
export const REFILL_ROWS = 3;
// Turns between tetromino drops. Later levels speed up, but stay sparse.
export function tetrisDropInterval(level) {
  return (level || 1) <= 1 ? 5 : 4;
}

export function linesNeededForLevel(level, base, step) {
  const lv = Math.max(1, level | 0);
  return base + (Math.min(lv, LINES_GROWTH_LAST_LEVEL) - 1) * step;
}

export function linesToReachLevel(level, base, step) {
  let total = 0;
  for (let lv = 1; lv < (level | 0); lv++) total += linesNeededForLevel(lv, base, step);
  return total;
}

export function progressFromLines(lines, base, step) {
  let n = Math.max(0, lines | 0);
  let level = 1;
  for (;;) {
    const need = linesNeededForLevel(level, base, step);
    if (n < need) return { level, levelProgress: n / need };
    n -= need;
    level++;
  }
}

export function classicProgressFromLines(lines) {
  return progressFromLines(lines, CLASSIC_LINES_BASE, CLASSIC_LINES_STEP);
}

export function levelForBuildingLines(lines) {
  return progressFromLines(lines, BUILDING_LINES_BASE, BUILDING_LINES_STEP).level;
}

export function buildingTotemsForLevelUp(fromLevel, toLevel) {
  // One junior per filled Next Junior bar this turn, even across cascaded levels.
  return (toLevel | 0) > (fromLevel | 0) ? BUILDING_SPAWN_CAP : 0;
}

export function buildingLevelProgress(lines) {
  return progressFromLines(lines, BUILDING_LINES_BASE, BUILDING_LINES_STEP).levelProgress;
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
export const isBuildingMode2 = state => isBuilding(state) && state.buildingMode === 2;
export const normalizeBuildingMode = mode => mode === 2 ? 2 : 1;

// Score targets grow with the level, matching the level multiplier on awards.
// Level L costs BUILDING_SCORE_PER_LEVEL * L (1000, 2000, 3000, …).
export const BUILDING_SCORE_PER_LEVEL = 1000;
export function buildingScoreProgress(score) {
  const points = Math.max(0, score);
  const level = Math.floor((1 + Math.sqrt(1 + points / (BUILDING_SCORE_PER_LEVEL / 8))) / 2);
  const start = (BUILDING_SCORE_PER_LEVEL / 2) * level * (level - 1);
  return { level, levelProgress: (points - start) / (BUILDING_SCORE_PER_LEVEL * level) };
}
export const usesTotems = state => isTetris(state) || isBuilding(state);
