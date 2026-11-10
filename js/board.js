// Grid-space rules only. Pixel geometry and palettes belong to theme.js.
import { cellsOf } from './block-geometry.js';
import { isBuilding } from './play-mode.js';
export const COLS = 8, ROWS = 10;
// Abstract color-group IDs in block data; no dependency on a visual palette.
export const COLOR_GROUPS = 5;

export function levelForLines(lines) {
  return 1 + Math.floor(lines / 10);
}

export function copyBoard(state) {
  return { blocks: state.blocks.map(b => ({ ...b,
    ...(b.cells ? { cells: b.cells.map(cell => ({ ...cell })) } : {}) })), nextId: state.nextId,
    ...(state.shape ? { shape: structuredClone(state.shape) } : {}) };
}

export function heightOf(block) {
  return block.height ?? 1;
}

export function rowSpan(state, row) {
  return state.shape?.rows[row] ?? { left: 0, right: COLS };
}

export function buildGrid(state) {
  const g = [];
  for (let r = 0; r < ROWS; r++) g.push(new Array(COLS).fill(null));
  for (const b of state.blocks) {
    for (const cell of cellsOf(b)) {
      const r = b.row + cell.row, c = b.col + cell.col;
      if (r >= 0 && r < ROWS) g[r][c] = b;
    }
  }
  return g;
}

export function fitsSpan(state, row, col, len, height = 1) {
  for (let r = Math.max(0, row); r < row + height; r++) {
    const { left, right } = rowSpan(state, r);
    if (r >= ROWS || col < left || col + len > right) return false;
  }
  return col >= 0 && col + len <= COLS;
}

export function fitsBlock(state, block, row = block.row, col = block.col, grid = buildGrid(state)) {
  return cellsOf(block).every(cell => {
    const r = row + cell.row, c = col + cell.col;
    if (c < 0 || c >= COLS || r >= ROWS) return false;
    if (r < 0) return true;
    const { left, right } = rowSpan(state, r);
    return c >= left && c < right && (!grid[r][c] || grid[r][c].id === block.id);
  });
}

// Repeat bottom-up passes: an irregular overhang may be supported by a piece
// whose bounding-box bottom sorts above it. All pieces still fall rigidly.
export function computeGravity(state) {
  const g = buildGrid(state);
  const moved = new Map();
  const bottom = b => b.row + heightOf(b) - 1;
  const sorted = state.blocks.slice().sort((a, b) => bottom(b) - bottom(a));
  let changed;
  do {
    changed = false;
    for (const b of sorted) {
      let r = b.row;
      while (fitsBlock(state, b, r + 1, b.col, g)) r++;
      if (r === b.row) continue;
      for (const cell of cellsOf(b)) if (b.row + cell.row >= 0)
        g[b.row + cell.row][b.col + cell.col] = null;
      for (const cell of cellsOf(b)) if (r + cell.row >= 0)
        g[r + cell.row][b.col + cell.col] = b;
      const move = moved.get(b.id) ?? { id: b.id, from: b.row };
      move.to = r;
      moved.set(b.id, move);
      b.row = r;
      changed = true;
    }
  } while (changed);
  return [...moved.values()];
}

export function fullRows(state) {
  const g = buildGrid(state);
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    const { left, right } = rowSpan(state, r);
    if (g[r].slice(left, right).every(Boolean)) out.push(r);
  }
  return out;
}

export function slideRange(state, block) {
  const g = buildGrid(state);
  const free = col => fitsBlock(state, block, block.row, col, g);
  let min = block.col, max = block.col;
  while (free(min - 1)) min--;
  while (free(max + 1)) max++;
  return [min, max];
}

export function touchingTop(state) {
  return state.blocks.some(b => b.row <= 0);
}

export function hasMoves(state) {
  return state.blocks.some(b => {
    const [min, max] = slideRange(state, b);
    return min !== max;
  });
}

function compactBuildingTotem(block, kept) {
  const world = kept.map(cell => ({ row: block.row + cell.row, col: block.col + cell.col }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const height = world.length;
  const bottom = world.at(-1).row;
  const col = Math.min(...world.map(cell => cell.col));
  block.row = bottom - height + 1;
  block.col = col;
  block.len = 1;
  block.height = height;
  block.cells = Array.from({ length: height }, (_, i) => ({ row: i, col: 0 }));
}

// Totem mode consumes the whole piece; Building keeps leftover cells as one pole
// whose bottom is the lowest surviving cell (holes collapse).
export function clearRows(state, rows) {
  const removed = new Set(rows), blocks = [], detached = [], displayBlocks = [], survivors = [];
  const compaction = [];
  let split = false;
  const building = isBuilding(state);
  for (const b of state.blocks) {
    const cells = cellsOf(b);
    const touched = cells.some(cell => removed.has(b.row + cell.row));
    if (touched && b.kind === 'totem' && building) {
      split = true;
      const kept = [], faces = [];
      for (const [i, cell] of cells.entries()) {
        const fragment = { id: `fragment:${b.id}:${i}`, kind: 'totem', color: b.color,
          row: b.row + cell.row, col: b.col + cell.col, len: 1, height: 1 };
        displayBlocks.push(fragment);
        if (removed.has(fragment.row)) blocks.push(fragment);
        else { kept.push(cell); faces.push(fragment); }
      }
      if (!kept.length) continue;
      compactBuildingTotem(b, kept);
      faces.sort((a, b) => a.row - b.row || a.col - b.col);
      for (const [i, face] of faces.entries()) {
        const to = b.row + i;
        if (face.row !== to) compaction.push({ id: face.id, from: face.row, to });
      }
      survivors.push(b);
    } else if (touched && b.kind === 'totem') {
      split = true;
      for (const [i, cell] of cells.entries()) {
        const fragment = { id: `fragment:${b.id}:${i}`, kind: 'totem', color: b.color,
          row: b.row + cell.row, col: b.col + cell.col, len: 1, height: 1 };
        displayBlocks.push(fragment);
        (removed.has(fragment.row) ? blocks : detached).push({ ...fragment });
      }
    } else {
      displayBlocks.push(structuredClone(b));
      if (touched) blocks.push(structuredClone(b));
      else survivors.push(b);
    }
  }
  state.blocks = survivors;
  return { rows: [...removed].sort((a, b) => a - b), blocks,
    ...(split ? { displayBlocks, ...(!building ? { detached } : {}) } : {}),
    ...(compaction.length ? { compaction } : {}) };
}

// Shared by real rises, opening setup, and preview simulations.
// The caller must resolve the top-row loss condition before inserting a row.
export function insertRow(state, row) {
  for (const b of state.blocks) b.row--;
  const fresh = row.map(spec => ({
    id: state.nextId++, row: ROWS - 1, col: spec.col, len: spec.len, color: spec.color
  }));
  state.blocks.push(...fresh);
  return fresh;
}

// Setup/search settle immediately; live turns use onStep for scoring and events.
export function settleBoard(board, onStep = () => {}) {
  let cleared = 0;
  for (;;) {
    const moves = computeGravity(board);
    if (moves.length) onStep('gravity', { moves });
    const rows = fullRows(board);
    if (!rows.length) return cleared;
    const clear = clearRows(board, rows);
    cleared += clear.rows.length;
    onStep('clear', clear);
  }
}
