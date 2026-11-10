// Shared turn lifecycle. Modes supply insertion/preview rules, options add drops.
import { rowSpan, settleBoard, touchingTop, hasMoves, occupiedTileRows } from './board.js';
import { createTurnScore, awardRows } from './sim.js';
import { spawnTotem, spawnTotemLayer } from './totem-spawn.js';
import { ENERGY_PER_LAYER, isBuilding, isTetris, usesTotems, tetrisDropInterval } from './play-mode.js';

export function resolveTurn(state, random, emit, rise) {
  const turn = createTurnScore();
  let cleared = 0;
  const step = (type, data) => {
    if (type === 'clear') {
      cleared += data.rows.length;
      data.award = awardRows(state, data.rows, turn, row => {
        const { left, right } = rowSpan(state, row);
        return right - left;
      });
    }
    emit(type, data);
  };
  const settle = () => settleBoard(state, step);
  const endGame = reason => {
    state.phase = 'over';
    state.gameOverReason = reason;
    state.newBest = state.score > state.bestAtStart && state.score > 0;
    emit('game-over', { blockIds: state.blocks
      .filter(b => reason === 'no-moves' || b.row <= 0).map(b => b.id) });
  };
  settle();
  // A rise reaching the ceiling still allows one rescue slide next turn.
  if (touchingTop(state)) return endGame('top-out');

  const spawnRows = count => {
    for (let i = 0; i < count; i++) {
      rise();
      settle();
    }
  };
  spawnRows(state.blocks.length ? 1 : 3);
  if (isTetris(state)) {
    const live = state.blocks.some(b => b.kind === 'totem');
    if (!live) {
      const wait = Number.isInteger(state.tetrisDropIn) ? state.tetrisDropIn : tetrisDropInterval(state.level);
      if (wait <= 1) {
        const block = spawnTotem(state, random);
        if (block) {
          state.tetrisDropIn = tetrisDropInterval(state.level);
          emit('totem-drop', { id: block.id });
          settle();
        } else state.tetrisDropIn = 1;
      } else state.tetrisDropIn = wait - 1;
    }
  } else if (isBuilding(state)) {
    state.spiritualEnergy += cleared;
    let spawned = false;
    const cap = state.spiritualEnergyMax || ENERGY_PER_LAYER;
    while (state.spiritualEnergy >= cap) {
      const result = spawnTotemLayer(state, random);
      if (result.type === 'blocked') {
        state.totemSpawnBlocked = true;
        break;
      }
      state.spiritualEnergy -= cap;
      state.totemSpawnBlocked = false;
      spawned = true;
      if (result.type === 'drop') emit('totem-drop', { id: result.block.id });
      else emit('totem-stack', { ids: result.ids });
    }
    if (spawned) settle();
  }
  if (!occupiedTileRows(state))
    spawnRows(state.blocks.length ? 1 : (state.shape ? 1 : 3));
  if ((state.shape || usesTotems(state)) && !hasMoves(state)) endGame('no-moves');
}
