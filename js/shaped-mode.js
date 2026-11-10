// Shaped mode owns its lifecycle, scoring, loss policy, and spawn policy.
import { ROWS, touchingTop } from './board.js';
import { createTurnScore, awardRows } from './sim.js';
import { SHAPES, chooseShape } from './shapes.js';
import { shapedSlideRange, hasShapedMoves, insertShapedRow, settleShapedBoard } from './shaped-board.js';
import { generateShapedCandidate, generateShapedNextRow } from './shaped-spawn.js';

function reset(state, random, { shapeId = 'random' } = {}) {
  const selected = SHAPES.find(shape => shape.id === shapeId);
  if (shapeId !== 'random' && !selected) throw new Error(`Unknown shape: ${shapeId}`);
  state.shape = selected ? structuredClone(selected) : chooseShape(random);
  for (let i = 0; i < 4; i++) {
    insertShapedRow(state, generateShapedCandidate(state, random));
    settleShapedBoard(state);
  }
  // Ledges can lock an otherwise valid opening. A small guaranteed movable seed
  // avoids retry loops, including for constant injected RNG streams.
  if (!hasShapedMoves(state)) {
    state.blocks = [{ id: state.nextId++, row: ROWS - 1,
      col: state.shape.rows[ROWS - 1].left, len: 1, color: 0 }];
  }
  state.nextRow = generateShapedNextRow(state, random);
}

function settle(state, turn, emit) {
  settleShapedBoard(state, (type, data) => {
    if (type === 'clear') {
      data.award = awardRows(state, data.rows, turn, row => {
        const { left, right } = state.shape.rows[row];
        return right - left;
      });
    }
    emit(type, data);
  });
}

function endGame(state, reason, emit) {
  state.phase = 'over';
  state.gameOverReason = reason;
  state.newBest = state.score > state.bestAtStart && state.score > 0;
  emit('game-over', { blockIds: state.blocks.filter(b => reason === 'no-moves' || b.row === 0).map(b => b.id) });
}

export const shaped = Object.freeze({
  id: 'shaped', label: 'SHAPED', reset, moveRange: shapedSlideRange,
  resolveTurn(state, random, emit) {
    const turn = createTurnScore();
    settle(state, turn, emit);
    if (touchingTop(state)) return endGame(state, 'top-out', emit);
    function rise() {
      const motion = insertShapedRow(state, state.nextRow);
      state.nextRow = generateShapedNextRow(state, random);
      emit('shaped-rise', motion);
      settle(state, turn, emit);
    }
    const count = state.blocks.length ? 1 : 3;
    for (let i = 0; i < count; i++) rise();
    // A nonempty, nonfull incoming row guarantees this last refill cannot clear
    // an empty board, even when every previous row cleared in a cascade.
    if (!state.blocks.length) rise();
    if (!hasShapedMoves(state)) endGame(state, 'no-moves', emit);
  }
});
