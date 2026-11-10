// Optional rigid Tetris-style drops. Row previews remain owned by the mode.
import { COLS, buildGrid, fitsBlock, copyBoard, computeGravity, fullRows } from './board.js';
import { cellsOf } from './block-geometry.js';

const SHAPES = [
  ['###', '.#.'], ['.#.', '###'], ['##.', '.##'], ['.##', '##.'],
  ['#..', '###'], ['..#', '###'], ['###', '#..'], ['###', '..#'],
  ['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
  ['#.', '##', '#.'], ['.#', '##', '.#'], ['#.', '##', '.#'], ['.#', '##', '#.']
].map(rows => ({ height: rows.length, len: rows[0].length,
  cells: rows.flatMap((row, r) => [...row].flatMap((cell, c) =>
    cell === '#' ? [{ row: r, col: c }] : [])) }));

function stackedTile(block) {
  const cells = cellsOf(block);
  const top = Math.min(...cells.map(cell => cell.row));
  const cap = cells.find(cell => cell.row === top);
  const shifted = cells.map(cell => ({ row: cell.row - top + 1, col: cell.col }));
  return {
    ...block,
    row: block.row - 1,
    height: (block.height ?? 1) + 1,
    len: 1,
    cells: [{ row: 0, col: cap.col }, ...shifted]
  };
}

function spawnSingleTile(state, random) {
  const grid = buildGrid(state), candidates = [];
  for (let col = 0; col < COLS; col++) {
    const block = { id: state.nextId, kind: 'totem', col, row: -1, len: 1, height: 1, color: 4 };
    let row = block.row;
    while (fitsBlock(state, block, row + 1, col, grid)) row++;
    if (row < 1) continue;
    const trial = copyBoard(state);
    trial.blocks.push({ ...block, row });
    computeGravity(trial);
    if (fullRows(trial).length) continue;
    candidates.push(block);
  }
  if (!candidates.length) return null;
  const block = structuredClone(candidates[Math.floor(random() * candidates.length)]);
  state.nextId++;
  state.blocks.push(block);
  return block;
}

export function spawnTotemLayer(state, random) {
  const totems = state.blocks.filter(b => b.kind === 'totem');
  if (!totems.length) {
    const block = spawnSingleTile(state, random);
    return block ? { type: 'drop', block } : { type: 'blocked' };
  }
  const options = [];
  for (const b of totems) {
    const next = stackedTile(b);
    const ceiling = next.cells.some(cell => next.row + cell.row < 0);
    if (ceiling || !fitsBlock(state, next, next.row, next.col, buildGrid(state))) continue;
    options.push([b, next]);
  }
  if (!options.length) return { type: 'blocked' };
  const [b, next] = options[Math.floor(random() * options.length)];
  b.row = next.row;
  b.height = next.height;
  b.len = next.len;
  b.cells = next.cells;
  return { type: 'stack', ids: [b.id] };
}

export function spawnTotem(state, random) {
  if (state.blocks.some(b => b.kind === 'totem')) return null;
  const height = 2 + Math.floor(random() * 2);
  const grid = buildGrid(state), candidates = [];
  for (const shape of SHAPES.filter(shape => shape.height === height)) {
    for (let col = 0; col <= COLS - shape.len; col++) {
      const block = { ...shape, id: state.nextId, kind: 'totem', col, row: -height, color: 4 };
      let row = block.row;
      // Every intermediate footprint must fit, including entry through shaped edges.
      while (fitsBlock(state, block, row + 1, col, grid)) row++;
      if (row < 1) continue;
      const trial = copyBoard(state);
      trial.blocks.push({ ...block, row });
      computeGravity(trial);
      // Reject any full row before Totem removal or cascades.
      if (fullRows(trial).length) continue;
      candidates.push(block);
    }
  }
  if (!candidates.length) return null;
  const block = structuredClone(candidates[Math.floor(random() * candidates.length)]);
  state.nextId++;
  state.blocks.push(block);
  return block;
}
