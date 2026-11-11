// Tetris pieces and Building tile drops. Row previews remain owned by the mode.
import { COLS, rowSpan, buildGrid, fitsBlock, copyBoard, computeGravity, fullRows } from './board.js';

const SHAPES = [
  ['###', '.#.'], ['.#.', '###'], ['##.', '.##'], ['.##', '##.'],
  ['#..', '###'], ['..#', '###'], ['###', '#..'], ['###', '..#'],
  ['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
  ['#.', '##', '#.'], ['.#', '##', '.#'], ['#.', '##', '.#'], ['.#', '##', '#.']
].map(rows => ({ height: rows.length, len: rows[0].length,
  cells: rows.flatMap((row, r) => [...row].flatMap((cell, c) =>
    cell === '#' ? [{ row: r, col: c }] : [])) }));

export function spawnBuildingTotem(state, random, recentColumns = []) {
  const grid = buildGrid(state), candidates = [];
  const { left, right } = rowSpan(state, 0);
  for (let col = left; col < right; col++) {
    const block = { id: state.nextId, kind: 'totem', col, row: -1, len: 1, height: 1,
      color: 4, smile: 1 };
    let row = block.row;
    while (fitsBlock(state, block, row + 1, col, grid)) row++;
    candidates.push({ block, landingRow: row });
  }
  // Smaller landing rows mean taller columns. Prefer the two highest safe
  // landings, using distance from existing/recent totems to break height ties.
  const safe = candidates.filter(candidate => candidate.landingRow > 0);
  const pool = safe.length ? safe : candidates;
  const totemCols = [...recentColumns, ...state.blocks.filter(b => b.kind === 'totem').map(b => b.col)];
  const spacing = candidate => totemCols.length
    ? Math.min(...totemCols.map(col => Math.abs(candidate.block.col - col))) : 0;
  const highest = pool.sort((a, b) => a.landingRow - b.landingRow || spacing(b) - spacing(a)).slice(0, 2);
  const block = highest[Math.floor(random() * highest.length)].block;
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
