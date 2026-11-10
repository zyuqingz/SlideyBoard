// Bounded preview search specific to trimming, ledges, and shorter row clears.
import { ROWS, COLOR_GROUPS, touchingTop } from './board.js';
import { copyShapedBoard, shapedSlideRange, insertShapedRow, settleShapedBoard } from './shaped-board.js';

const ATTEMPTS = 12, PREPARATIONS = 3;

export function generateShapedCandidate(state, random) {
  const { left, right } = state.shape.rows[ROWS - 1];
  const columns = Array.from({ length: right - left }, (_, i) => left + i);
  const gapCount = 1 + Math.floor(random() * Math.min(4, columns.length - 1));
  const gaps = new Set();
  for (let i = 0; i < gapCount; i++) gaps.add(columns.splice(Math.floor(random() * columns.length), 1)[0]);
  const row = [];
  let col = left, previousColor = -1;
  while (col < right) {
    if (gaps.has(col)) { col++; previousColor = -1; continue; }
    let run = 0;
    while (col + run < right && !gaps.has(col + run)) run++;
    const max = Math.min(4, run);
    const len = 1 + Math.floor(Math.pow(random(), 1 / (1 + Math.min(10, state.level - 1) * 0.1)) * max);
    let color = Math.floor(random() * (COLOR_GROUPS - (previousColor < 0 ? 0 : 1)));
    if (previousColor >= 0 && color >= previousColor) color++;
    row.push({ col, len, color });
    col += len;
    previousColor = color;
  }
  return row;
}

function quality(board) {
  const height = Math.max(0, ...board.blocks.map(b => ROWS - b.row));
  return -height * 4 - board.blocks.reduce((sum, b) => sum + b.len, 0) * 0.2;
}

function responses(board) {
  const outcomes = [];
  for (const [index, b] of board.blocks.entries()) {
    const [min, max] = shapedSlideRange(board, b);
    for (let col = min; col <= max; col++) {
      if (col === b.col) continue;
      const next = copyShapedBoard(board);
      next.blocks[index].col = col;
      const cleared = settleShapedBoard(next);
      if (!touchingTop(next)) outcomes.push({ board: next,
        value: cleared.cells * 3 + quality(next) });
    }
  }
  return outcomes.sort((a, b) => b.value - a.value);
}

export function generateShapedNextRow(state, random) {
  const settled = copyShapedBoard(state);
  settleShapedBoard(settled);
  const preparations = responses(settled).slice(0, PREPARATIONS);
  if (!preparations.length) return generateShapedCandidate(state, random);
  const candidates = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    const row = generateShapedCandidate(state, random);
    let value = -Infinity, playable = false;
    for (const prep of preparations) {
      const next = copyShapedBoard(prep.board);
      insertShapedRow(next, row);
      const cleared = settleShapedBoard(next);
      const moves = responses(next);
      // An empty board gets refilled by the mode rather than becoming a deadlock.
      const survives = moves.length > 0 || next.blocks.length === 0;
      playable ||= survives;
      value = Math.max(value, (moves[0]?.value ?? (survives ? 0 : -100)) + cleared.cells);
    }
    candidates.push({ row, value, playable });
  }
  const viable = candidates.filter(c => c.playable);
  const pool = (viable.length ? viable : candidates).sort((a, b) => b.value - a.value).slice(0, 3);
  return pool[Math.floor(random() * pool.length)].row;
}
