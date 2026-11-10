// Mode policies run synchronously in grid space. They never await presentation.
import { slideRange } from './board.js';
import { setupClassic, rise } from './sim.js';
import { shaped } from './shaped-mode.js';
import { resolveTurn } from './turn.js';

export const classic = Object.freeze({
  id: 'classic',
  label: 'CLASSIC',
  reset: setupClassic,
  moveRange: slideRange,
  resolveTurn(state, random, emit) {
    resolveTurn(state, random, emit, () => {
      rise(state, random);
      emit('rise');
    });
  }
});

export const GAME_MODES = Object.freeze([shaped, classic]);
