// Grid-space rules only. Pixel geometry and palettes belong to theme.js.
import { cellsOf } from './block-geometry.js';
import { isBuilding, TOTEM_SMILE_MAX, classicProgressFromLines } from './play-mode.js';
export const COLS = 8, ROWS = 10;
// Abstract color-group IDs in block data; no dependency on a visual palette.
export const COLOR_GROUPS = 5;

export function levelForLines(lines) {
  return classicProgressFromLines(lines).level;
}

export function copyBoard(state) {
  return { blocks: state.blocks.map(b => ({ ...b,
    ...(b.cells ? { cells: b.cells.map(cell => ({ ...cell })) } : {}) })), nextId: state.nextId,
    playMode: state.playMode,
    buildingMode: state.buildingMode,
    ...(state.shape ? { shape: structuredClone(state.shape) } : {}) };
}

export function heightOf(block) {
  return block.height ?? 1;
}

// Unique occupied rows from ordinary tiles and smiling shards.
// Totems do not count as refill material. Count actual occupied cell rows,
// including irregular shards, rather than block origins or bounding height.
export function occupiedTileRows(state) {
  const rows = new Set();
  for (const b of state.blocks) {
    if (b.kind === 'totem') continue;
    for (const cell of cellsOf(b)) {
      const r = b.row + cell.row;
      if (r >= 0 && r < ROWS) rows.add(r);
    }
  }
  return rows.size;
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
    const cells = g[r].slice(left, right);
    if (!cells.every(Boolean)) continue;
    out.push(r);
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

export function takeNextId(state) {
  const numeric = state.blocks.map(block => block.id).filter(Number.isInteger);
  if (!Number.isInteger(state.nextId) || numeric.includes(state.nextId))
    state.nextId = (numeric.length ? Math.max(...numeric) : 0) + 1;
  return state.nextId++;
}

export function connectedGroups(cells) {
  const key = cell => `${cell.row}:${cell.col}`;
  const index = new Map(cells.map(cell => [key(cell), cell]));
  const seen = new Set(), groups = [];
  for (const start of cells) {
    if (seen.has(key(start))) continue;
    const group = [];
    const stack = [start];
    seen.add(key(start));
    while (stack.length) {
      const cur = stack.pop();
      group.push(cur);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = index.get(`${cur.row + dr}:${cur.col + dc}`);
        if (!next || seen.has(key(next))) continue;
        seen.add(key(next));
        stack.push(next);
      }
    }
    groups.push(group);
  }
  return groups;
}

function smilingShard(state, world, color) {
  world.sort((a, b) => a.row - b.row || a.col - b.col);
  const top = world[0].row;
  const left = Math.min(...world.map(cell => cell.col));
  return {
    id: takeNextId(state),
    row: top,
    col: left,
    len: Math.max(...world.map(cell => cell.col)) - left + 1,
    height: Math.max(...world.map(cell => cell.row)) - top + 1,
    color,
    face: 'smile',
    cells: world.map(cell => ({ row: cell.row - top, col: cell.col - left }))
  };
}

// Tetris leftovers keep orthogonally connected groups as smiling shards.
// Building totems gain a smile stage; all-totem rows power up every totem
// and remove all ordinary blocks before collection and gravity resume.
export function clearRows(state, rows) {
  const removed = new Set(rows), blocks = [], displayBlocks = [], survivors = [];
  let split = false;
  const building = isBuilding(state);
  const grid = building ? buildGrid(state) : null;
  const powered = building && rows.some(row => {
    const { left, right } = rowSpan(state, row);
    return grid[row].slice(left, right).every(b => b?.kind === 'totem');
  });
  if (powered) return applyPowerMode(state, [...removed]);
  for (const b of state.blocks) {
    const cells = cellsOf(b);
    const touched = cells.some(cell => removed.has(b.row + cell.row));
    if (touched && b.kind === 'totem' && building) {
      b.smile = Math.min(TOTEM_SMILE_MAX, (b.smile ?? 1) + 1);
      displayBlocks.push(structuredClone(b));
      survivors.push(b);
    } else if (touched && (b.kind === 'totem' || b.face === 'smile')) {
      split = true;
      const kept = [];
      for (const [i, cell] of cells.entries()) {
        const world = { row: b.row + cell.row, col: b.col + cell.col };
        if (removed.has(world.row)) {
          const fragment = { id: `fragment:${b.id}:${i}`, kind: 'totem', color: b.color,
            ...world, len: 1, height: 1 };
          displayBlocks.push(fragment);
          blocks.push(fragment);
        } else kept.push(world);
      }
      for (const group of connectedGroups(kept)) {
        const shard = smilingShard(state, group, b.color);
        displayBlocks.push(structuredClone(shard));
        survivors.push(shard);
      }
    } else {
      displayBlocks.push(structuredClone(b));
      if (touched) blocks.push(structuredClone(b));
      else survivors.push(b);
    }
  }
  state.blocks = survivors;
  return { rows: [...removed].sort((a, b) => a - b), blocks,
    ...(split ? { displayBlocks } : {}) };
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
function collectBuildingTotems(board) {
  if (!isBuilding(board)) return [];
  const kept = [], collected = [];
  for (const b of board.blocks) {
    if (b.kind === 'totem' && (b.smile ?? 1) >= TOTEM_SMILE_MAX) collected.push(b);
    else kept.push(b);
  }
  if (!collected.length) return [];
  board.blocks = kept;
  return collected;
}

// Upgrade every totem and strip ordinary tiles, as if an all-totem row completed.
export function applyPowerMode(state, rows = []) {
  const blocks = [], displayBlocks = [], survivors = [];
  for (const b of state.blocks) {
    if (b.kind === 'totem') {
      b.smile = TOTEM_SMILE_MAX;
      survivors.push(b);
    } else blocks.push(structuredClone(b));
    displayBlocks.push(structuredClone(b));
  }
  state.blocks = survivors;
  return { rows: [...new Set(rows)].sort((a, b) => a - b), blocks, displayBlocks, godClear: true };
}

export function settleBoard(board, onStep = () => {}) {
  let cleared = 0;
  for (;;) {
    // Fully grown Juniors cash out at the upgrade position, before gravity or another
    // cascade can reuse the stage-3 tile to complete a row.
    const collected = collectBuildingTotems(board);
    if (collected.length) {
      onStep('totem-collect', { blocks: collected });
      continue;
    }
    const moves = computeGravity(board);
    if (moves.length) onStep('gravity', { moves });
    const rows = fullRows(board);
    if (rows.length) {
      const clear = clearRows(board, rows);
      cleared += clear.rows.length;
      onStep('clear', clear);
      continue;
    }
    return cleared;
  }
}
