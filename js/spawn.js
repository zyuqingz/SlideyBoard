// Board-aware row selection. Search runs only on copies of the live board.
import {
  COLS, ROWS, COLOR_GROUPS, buildGrid, copyBoard, insertRow, levelForLines,
  settleBoard, slideRange, touchingTop
} from './board.js';
import { generateNormalRow } from './difficulty.js';
import { isBuilding, levelForBuildingLines } from './play-mode.js';

// Search budget and difficulty tuning live together; no hidden per-player state.
const SEARCH = Object.freeze({
  candidateAttempts: 20,
  preparationLimit: 4,
  shortlistSize: 5,
  reliefShortlistSize: 3,
  selectionTemperature: 8
});
const DIFFICULTY = Object.freeze({
  maxLevelOffset: 10,
  reliefHeight: 7,
  openingLines: 3,
  reliefCandidateInterval: 2,
  maxBlockLength: 4
});
const SCORE = Object.freeze({
  heightPenalty: 4,
  holePenalty: 1.5,
  cellPenalty: 0.2,
  preparationClear: 18,
  clear: 14,
  assistedClear: 24,
  extraClear: 8,
  reliefBoardMultiplier: 2,
  automaticClear: 6,
  moveChoice: 0.5,
  moveChoiceCap: 8,
  repeatPenalty: 12,
  noResponse: -80
});

function weightedIndex(random, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let remaining = random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (remaining < weights[i]) return i;
    remaining -= weights[i];
  }
  return weights.length - 1;
}

function rowWeights(level) {
  const offset = Math.max(0, Math.min(DIFFICULTY.maxLevelOffset, level - 1));
  return {
    gaps: [3 + 3 * offset, 22, 34, Math.max(10, 28 - 2 * offset), Math.max(3, 13 - 2 * offset)],
    lengths: [Math.max(6, 30 - 3 * offset), 32, Math.min(34, 22 + 2 * offset), Math.min(40, 14 + 3 * offset)]
  };
}

// Used for opening rows and as input to the preview search, never as a second
// preview policy. Sampling without replacement guarantees bounded RNG calls.
export function generateRowCandidate(level, random = Math.random, difficulty = 'easy', minLen = 1) {
  if (difficulty === 'normal') return generateNormalRow(level, random, 0, COLS, minLen);
  const weights = rowWeights(level);
  const gapCount = weightedIndex(random, weights.gaps) + 1;
  const columns = Array.from({ length: COLS }, (_, i) => i);
  const gaps = new Set();
  for (let i = 0; i < gapCount; i++) {
    const index = Math.floor(random() * columns.length);
    gaps.add(columns.splice(index, 1)[0]);
  }
  const row = [];
  let col = 0, previousColor = -1, previousEnd = -1;
  while (col < COLS) {
    if (gaps.has(col)) { col++; continue; }
    let run = 0;
    while (col + run < COLS && !gaps.has(col + run)) run++;
    while (run > 0) {
      const maxLength = Math.min(DIFFICULTY.maxBlockLength, run);
      if (maxLength < minLen) { col += run; run = 0; continue; }
      const len = weightedIndex(random, weights.lengths.slice(minLen - 1, maxLength)) + minLen;
      const adjacent = previousEnd === col;
      let color = Math.floor(random() * (COLOR_GROUPS - (adjacent ? 1 : 0)));
      if (adjacent && color >= previousColor) color++;
      row.push({ col, len, color });
      previousColor = color;
      previousEnd = col + len;
      col += len;
      run -= len;
    }
  }
  // Isolated runs can all be skipped in Building. A contiguous-gap fallback
  // guarantees a usable row without retrying the same fragmented RNG pattern.
  return row.length ? row : generateNormalRow(level, random, 0, COLS, minLen);
}

function boardQuality(board) {
  const grid = buildGrid(board);
  let height = 0, holes = 0, cells = 0;
  for (let col = 0; col < COLS; col++) {
    let covered = false;
    for (let row = 0; row < ROWS; row++) {
      if (grid[row][col]) {
        covered = true;
        cells++;
        height = Math.max(height, ROWS - row);
      } else if (covered) holes++;
    }
  }
  const value = -height * SCORE.heightPenalty - holes * SCORE.holePenalty - cells * SCORE.cellPenalty;
  return { height, value };
}

