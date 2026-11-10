// Mode policies run synchronously in grid space. They never await presentation.
import { computeGravity, fullRows, removeByIds, slideRange, touchingTop } from './board.js';
import { setupClassic, createTurnScore, awardRows, rise } from './sim.js';
import { shaped } from './shaped-mode.js';
import { totem } from './totem-mode.js';

function settle(state, turn, emit) {
  for (;;) {
    const moves = computeGravity(state);
    if (moves.length) emit('gravity', { moves });
    const rows = fullRows(state);
    if (!rows.length) return;
    const blocks = state.blocks.filter(b => rows.includes(b.row));
    removeByIds(state, new Set(blocks.map(b => b.id)));
    const award = awardRows(state, rows, turn);
    emit('clear', { rows, blocks, award });
  }
}

export const classic = Object.freeze({
  id: 'classic',
  label: 'CLASSIC',
  reset: setupClassic,
  moveRange: slideRange,
  resolveTurn(state, random, emit) {
    const turn = createTurnScore();
    settle(state, turn, emit);
    // Preserve Classic's loss timing: check after the slide settles, before rise.
    // A rise that lands on the top row is still playable until the next slide.
    if (touchingTop(state)) {
      state.newBest = state.score > state.bestAtStart && state.score > 0;
      state.phase = 'over';
      emit('game-over', { blockIds: state.blocks.filter(b => b.row === 0).map(b => b.id) });
      return;
    }
    // One committed preview on a live board. A cleared board has nothing left to
    // slide, so bring in three rows or the turn ends on a stuck, empty grid.
    spawnRows(state.blocks.length === 0 ? 3 : 1);
    if (state.blocks.length === 0) spawnRows(3);

    function spawnRows(count) {
      for (let i = 0; i < count; i++) {
        rise(state, random);
        emit('rise');
        settle(state, turn, emit);
      }
    }
  }
});

export const GAME_MODES = Object.freeze([shaped, totem, classic]);
