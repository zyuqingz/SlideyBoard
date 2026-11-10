// Shaped row insertion trims edges; all collision and clearing rules are shared.
import { ROWS, rowSpan, settleBoard } from './board.js';
import { cellsOf } from './block-geometry.js';

// Caller must resolve top-out first. Return pre-trim geometry and discarded cells
// as facts for presentation; only survivors enter the authoritative board.
export function insertShapedRow(state, row) {
  if (state.blocks.some(b => b.row <= 0)) throw new Error('Cannot rise past the top');
  const blocks = state.blocks.map(b => ({ ...b, row: b.row - 1 }));
  const fresh = row.map(spec => ({ ...spec, id: state.nextId++, row: ROWS - 1 }));
  const trimmed = [], survivors = [];
  for (const b of blocks) {
    if (b.kind === 'totem') {
      const kept = [];
      for (const cell of cellsOf(b)) {
        const { left, right } = rowSpan(state, b.row + cell.row);
        if (b.col + cell.col >= left && b.col + cell.col < right) kept.push(cell);
        else trimmed.push({ id: b.id, kind: b.kind, color: b.color,
          row: b.row + cell.row, col: b.col + cell.col, len: 1, height: 1 });
      }
      if (!kept.length) continue;
      // Rebase the surviving footprint without moving or regrowing its cells.
      const top = Math.min(...kept.map(cell => cell.row));
      const left = Math.min(...kept.map(cell => cell.col));
      survivors.push({ ...b, row: b.row + top, col: b.col + left,
        height: Math.max(...kept.map(cell => cell.row)) - top + 1,
        len: Math.max(...kept.map(cell => cell.col)) - left + 1,
        cells: kept.map(cell => ({ row: cell.row - top, col: cell.col - left })) });
      continue;
    }
    const { left, right } = state.shape.rows[b.row];
    const start = Math.max(b.col, left), end = Math.min(b.col + b.len, right);
    if (end <= start) {
      trimmed.push({ ...b });
      continue;
    }
    if (start > b.col) trimmed.push({ ...b, len: start - b.col });
    if (end < b.col + b.len) trimmed.push({ ...b, col: end, len: b.col + b.len - end });
    survivors.push({ ...b, col: start, len: end - start });
  }
  state.blocks = [...survivors, ...fresh];
  return { blocks: [...blocks, ...fresh], trimmed };
}

// Search and opening setup use exactly the live mode's gravity/clear rules.
export function settleShapedBoard(state, onStep = () => {}) {
  let cells = 0, lines = 0;
  settleBoard(state, (type, data) => {
    if (type === 'clear') {
      cells += data.blocks.reduce((sum, b) => sum + cellsOf(b).length, 0);
      lines += data.rows.length;
    }
    onStep(type, data);
  });
  return { cells, lines };
}
