// Presentation units and the mapping from block color-group IDs to paint.
import { COLS, ROWS } from './board.js';

export const W = 750, H = 1334;
export const CELL = 81, PAD = 3;
export const BX = (W - COLS * CELL) / 2;
export const BW = COLS * CELL, BH = ROWS * CELL;
export const COLORS = ['#f0912b', '#97b545', '#d24b2d', '#2f9b98', '#ffd570'];
export const BLOCK_PALETTE = COLORS.map((fill, i) => ({
  fill, shade: ['#ad6025', '#647d32', '#933728', '#256c6b', '#bd9546'][i]
}));
export const CARVED_PAINT = { fill: '#e9ba78', shade: '#c48a4a' };

// Sand → jade → gold. Fractional stages blend during the clear reaction.
const TOTEM_PALETTE = [
  { fill: '#dcb991', shade: '#a47b58', ink: '#584033' },
  { fill: '#91d6bd', shade: '#4b9989', ink: '#254f49' },
  { fill: '#ffdb79', shade: '#ca9847', ink: '#66451f' }
];
export function totemPaint(stage = 1) {
  const index = Math.max(0, Math.min(2, stage - 1));
  const from = TOTEM_PALETTE[Math.floor(index)], to = TOTEM_PALETTE[Math.ceil(index)];
  const p = index % 1;
  const mix = key => {
    const a = parseInt(from[key].slice(1), 16), b = parseInt(to[key].slice(1), 16);
    const channels = [16, 8, 0].map(shift =>
      Math.round(((a >> shift) & 255) * (1 - p) + ((b >> shift) & 255) * p));
    return `rgb(${channels.join(',')})`;
  };
  return { fill: mix('fill'), shade: mix('shade'), ink: mix('ink') };
}

export const C = {
  bg: '#2a2030', cell: '#2f2637', line: '#241c2a',
  muted: '#6c5c78', panel: '#1f1823', slot: '#272030', deco: '#3b3043',
  white: '#ffffff'
};
export const FONT = '"Avenir Next", "Exo 2", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
