// Tetris pieces and Building tile drops. Row previews remain owned by the mode.
import { COLS, buildGrid, fitsBlock, copyBoard, computeGravity, fullRows } from './board.js';

const SHAPES = [
  ['###', '.#.'], ['.#.', '###'], ['##.', '.##'], ['.##', '##.'],
  ['#..', '###'], ['..#', '###'], ['###', '#..'], ['###', '..#'],
  ['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
  ['#.', '##', '#.'], ['.#', '##', '.#'], ['#.', '##', '.#'], ['.#', '##', '#.']
].map(rows => ({ height: rows.length, len: rows[0].length,
  cells: rows.flatMap((row, r) => [...row].flatMap((cell, c) =>
    cell === '#' ? [{ row: r, col: c }] : [])) }));

function spawnSingleTile(state, random) {
  const grid = buildGrid(state), candidates = [];
  const taken = new Set(state.blocks.filter(b => b.kind === 'totem').map(b => b.col));
  for (let col = 0; col < COLS; col++) {
    if (taken.has(col)) continue;
    const block = { id: state.nextId, kind: 'totem', col, row: -1, len: 1, height: 1,
      color: 4, smile: 1 };
    let row = block.row;
    while (fitsBlock(state, block, row + 1, col, grid)) row++;
    if (row < 1) continue;
    const trial = copyBoard(state);
    trial.blocks.push({ ...block, row });
    computeGravity(trial);
    if (fullRows(trial).length) continue;
    const landed = trial.blocks.find(b => b.id === block.id);
    const support = landed && buildGrid(trial)[landed.row + 1]?.[landed.col];
    // A new face must land on an ordinary block, never the floor or a ledge.
    if (!support || support.kind === 'totem') continue;
    candidates.push({ block, landingRow: landed.row });
  }
  if (!candidates.length) return null;
  const topRow = Math.min(...candidates.map(candidate => candidate.landingRow));
  const highest = candidates.filter(candidate => candidate.landingRow === topRow);
  const block = structuredClone(highest[Math.floor(random() * highest.length)].block);
  state.nextId++;
  state.blocks.push(block);
  return block;
}

export function spawnBuildingTotem(state, random) {
  const block = spawnSingleTile(state, random);
  return block ? { type: 'drop', block } : { type: 'blocked' };
}

export function spawnOpeningTotem(state, random) {
  if (state.playMode !== 'totem-building' || state.blocks.some(b => b.kind === 'totem')) return;
  state.pendingTotemSpawns++;
  const result = spawnBuildingTotem(state, random);
  state.totemSpawnBlocked = result.type === 'blocked';
  // Land before the first slide so the opening face is on the board at level start.
  if (result.type === 'drop') {
    state.pendingTotemSpawns--;
    computeGravity(state);
  }
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
