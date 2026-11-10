// Presentation units and the mapping from block color-group IDs to paint.
import { COLS, ROWS } from './board.js';

export const W = 750, H = 1334;
export const CELL = 81, PAD = 3;
export const BX = (W - COLS * CELL) / 2;
export const BW = COLS * CELL, BH = ROWS * CELL;
export const COLORS = ['#f0912b', '#97b545', '#d24b2d', '#2f9b98', '#ffd570'];

export const C = {
  bg: '#2a2030', cell: '#2f2637', line: '#241c2a',
  muted: '#6c5c78', panel: '#1f1823', slot: '#272030', deco: '#3b3043',
  white: '#ffffff'
};
export const FONT = '"Avenir Next", "Exo 2", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
