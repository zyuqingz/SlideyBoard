// Shared turn lifecycle. Modes supply insertion/preview rules, options add drops.
import { rowSpan, settleBoard, touchingTop, hasMoves } from './board.js';
import { createTurnScore, awardRows } from './sim.js';
import { spawnTotem, spawnTotemLayer } from './totem-spawn.js';
import { ENERGY_PER_LAYER, isBuilding, isTotem, usesTotems } from './play-mode.js';

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
  if (isTotem(state)) {
    const block = spawnTotem(state, random);
    if (block) {
      emit('totem-drop', { id: block.id });
      settle();
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
  if (!state.blocks.length) spawnRows(state.shape ? 1 : 3);
  if ((state.shape || usesTotems(state)) && !hasMoves(state)) endGame('no-moves');
}
