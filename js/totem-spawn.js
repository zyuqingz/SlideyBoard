// Optional Totem drops for either board. Row previews remain owned by the mode.
import { COLS, ROWS, buildGrid, fitsSpan } from './board.js';

// Keep one totem in play (height 2 or 3), landing on the board's highest occupied row.
// If the sampled height cannot fit there, retry next turn rather than drop lower.
export function spawnTotem(state, random) {
  if (state.blocks.some(b => b.kind === 'totem')) return null;
  const height = 2 + Math.floor(random() * 2);
  const grid = buildGrid(state);
  const top = grid.findIndex(row => row.some(Boolean));
  const supportRow = top < 0 ? ROWS : top;
  if (supportRow - height < 1) return null;
  const columns = Array.from({ length: COLS }, (_, col) => col)
    .filter(col => (top < 0 || grid[top][col])
      && Array.from({ length: supportRow }, (_, row) => row)
        .every(row => fitsSpan(state, row, col, 1)));
  if (!columns.length) return null;
  const col = columns[Math.floor(random() * columns.length)];
  const highest = Math.min(0, ...state.blocks.map(b => b.row));
  const block = { id: state.nextId++, kind: 'totem', height, len: 1,
    col, row: highest - height, color: 4 };
  state.blocks.push(block);
  return block;
}
