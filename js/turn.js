// Shared turn lifecycle. Modes supply insertion/preview rules, options add drops.
import { ROWS, rowSpan, computeGravity, settleBoard, touchingTop, hasMoves,
  occupiedTileRows, fullRows, heightOf, applyPowerMode } from './board.js';
import { createTurnScore, awardRows, awardTotemCollect } from './sim.js';
import { spawnTotem, spawnBuildingTotem } from './totem-spawn.js';
import { isBuilding, isTetris, usesTotems, tetrisDropInterval,
  isBuildingMode2, buildingTotemsForLevelUp, REFILL_ROWS } from './play-mode.js';
import { cellsOf } from './block-geometry.js';

function scoreSteps(state, emit) {
  const turn = createTurnScore();
  return (type, data) => {
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
    } else if (type === 'totem-collect') {
      data.award = awardTotemCollect(state, data.blocks);
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
  const onFloor = () => state.blocks.some(b =>
    b.kind === 'totem' && b.row + heightOf(b) - 1 >= ROWS - 1);
  const hasTotem = () => state.blocks.some(b => b.kind === 'totem');
  const finishBuilding = () => {
    let levelDrops = 0, replacementUsed = false;
    const dropColumns = [];
    const batchMoves = [];
    const flushFalls = () => {
      if (!batchMoves.length) return;
      step('gravity', { moves: batchMoves.splice(0) });
    };
    // Count settled ordinary-tile rows, not stack height or totem rows. Recheck
    // after every rise: gravity, trimming and clears can change the deficit.
    const refill = (required = false) => {
      while (state.phase === 'play'
        && (required || occupiedTileRows(state) < REFILL_ROWS || !hasMoves(state))) {
        spawnRows(1);
        required = false;
      }
    };
    refill(true);
    while (state.phase === 'play') {
      const replacement = !hasTotem() && !replacementUsed;
      const budget = buildingTotemsForLevelUp(startingLevel, state.level);
      if (!replacement && levelDrops >= budget) break;
      // Charge before landing. Clears/collections never refund a drop, and
      // later level-ups can only increase this turn's budget up to the cap.
      if (replacement) replacementUsed = true;
      else levelDrops++;
      const block = spawnBuildingTotem(state, random, dropColumns);
      dropColumns.push(block.col);
      emit('totem-drop', { id: block.id });
      // Land each tile before choosing the next column, so batches can stack
      // without overlapping above the board or mistaking entry for a top-out.
      const moves = computeGravity(state);
      if (moves.length) batchMoves.push(...moves);
      if (touchingTop(state)) {
        flushFalls();
        return endGame(state, emit, 'top-out');
      }
      // Flush before a clear or collect so those events still follow a landing.
      if (fullRows(state).length || onFloor() || !hasMoves(state)) {
        flushFalls();
        settleBoard(state, step);
        refill();
      }
    }
    flushFalls();
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
