// Shaped-only geometry and simulation. Classic's rectangular primitives stay separate.
import { ROWS, buildGrid } from './board.js';

export function copyShapedBoard(state) {
  return { blocks: state.blocks.map(b => ({ ...b })), nextId: state.nextId,
    shape: structuredClone(state.shape) };
}

export function shapedSlideRange(state, block) {
  const grid = buildGrid(state), { left, right } = state.shape.rows[block.row];
  let min = block.col, max = block.col;
  while (min > left && !grid[block.row][min - 1]) min--;
  while (max + block.len < right && !grid[block.row][max + block.len]) max++;
  return [min, max];
}

export function hasShapedMoves(state) {
  return state.blocks.some(b => {
    const [min, max] = shapedSlideRange(state, b);
    return min !== max;
  });
}

export function shapedGravity(state) {
  const grid = buildGrid(state), moves = [];
  for (const b of state.blocks.slice().sort((a, b) => b.row - a.row)) {
    let row = b.row;
    while (row + 1 < ROWS) {
      const { left, right } = state.shape.rows[row + 1];
      if (b.col < left || b.col + b.len > right) break;
      if (grid[row + 1].slice(b.col, b.col + b.len).some(Boolean)) break;
      row++;
    }
    if (row === b.row) continue;
    for (let col = b.col; col < b.col + b.len; col++) {
      grid[b.row][col] = null;
      grid[row][col] = b;
    }
    moves.push({ id: b.id, from: b.row, to: row });
    b.row = row;
  }
  return moves;
}

export function shapedFullRows(state) {
  const grid = buildGrid(state);
  return state.shape.rows.flatMap(({ left, right }, row) =>
    grid[row].slice(left, right).every(Boolean) ? [row] : []);
}

// Caller must resolve top-out first. Return pre-trim geometry and discarded cells
// as facts for presentation; only survivors enter the authoritative board.
export function insertShapedRow(state, row) {
  if (state.blocks.some(b => b.row <= 0)) throw new Error('Cannot rise past the top');
  const blocks = state.blocks.map(b => ({ ...b, row: b.row - 1 }));
  const fresh = row.map(spec => ({ ...spec, id: state.nextId++, row: ROWS - 1 }));
  const trimmed = [], survivors = [];
  for (const b of blocks) {
    const { left, right } = state.shape.rows[b.row];
    const start = Math.max(b.col, left), end = Math.min(b.col + b.len, right);
    if (end <= start) {
      trimmed.push({ ...b });
      continue;
    }
    if (start > b.col) trimmed.push({ ...b, len: start - b.col });
    if (end < b.col + b.len) trimmed.push({ ...b, col: end, len: b.col + b.len - end });
    survivors.push({ ...b, col: start, len: end - start });
  }
  state.blocks = [...survivors, ...fresh];
  return { blocks: [...blocks, ...fresh], trimmed };
}

// Search and opening setup use exactly the live mode's gravity/clear rules.
export function settleShapedBoard(state, onStep = () => {}) {
  let cells = 0, lines = 0;
  for (;;) {
    const moves = shapedGravity(state);
    if (moves.length) onStep('gravity', { moves });
    const rows = shapedFullRows(state);
    if (!rows.length) return { cells, lines };
    const blocks = state.blocks.filter(b => rows.includes(b.row));
    state.blocks = state.blocks.filter(b => !rows.includes(b.row));
    cells += blocks.reduce((sum, b) => sum + b.len, 0);
    lines += rows.length;
    onStep('clear', { rows, blocks });
  }
}
