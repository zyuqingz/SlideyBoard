// Presentation units and the mapping from block color-group IDs to paint.
import { COLS, ROWS } from './board.js';

export const W = 750, H = 1334;
export const CELL = 81, PAD = 3;
export const BX = (W - COLS * CELL) / 2;
export const BW = COLS * CELL, BH = ROWS * CELL;
export const BOARD_OUTLINE_WIDTH = 24;
export const LEVEL_BAR_H = 14;
export const FACE_H = 80;
export const COLLECTION_SIZE = CELL - 2 * PAD;
export const JUNIOR_DRAG_LIFT = COLLECTION_SIZE / 2 + 18;
export function juniorSlot(variant, y) {
  const gap = 18, size = COLLECTION_SIZE;
  const start = (W - ADULT_LOOKS.length * size - (ADULT_LOOKS.length - 1) * gap) / 2;
  return { x: start + variant * (size + gap), y, size };
}
export const COLORS = ['#f0912b', '#97b545', '#d24b2d', '#758fc5', '#ffd570'];
export const BLOCK_PALETTE = COLORS.map((fill, i) => ({
  fill, shade: ['#ad6025', '#647d32', '#933728', '#4a6093', '#bd9546'][i]
}));
export const CARVED_PAINT = { fill: '#e9ba78', shade: '#c48a4a' };

// Juniors keep their warm baby color. Only adulthood reveals a new look.
const JUNIOR_PAINT = { fill: '#dcb991', shade: '#a47b58', ink: '#584033' };
export const ADULT_LOOKS = [
  { fill: '#ffdb79', shade: '#ca9847', ink: '#66451f', accessory: 'crown' },
  { fill: '#91d6bd', shade: '#4b9989', ink: '#254f49', accessory: 'sprout' },
  { fill: '#c5a0dc', shade: '#8c65a7', ink: '#4e365f', accessory: 'horns' },
  { fill: '#ed9caa', shade: '#b9677c', ink: '#683d4b', accessory: 'bow' }
];
export function totemPaint(stage = 1, variant = 0) {
  const from = JUNIOR_PAINT, to = ADULT_LOOKS[variant] ?? ADULT_LOOKS[0];
  const p = Math.max(0, Math.min(1, stage - 2));
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
