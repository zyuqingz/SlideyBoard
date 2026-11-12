// Tetris pieces and Building tile drops. Row previews remain owned by the mode.
import { COLS, rowSpan, buildGrid, fitsBlock, copyBoard, computeGravity, fullRows } from './board.js';
import { JUNIOR_COUNT } from './junior-powers.js';

const SHAPES = [
  ['###', '.#.'], ['.#.', '###'], ['##.', '.##'], ['.##', '##.'],
  ['#..', '###'], ['..#', '###'], ['###', '#..'], ['###', '..#'],
  ['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
  ['#.', '##', '#.'], ['.#', '##', '.#'], ['#.', '##', '.#'], ['.#', '##', '#.']
].map(rows => ({ height: rows.length, len: rows[0].length,
  cells: rows.flatMap((row, r) => [...row].flatMap((cell, c) =>
    cell === '#' ? [{ row: r, col: c }] : [])) }));

export function spawnBuildingTotem(state, random) {
  const grid = buildGrid(state);
  const tileGrid = buildGrid({ ...state, blocks: state.blocks.filter(b => b.kind !== 'totem') });
  const candidates = [];
  const { left, right } = rowSpan(state, 0);
  for (let col = left; col < right; col++) {
    const block = { id: state.nextId, kind: 'totem', col, row: -1, len: 1, height: 1,
      color: 4, smile: 1 };
    let row = block.row, rankRow = block.row;
    while (fitsBlock(state, block, row + 1, col, grid)) row++;
    // Rank ordinary-tile height only. Live totems do not make a column taller,
    // but the drop can still land on them.
    while (fitsBlock(state, block, rankRow + 1, col, tileGrid)) rankRow++;
    candidates.push({ block, landingRow: row, rankRow });
  }
  const safe = candidates.filter(candidate => candidate.landingRow > 0);
  const pool = safe.length ? safe : candidates;
  const tiled = pool.filter(candidate =>
    tileGrid.some(row => row[candidate.block.col]));
  // Land on ordinary tiles. An empty board still uses the floor.
  const grounded = tiled.length ? tiled : pool;
  const minRank = Math.min(...grounded.map(candidate => candidate.rankRow));
  // Include columns one row lower than the tallest remaining tile stack.
  const picks = grounded.filter(candidate => candidate.rankRow <= minRank + 1)
    .sort((a, b) => a.rankRow - b.rankRow);
  // The fractional part supplies an independent identity without an extra RNG draw.
  const roll = random() * picks.length;
  const block = picks[Math.floor(roll)].block;
  block.adultVariant = Math.floor((roll % 1) * JUNIOR_COUNT);
  state.nextId++;
  state.blocks.push(block);
  return block;
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
