// Totem spawning is independent of Classic's horizontal-only preview search.
import { COLS, ROWS } from './board.js';
import { generateRowCandidate } from './spawn.js';
import { totemGrid } from './totem-board.js';

export function generateTotemNextRow(state, random) {
  return generateRowCandidate(state.level, random);
}

// Keep one totem in play (height 2 or 3), landing on the board's highest occupied row.
// If the sampled height cannot fit there, retry next turn rather than drop lower.
export function spawnTotem(state, random) {
  if (state.blocks.some(b => b.kind === 'totem')) return null;
  const height = 2 + Math.floor(random() * 2);
  const grid = totemGrid(state);
  const top = grid.findIndex(row => row.some(Boolean));
  const supportRow = top < 0 ? ROWS : top;
  if (supportRow - height < 1) return null;
  const columns = Array.from({ length: COLS }, (_, col) => col)
    .filter(col => top < 0 || grid[top][col]);
  const col = columns[Math.floor(random() * columns.length)];
  const highest = Math.min(0, ...state.blocks.map(b => b.row));
  const block = { id: state.nextId++, kind: 'totem', height, len: 1,
    col, row: highest - height, color: 4 };
  state.blocks.push(block);
  return block;
}

// Choose distinct occupied rows uniformly, so a blast never wastes power on air.
export function chooseTotemRows(state, height, random) {
  const pool = totemGrid(state).flatMap((row, i) => row.some(Boolean) ? [i] : []);
  const rows = [];
  while (rows.length < height && pool.length)
    rows.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return rows.sort((a, b) => a - b);
}
