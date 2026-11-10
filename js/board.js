// Grid-space rules only. Pixel geometry and palettes belong to theme.js.
export const COLS = 9, ROWS = 10;
// Abstract color-group IDs in block data; no dependency on a visual palette.
export const COLOR_GROUPS = 5;

export function levelForLines(lines) {
  return 1 + Math.floor(lines / 10);
}

export function copyBoard(state) {
  return { blocks: state.blocks.map(b => ({ ...b })), nextId: state.nextId,
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
    for (let r = Math.max(0, b.row); r < Math.min(ROWS, b.row + heightOf(b)); r++)
      for (let i = 0; i < b.len; i++) g[r][b.col + i] = b;
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

// Drop unsupported blocks bottom-up. The presenter animates the returned moves.
export function computeGravity(state) {
  const g = buildGrid(state);
  const moved = [];
  const bottom = b => b.row + heightOf(b) - 1;
  const sorted = state.blocks.slice().sort((a, b) => bottom(b) - bottom(a));
  for (const b of sorted) {
    const height = heightOf(b);
    let r = b.row;
    while (r + height < ROWS && fitsSpan(state, r + 1, b.col, b.len, height)) {
      if (g[r + height]?.slice(b.col, b.col + b.len).some(Boolean)) break;
      r++;
    }
    if (r !== b.row) {
      for (let row = Math.max(0, b.row); row < b.row + height; row++)
        for (let col = b.col; col < b.col + b.len; col++) g[row][col] = null;
      for (let row = Math.max(0, r); row < r + height; row++)
        for (let col = b.col; col < b.col + b.len; col++) g[row][col] = b;
      moved.push({ id: b.id, from: b.row, to: r });
      b.row = r;
    }
  }
  return moved;
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
  const free = col => {
    if (!fitsSpan(state, block.row, col, block.len, heightOf(block))) return false;
    for (let r = Math.max(0, block.row); r < block.row + heightOf(block); r++)
      for (let c = col; c < col + block.len; c++)
        if (g[r][c] && g[r][c].id !== block.id) return false;
    return true;
  };
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

// Clear vertical pieces cell by cell. Remaining Totem cells stay one solid pole
// whose bottom is the lowest surviving cell of the original footprint.
export function clearRows(state, rows) {
  const removed = new Set(rows), blocks = [], displayBlocks = [], survivors = [];
  const segmented = state.blocks.some(b => b.kind === 'totem');
  for (const b of state.blocks) {
    if (b.kind !== 'totem') {
      if (segmented) displayBlocks.push({ ...b });
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
  return { blocks, ...(segmented ? { displayBlocks } : {}) };
}

export function chooseTotemRows(state, height, random) {
  const pool = buildGrid(state).flatMap((row, i) => row.some(Boolean) ? [i] : []);
  const rows = [];
  while (rows.length < height && pool.length)
    rows.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return rows.sort((a, b) => a - b);
}

// Live turns supply their RNG; search uses a repeatable representative blast.
// Negative rows belong to incoming drops, not rising Totems ready to activate.
function activateTotems(state, random = () => 0.5, onStep = () => {}) {
  for (const b of state.blocks.filter(b => b.kind === 'totem' && b.row === 0)) {
    state.blocks = state.blocks.filter(block => block.id !== b.id);
    onStep('totem-activate', { block: b });
    const rows = chooseTotemRows(state, b.height, random);
    if (rows.length) onStep('clear', { rows, ...clearRows(state, rows) });
  }
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
export function settleBoard(board, onStep = () => {}, random) {
  let cleared = 0;
  activateTotems(board, random, (type, data) => {
    if (type === 'clear') cleared += data.rows.length;
    onStep(type, data);
  });
  for (;;) {
    const moves = computeGravity(board);
    if (moves.length) onStep('gravity', { moves });
    const rows = fullRows(board);
    if (!rows.length) return cleared;
    cleared += rows.length;
    onStep('clear', { rows, ...clearRows(board, rows) });
  }
}
