// Shared Hard row geometry for every mode, scaled to its incoming row span.
import { COLS, COLOR_GROUPS } from './board.js';

export function normalizeDifficulty(value) {
  return value === 'hard' ? 'hard' : 'normal';
}

function weightedIndex(random, weights) {
  let remaining = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < weights.length; i++) {
    if (remaining < weights[i]) return i;
    remaining -= weights[i];
  }
  return weights.length - 1;
}

export function generateHardRow(level, random, left = 0, right = COLS) {
  const offset = Math.max(0, Math.min(10, level - 1));
  const gapCount = Math.min(right - left - 1,
    weightedIndex(random, [65 + offset * 2, 35]) + 1);
  // A contiguous gap leaves room for long blocks. Avoid forced one-cell runs
  // beside it whenever the span permits, rather than merely downweighting 1s.
  const starts = Array.from({ length: right - left - gapCount + 1 }, (_, i) => left + i);
  const preferred = starts.filter(col => col - left !== 1 && right - col - gapCount !== 1);
  const pool = preferred.length ? preferred : starts;
  const gapStart = pool[Math.floor(random() * pool.length)];
  const row = [];
  for (const [start, end] of [[left, gapStart], [gapStart + gapCount, right]]) {
    let col = start, previousColor = -1;
    while (col < end) {
      const run = end - col;
      const weights = [3, 32, 36 + offset, 29 + offset * 2].slice(0, Math.min(4, run));
      // Don't choose a long block that unnecessarily leaves a singleton behind.
      if (run > 2 && run <= 5) weights[run - 2] = 0;
      const len = weightedIndex(random, weights) + 1;
      let color = Math.floor(random() * (COLOR_GROUPS - (previousColor < 0 ? 0 : 1)));
      if (previousColor >= 0 && color >= previousColor) color++;
      row.push({ col, len, color });
      col += len;
      previousColor = color;
    }
  }
  return row;
}
