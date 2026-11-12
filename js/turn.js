// Shared turn lifecycle. Modes supply insertion/preview rules, options add drops.
import { rowSpan, computeGravity, settleBoard, touchingTop, hasMoves,
  occupiedTileRows, applyPowerMode } from './board.js';
import { createTurnScore, awardRows } from './sim.js';
import { spawnTotem, spawnBuildingTotem } from './totem-spawn.js';
import { isBuilding, isTetris, usesTotems, tetrisDropInterval,
  isBuildingMode2, buildingTotemsForLevelUp, REFILL_ROWS } from './play-mode.js';
import { cellsOf } from './block-geometry.js';
import { applyJuniorPower, JUNIOR_COUNT } from './junior-powers.js';

function scoreSteps(state, emit) {
  const turn = createTurnScore();
  return (type, data) => {
    if (type === 'totem-collect') {
      state.juniorCollection ??= Array(JUNIOR_COUNT).fill(0);
      for (const b of data.blocks) state.juniorCollection[b.adultVariant ?? 0]++;
    }
    if (type === 'clear') {
      const widths = new Map();
      if (isBuildingMode2(state)) for (const b of data.blocks) for (const cell of cellsOf(b)) {
        const row = b.row + cell.row;
        widths.set(row, (widths.get(row) ?? 0) + 1);
      }
      // Power wipes also award the ordinary tiles outside completed rows.
      const scoredRows = isBuildingMode2(state) ? [...widths.keys()].sort((a, b) => a - b) : data.rows;
      data.award = awardRows(state, scoredRows, turn, row => {
        if (isBuildingMode2(state)) return widths.get(row);
        const { left, right } = rowSpan(state, row);
        return right - left;
      }, data.rows.length);
    }
    emit(type, data);
  };
}

export function spawnOpeningTotem(state, random, emit = () => {}, rise) {
  if (!isBuilding(state) || state.blocks.some(b => b.kind === 'totem')) return;
  const step = scoreSteps(state, emit);
  const block = spawnBuildingTotem(state, random);
  emit('totem-drop', { id: block.id });
  const moves = computeGravity(state);
  if (moves.length) emit('gravity', { moves });
  if (touchingTop(state)) return endGame(state, emit, 'top-out');
  settleBoard(state, step);
  // An opening clear can remove the seed board. Restore a legal first slide
  // without imposing turn-time refill height on openings with high ledges.
  while (rise && !hasMoves(state)) {
    rise();
    if (touchingTop(state)) return endGame(state, emit, 'top-out');
    settleBoard(state, step);
  }
}

function endGame(state, emit, reason) {
  state.phase = 'over';
  state.gameOverReason = reason;
  state.newBest = state.score > state.bestAtStart && state.score > 0;
  emit('game-over', { blockIds: state.blocks
    .filter(b => reason === 'no-moves' || b.row <= 0).map(b => b.id) });
}

export function resolveTurn(state, random, emit, rise, options = {}) {
  const building = isBuilding(state);
  const startingLevel = state.level;
  const step = scoreSteps(state, emit);
  const settle = (checkTop = true) => {
    settleBoard(state, step);
    if (checkTop && touchingTop(state)) endGame(state, emit, 'top-out');
  };
  // Count settled ordinary-tile rows, not stack height or totem rows. Recheck
  // after every rise: gravity, trimming and clears can change the deficit.
  const refillBuilding = (required = false) => {
    while (state.phase === 'play'
      && (required || occupiedTileRows(state) < REFILL_ROWS || !hasMoves(state))) {
      spawnRows(1);
      required = false;
    }
  };
  const finishBuilding = (bonus = false) => {
    if (!bonus) refillBuilding(true);
    else if (!hasMoves(state)) refillBuilding();
    if (state.phase !== 'play' || !buildingTotemsForLevelUp(startingLevel, state.level)) return;
    // Exactly one earned drop. Its clears, collections and refill cannot renew it.
    const block = spawnBuildingTotem(state, random);
    emit('totem-drop', { id: block.id });
    const moves = computeGravity(state);
    if (moves.length) step('gravity', { moves });
    if (touchingTop(state)) return endGame(state, emit, 'top-out');
    settleBoard(state, step);
    if (!bonus || !hasMoves(state)) refillBuilding();
  };
  const spawnRows = count => {
    for (let i = 0; i < count; i++) {
      if (touchingTop(state)) break;
      rise();
      // Building loses on contact, before a clear can hide the ceiling hit.
      if (building && touchingTop(state)) return endGame(state, emit, 'top-out');
      // Other play modes retain their next-turn rescue slide after a rise.
      settle(false);
    }
  };
  if (options.juniorPower && building) {
    const { variant, target } = options.juniorPower;
    emit('junior-use', applyJuniorPower(state, variant, target));
    settle();
    // Tools are bonus actions. Only refill if needed to restore a playable board.
    if (state.phase === 'play') finishBuilding(true);
    return;
  }
  if (options.forcePower && building) {
    step('clear', applyPowerMode(state));
    settleBoard(state, step, true);
    if (touchingTop(state)) endGame(state, emit, 'top-out');
    if (state.phase === 'over') return;
    return finishBuilding();
  }
  settle();
  if (state.phase === 'over') return;
  if (building) return finishBuilding();
  spawnRows(Math.max(1, REFILL_ROWS - occupiedTileRows(state)));
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
  }
  if (!occupiedTileRows(state)) spawnRows(REFILL_ROWS);
  if ((state.shape || usesTotems(state)) && !hasMoves(state)) endGame(state, emit, 'no-moves');
}
