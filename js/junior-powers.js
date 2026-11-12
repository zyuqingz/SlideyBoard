// Collected Junior identities and grid-space targeting; no presentation state.
import { ROWS, rowSpan, connectedGroups, takeNextId } from './board.js';
import { cellsOf } from './block-geometry.js';

export const JUNIOR_COUNT = 4;

function inBlast(row, col, target) {
  return Math.abs(row - target.row) <= 1 && Math.abs(col - target.col) <= 1;
}

export function juniorTarget(state, variant, row, col) {
  if (!Number.isInteger(variant) || variant < 0 || variant >= JUNIOR_COUNT
    || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= ROWS) return null;
  const { left, right } = rowSpan(state, row);
  if (col < left || col >= right) return null;
  const blocks = state.blocks.filter(b => {
    if (variant === 1) return b.kind === 'totem' && (b.smile ?? 1) < 3
      && cellsOf(b).some(cell => b.row + cell.row === row && b.col + cell.col === col);
    if (b.kind === 'totem') return false;
    if (variant === 3) return cellsOf(b).length > 1;
    return cellsOf(b).some(cell => {
      const r = b.row + cell.row, c = b.col + cell.col;
      if (variant === 0) return r === row;
      if (variant === 2) return inBlast(r, c, { row, col });
      return r === row && c === col;
    });
  });
  return blocks.length ? { row, col, blockIds: blocks.map(b => b.id) } : null;
}

function foodFragment(block, cells, id) {
  const row = Math.min(...cells.map(cell => cell.row));
  const col = Math.min(...cells.map(cell => cell.col));
  const fragment = { ...structuredClone(block), id, row: block.row + row, col: block.col + col,
    len: Math.max(...cells.map(cell => cell.col)) - col + 1 };
  if (block.height !== undefined || block.cells)
    fragment.height = Math.max(...cells.map(cell => cell.row)) - row + 1;
  if (block.cells || cells.length !== fragment.len * (fragment.height ?? 1))
    fragment.cells = cells.map(cell => ({ row: cell.row - row, col: cell.col - col }));
  return fragment;
}

function cutBlast(state, ids, target) {
  const survivors = [], blocks = [];
  for (const b of state.blocks) {
    if (!ids.has(b.id)) { survivors.push(b); continue; }
    const removed = [], kept = [];
    for (const cell of cellsOf(b))
      (inBlast(b.row + cell.row, b.col + cell.col, target) ? removed : kept).push(cell);
    if (!kept.length) { blocks.push(structuredClone(b)); continue; }
    for (const group of connectedGroups(kept))
      survivors.push(foodFragment(b, group, takeNextId(state)));
    for (const [i, group] of connectedGroups(removed).entries())
      blocks.push(foodFragment(b, group, i === 0 ? b.id : takeNextId(state)));
  }
  state.blocks = survivors;
  return { blocks, displayBlocks: structuredClone([...survivors, ...blocks]) };
}

function splitFood(state, ids) {
  const splitBlocks = [];
  state.blocks = state.blocks.flatMap(b => {
    if (!ids.has(b.id)) return [b];
    const cells = cellsOf(b).slice().sort((a, b) => a.row - b.row || a.col - b.col);
    const middle = Math.floor(cells.length / 2);
    const pieces = [cells.slice(0, middle), cells.slice(middle)]
      .map(group => foodFragment(b, group, takeNextId(state)));
    splitBlocks.push(...pieces);
    return pieces;
  });
  return { blocks: [], splitBlocks: structuredClone(splitBlocks) };
}

export function applyJuniorPower(state, variant, target) {
  const ids = new Set(target.blockIds);
  const affected = state.blocks.filter(b => ids.has(b.id));
  let effect = { blocks: [] };
  if (variant === 0) {
    effect.blocks = structuredClone(affected);
    state.blocks = state.blocks.filter(b => !ids.has(b.id));
  } else if (variant === 1) {
    for (const b of affected) b.smile = Math.min(3, (b.smile ?? 1) + 1);
  } else if (variant === 2) effect = cutBlast(state, ids, target);
  else effect = splitFood(state, ids);
  state.juniorCollection[variant]--;
  return { variant, ...target, ...effect,
    rows: [...new Set((variant === 1 || variant === 3 ? affected : effect.blocks)
      .flatMap(b => cellsOf(b).map(cell => b.row + cell.row)))] };
}
