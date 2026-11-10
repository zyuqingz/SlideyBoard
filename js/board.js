// Grid-space rules only. Pixel geometry and palettes belong to theme.js.
export const COLS = 9, ROWS = 10;
// Abstract color-group IDs in block data; no dependency on a visual palette.
export const COLOR_GROUPS = 5;

export function levelForLines(lines) {
  return 1 + Math.floor(lines / 10);
}

export function copyBoard(state) {
  return { blocks: state.blocks.map(b => ({ ...b })), nextId: state.nextId };
}

export function buildGrid(state) {
  const g = [];
  for (let r = 0; r < ROWS; r++) g.push(new Array(COLS).fill(null));
  for (const b of state.blocks) {
    if (b.row < 0 || b.row >= ROWS) continue;
    for (let i = 0; i < b.len; i++) g[b.row][b.col + i] = b;
  }
  return g;
}

function spanFree(g, r, c, len) {
  for (let i = 0; i < len; i++) if (g[r][c + i]) return false;
  return true;
}

// Drop unsupported blocks bottom-up. The presenter animates the returned moves.
export function computeGravity(state) {
  const g = buildGrid(state);
  const moved = [];
  const sorted = state.blocks.slice().sort((a, b) => b.row - a.row);
  for (const b of sorted) {
    let r = b.row;
    while (r + 1 < ROWS && spanFree(g, r + 1, b.col, b.len)) r++;
    if (r !== b.row) {
      for (let i = 0; i < b.len; i++) { g[b.row][b.col + i] = null; g[r][b.col + i] = b; }
      moved.push({ id: b.id, from: b.row, to: r });
      b.row = r;
    }
  }
  return moved;
}

export function fullRows(state) {
  const g = buildGrid(state);
  const out = [];
  for (let r = 0; r < ROWS; r++) if (g[r].every(Boolean)) out.push(r);
  return out;
}

export function slideRange(state, block) {
  const g = buildGrid(state);
  let min = block.col, max = block.col;
  while (min - 1 >= 0 && !g[block.row][min - 1]) min--;
  while (max + block.len < COLS && !g[block.row][max + block.len]) max++;
  return [min, max];
}

export function touchingTop(state) {
  return state.blocks.some(b => b.row === 0);
}

export function removeByIds(state, ids) {
  state.blocks = state.blocks.filter(b => !ids.has(b.id));
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

// Immediate settle for setup/search. Live mode policies additionally award score
// and record events between clear batches.
export function settleBoard(board) {
  let cleared = 0;
  for (;;) {
    computeGravity(board);
    const rows = fullRows(board);
    if (!rows.length) return cleared;
    cleared += rows.length;
    board.blocks = board.blocks.filter(b => !rows.includes(b.row));
  }
}
