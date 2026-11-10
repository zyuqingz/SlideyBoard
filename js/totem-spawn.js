// Optional rigid Tetris-style drops. Row previews remain owned by the mode.
import { COLS, buildGrid, fitsBlock, copyBoard, computeGravity, fullRows } from './board.js';

const SHAPES = [
  ['###', '.#.'], ['.#.', '###'], ['##.', '.##'], ['.##', '##.'],
  ['#..', '###'], ['..#', '###'], ['###', '#..'], ['###', '..#'],
  ['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
  ['#.', '##', '#.'], ['.#', '##', '.#'], ['#.', '##', '.#'], ['.#', '##', '#.']
].map(rows => ({ height: rows.length, len: rows[0].length,
  cells: rows.flatMap((row, r) => [...row].flatMap((cell, c) =>
    cell === '#' ? [{ row: r, col: c }] : [])) }));

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
