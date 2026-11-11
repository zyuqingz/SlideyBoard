// Shaped opening and preview policy, using the shared turn lifecycle.
import { ROWS, slideRange, hasMoves } from './board.js';
import { resolveTurn, spawnOpeningTotem } from './turn.js';
import { SHAPES, chooseShape } from './shapes.js';
import { insertShapedRow, settleShapedBoard } from './shaped-board.js';
import { generateShapedCandidate, generateShapedNextRow } from './shaped-spawn.js';

function riseShaped(state, random, emit) {
  const motion = insertShapedRow(state, state.nextRow);
  state.nextRow = generateShapedNextRow(state, random);
  emit('shaped-rise', motion);
}

function reset(state, random, { shapeId = 'random' } = {}, emit = () => {}) {
  const selected = SHAPES.find(shape => shape.id === shapeId);
  if (shapeId !== 'random' && !selected) throw new Error(`Unknown shape: ${shapeId}`);
  state.shape = selected ? structuredClone(selected) : chooseShape(random);
  for (let i = 0; i < 4; i++) {
    insertShapedRow(state, generateShapedCandidate(state, random));
    settleShapedBoard(state);
  }
  // Ledges can lock an otherwise valid opening. A small guaranteed movable seed
  // avoids retry loops, including for constant injected RNG streams.
  if (!hasMoves(state)) {
    state.blocks = [{ id: state.nextId++, row: ROWS - 1,
      col: state.shape.rows[ROWS - 1].left, len: 1, color: 0 }];
  }
  state.nextRow = generateShapedNextRow(state, random);
  spawnOpeningTotem(state, random, emit, () => riseShaped(state, random, emit));
}

export const shaped = Object.freeze({
  id: 'shaped', label: 'SHAPED', reset, moveRange: slideRange,
  resolveTurn(state, random, emit) {
    resolveTurn(state, random, emit, () => riseShaped(state, random, emit));
  }
});
