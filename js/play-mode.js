export const PLAY_MODES = Object.freeze(['standard', 'totem', 'totem-building']);
export const ENERGY_PER_LAYER = 3;

export function resolvePlayMode({ playMode, totemsEnabled } = {}, fallback = 'standard') {
  if (PLAY_MODES.includes(playMode)) return playMode;
  if (totemsEnabled === true) return 'totem';
  if (totemsEnabled === false) return 'standard';
  return fallback;
}

export function nextPlayMode(id) {
  const index = PLAY_MODES.indexOf(id);
  return PLAY_MODES[(index < 0 ? 0 : index + 1) % PLAY_MODES.length];
}

export const isTotem = state => state.playMode === 'totem';
export const isBuilding = state => state.playMode === 'totem-building';
export const usesTotems = state => isTotem(state) || isBuilding(state);
