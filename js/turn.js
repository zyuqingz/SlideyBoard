// Shared turn lifecycle. Modes supply insertion/preview rules, options add drops.
import { rowSpan, settleBoard, touchingTop, hasMoves } from './board.js';
import { createTurnScore, awardRows } from './sim.js';
import { spawnTotem } from './totem-spawn.js';

export function resolveTurn(state, random, emit, rise) {
  const turn = createTurnScore();
  const step = (type, data) => {
    if (type === 'clear') data.award = awardRows(state, data.rows, turn, row => {
      const { left, right } = rowSpan(state, row);
      return right - left;
    });
    emit(type, data);
  };
  const settle = () => settleBoard(state, step, random);
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
  if (state.totemsEnabled) {
    const block = spawnTotem(state, random);
    if (block) {
      emit('totem-drop', { id: block.id });
      settle();
    }
  }
  if (!state.blocks.length) spawnRows(state.shape ? 1 : 3);
  if ((state.shape || state.totemsEnabled) && !hasMoves(state)) endGame('no-moves');
}
