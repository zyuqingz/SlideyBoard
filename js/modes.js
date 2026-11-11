// Mode policies run synchronously in grid space. They never await presentation.
import { slideRange } from './board.js';
import { setupClassic, rise } from './sim.js';
import { shaped } from './shaped-mode.js';
import { resolveTurn, spawnOpeningTotem } from './turn.js';

function riseClassic(state, random, emit) {
  rise(state, random);
  emit('rise');
}

export const classic = Object.freeze({
  id: 'classic',
  label: 'CLASSIC',
  reset(state, random, options, emit = () => {}) {
    setupClassic(state, random);
    spawnOpeningTotem(state, random, emit, () => riseClassic(state, random, emit));
  },
  moveRange: slideRange,
  resolveTurn(state, random, emit, options) {
    resolveTurn(state, random, emit, () => riseClassic(state, random, emit), options);
  }
});

export const GAME_MODES = Object.freeze([shaped, classic]);
