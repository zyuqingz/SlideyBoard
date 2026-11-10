// Totem-only geometry. A totem is one rigid, one-column block with height 1–3
// (spawned at 2–3; remaining height can be 1 after a partial clear).
// Ordinary blocks retain their existing one-row, horizontal representation.
import { COLS, ROWS } from './board.js';

export function totemGrid(state) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (const b of state.blocks) {
    for (let r = Math.max(0, b.row); r < Math.min(ROWS, b.row + (b.height ?? 1)); r++)
      for (let c = b.col; c < b.col + b.len; c++) grid[r][c] = b;
  }
  return grid;
}

export function totemSlideRange(state, block) {
  const grid = totemGrid(state);
  const free = col => {
    for (let r = block.row; r < block.row + (block.height ?? 1); r++)
      if (grid[r]?.[col] && grid[r][col].id !== block.id) return false;
    return true;
  };
  let min = block.col, max = block.col;
  while (min > 0 && free(min - 1)) min--;
  while (max + block.len < COLS && free(max + block.len)) max++;
  return [min, max];
}

export function totemGravity(state) {
  const grid = totemGrid(state), moves = [];
  const bottom = b => b.row + (b.height ?? 1) - 1;
  for (const b of state.blocks.slice().sort((a, b) => bottom(b) - bottom(a))) {
    const height = b.height ?? 1;
    let row = b.row;
    while (row + height < ROWS) {
      const below = grid[row + height];
      if (below && Array.from({ length: b.len }, (_, i) => below[b.col + i]).some(Boolean)) break;
      row++;
    }
    if (row === b.row) continue;
    for (let r = Math.max(0, b.row); r < b.row + height; r++)
      for (let c = b.col; c < b.col + b.len; c++) grid[r][c] = null;
    for (let r = Math.max(0, row); r < row + height; r++)
      for (let c = b.col; c < b.col + b.len; c++) grid[r][c] = b;
    moves.push({ id: b.id, from: b.row, to: row });
    b.row = row;
  }
  return moves;
}

export function totemFullRows(state) {
  return totemGrid(state).flatMap((row, i) => row.every(Boolean) ? [i] : []);
}

// Return pre-clear cell geometry for animation. Surviving totem segments compact
// within the original footprint, keeping the same logical ID and remaining power.
export function clearTotemRows(state, rows) {
  const removed = new Set(rows), blocks = [], displayBlocks = [], survivors = [];
  for (const b of state.blocks) {
    if (b.kind !== 'totem') {
      displayBlocks.push({ ...b });
      if (removed.has(b.row)) blocks.push({ ...b });
      else survivors.push(b);
      continue;
    }
    const remaining = [];
    for (let i = 0; i < b.height; i++) {
      const segment = { ...b, id: `segment:${b.id}:${b.row + i}`, row: b.row + i, height: 1 };
      displayBlocks.push(segment);
      if (removed.has(segment.row)) blocks.push({ ...segment });
      else remaining.push(segment.row);
    }
    if (remaining.length) {
      b.height = remaining.length;
      b.row = remaining.at(-1) - b.height + 1;
      survivors.push(b);
    }
  }
  state.blocks = survivors;
  return { blocks, displayBlocks };
}

export function hasTotemMoves(state) {
  return state.blocks.some(b => {
    const [min, max] = totemSlideRange(state, b);
    return min !== max;
  });
}