function survivingSlides(board) {
  const outcomes = [];
  for (let i = 0; i < board.blocks.length; i++) {
    const block = board.blocks[i];
    const [min, max] = slideRange(board, block);
    for (let col = min; col <= max; col++) {
      if (col === block.col) continue;
      const next = copyBoard(board);
      next.blocks[i].col = col;
      const cleared = settleBoard(next);
      if (!touchingTop(next)) outcomes.push({ board: next, cleared });
    }
  }
  return outcomes;
}

function preparationBoards(board) {
  return survivingSlides(board)
    .map(move => ({
      board: move.board,
      value: move.cleared * SCORE.preparationClear + boardQuality(move.board).value
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, SEARCH.preparationLimit)
    .map(move => move.board);
}

function rowKey(row) {
  return row.map(block => `${block.col}:${block.len}:${block.color}`).join(',');
}

function generateCandidates(level, relief, random, difficulty, minLen = 1) {
  const candidates = [];
  const seen = new Set();
  for (let i = 0; i < SEARCH.candidateAttempts; i++) {
    const gentle = relief && i % DIFFICULTY.reliefCandidateInterval === 0;
    const row = generateRowCandidate(gentle ? 1 : level, random, difficulty, minLen);
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ row, key });
  }
  return candidates;
}

function scoreResponse(response, context) {
  const clearReward = context.relief || context.opening ? SCORE.assistedClear : SCORE.clear;
  const boardMultiplier = context.relief ? SCORE.reliefBoardMultiplier : 1;
  return response.cleared * clearReward
    + Math.max(0, response.cleared - 1) * SCORE.extraClear
    + boardQuality(response.board).value * boardMultiplier;
}

function evaluateCandidate(candidate, preparations, context) {
  let value = -Infinity, playable = false;
  for (const board of preparations) {
    const next = copyBoard(board);
    insertRow(next, candidate.row);
    const autoClears = settleBoard(next);
    const responses = survivingSlides(next);
    if (responses.length) playable = true;
    // Only use the dead-end penalty when there truly is no surviving response.
    const bestResponse = responses.length
      ? Math.max(...responses.map(response => scoreResponse(response, context)))
      : SCORE.noResponse;
    value = Math.max(value, bestResponse + autoClears * SCORE.automaticClear
      + Math.min(SCORE.moveChoiceCap, responses.length) * SCORE.moveChoice);
  }
  if (candidate.key === context.previousKey) value -= SCORE.repeatPenalty;
  return { row: candidate.row, value, playable };
}

function selectCandidate(candidates, relief, random) {
  // Prefer a surviving continuation whenever the bounded search finds one.
  const playable = candidates.filter(candidate => candidate.playable);
  const pool = playable.length ? playable : candidates;
  pool.sort((a, b) => b.value - a.value);
  const count = relief ? SEARCH.reliefShortlistSize : SEARCH.shortlistSize;
  const shortlist = pool.slice(0, count);
  const best = shortlist[0].value;
  const weights = shortlist.map(candidate => (
    Math.exp((candidate.value - best) / SEARCH.selectionTemperature)
  ));
  return shortlist[weightedIndex(random, weights)].row;
}

// The sole preview entry point. Model the next slide BEFORE inserting a row,
// then search a response after arrival. This bounded search can miss solutions.
export function generateNextRow(state, random = Math.random) {
  const board = copyBoard(state);
  const lines = state.lines + settleBoard(board);
  const building = isBuilding(state);
  const minLen = building ? 2 : 1;
  const level = building ? levelForBuildingLines(lines) : levelForLines(lines);
  const context = {
    relief: boardQuality(board).height >= DIFFICULTY.reliefHeight,
    opening: lines < DIFFICULTY.openingLines,
    previousKey: rowKey(state.nextRow)
  };
  const preparations = preparationBoards(board);
  // No legal turn means no useful continuation to simulate. Still return a valid
  // preview, rather than inventing a no-op move that the player cannot perform.
  if (!preparations.length)
    return generateRowCandidate(level, random, state.difficulty, minLen);
  const candidates = generateCandidates(level, context.relief, random,
    state.difficulty, minLen);
  const evaluated = candidates.map(candidate => evaluateCandidate(candidate, preparations, context));
  return selectCandidate(evaluated, context.relief, random);
}
