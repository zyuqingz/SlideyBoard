// Isolated rectangular mode with vertical totems and top-edge row blasts.
import { ROWS, insertRow } from './board.js';
import { createTurnScore, awardRows } from './sim.js';
import { totemGravity, totemFullRows, totemSlideRange, clearTotemRows, hasTotemMoves } from './totem-board.js';
import { generateTotemNextRow, spawnTotem, chooseTotemRows } from './totem-spawn.js';

function clear(state, rows, turn, emit) {
  const geometry = clearTotemRows(state, rows);
  const award = awardRows(state, rows, turn);
  emit('clear', { rows, ...geometry, award });
}

function activate(state, random, turn, emit) {
  const totems = state.blocks.filter(b => b.kind === 'totem' && b.row <= 0);
  for (const b of totems) {
    state.blocks = state.blocks.filter(block => block.id !== b.id);
    emit('totem-activate', { block: b });
    const rows = chooseTotemRows(state, b.height, random);
    if (rows.length) clear(state, rows, turn, emit);
  }
}

function settle(state, turn, emit) {
  for (;;) {
    const moves = totemGravity(state);
    if (moves.length) emit('gravity', { moves });
    const rows = totemFullRows(state);
    if (!rows.length) return;
    clear(state, rows, turn, emit);
  }
}

function endGame(state, reason, emit) {
  state.phase = 'over';
  state.gameOverReason = reason;
  state.newBest = state.score > state.bestAtStart && state.score > 0;
  emit('game-over', { blockIds: state.blocks.filter(b => b.row <= 0).map(b => b.id) });
}

export const totem = Object.freeze({
  id: 'totem',
  label: 'TOTEM MODE',
  reset(state, random) {
    for (let i = 0; i < 4; i++) {
      insertRow(state, generateTotemNextRow(state, random));
      for (;;) {
        totemGravity(state);
        const rows = totemFullRows(state);
        if (!rows.length) break;
        clearTotemRows(state, rows);
      }
    }
    // Bounded fallback for unusually repetitive RNG producing an empty opening.
    if (!hasTotemMoves(state)) {
      state.blocks = [{ id: state.nextId++, row: ROWS - 1, col: 3, len: 2, color: 0 }];
    }
    state.nextRow = generateTotemNextRow(state, random);
  },
  moveRange: totemSlideRange,
  resolveTurn(state, random, emit) {
    const turn = createTurnScore();
    activate(state, random, turn, emit);
    settle(state, turn, emit);
    if (state.blocks.some(b => b.row <= 0)) return endGame(state, 'top-out', emit);

    spawnRows(state.blocks.length ? 1 : 3);
    const block = spawnTotem(state, random);
    if (block) {
      emit('totem-drop', { id: block.id });
      settle(state, turn, emit);
    }
    if (!state.blocks.length) spawnRows(3);
    if (!hasTotemMoves(state)) endGame(state, 'no-moves', emit);

    function spawnRows(count) {
      for (let i = 0; i < count; i++) {
        insertRow(state, state.nextRow);
        state.nextRow = generateTotemNextRow(state, random);
        emit('rise');
        // A rising totem fires immediately, before gravity or ordinary top-out.
        activate(state, random, turn, emit);
        settle(state, turn, emit);
      }
    }
  }
});
