// Browser viewport, safe-area layout and input coordinate conversion.
import { W, H, BH, CELL, C, COLLECTION_SIZE, FACE_H, LEVEL_BAR_H, BOARD_OUTLINE_WIDTH } from './theme.js';

const PREVIEW_TOP = 24;
const PREVIEW_H = CELL / 2, PANEL_H = PREVIEW_TOP + PREVIEW_H + 6;
const COLLECTION_GAP = 16, COLLECTION_H = COLLECTION_SIZE + COLLECTION_GAP + 14;
const ICON_EDGE = 18;
const HUD_ICON_SIZE = 64;
// Previous 18px "BEST" was centered at ICON_EDGE+52; keep that label's left inset.
const BEST_LEFT = ICON_EDGE + 28;
export const GO_RESTART = { x: 215, y: 850, w: 320, h: 100 };
export const layout = {
  VH: H, VW: W, OY: 0, OX: 0, BY: 0, HY: 0, SCORE_Y: 0,
  MODE_Y: 0, COLLECTION_Y: 0,
  BEST_X: BEST_LEFT, BEST_Y: 0, BEST_SCORE_Y: 0,
  PANEL: { x: 48, y: 0, w: 654, h: PANEL_H },
  PREV_Y: 0, PREV_H: PREVIEW_H,
  SCORE_TEXT: { x: 185, y: 0, w: 380, h: 96 },
  PAUSE_BTN: { x: W - ICON_EDGE - 80, y: 0, w: 80, h: HUD_ICON_SIZE },
  POWER_BTN: { x: BEST_LEFT, y: 0, w: 132, h: 36 }
};

let canvas, safeProbe;
export let ctx, paintRevision = 0;
export function invalidateCanvas() { paintRevision++; }

function place(safeTop, safeBot) {
  const top = safeTop + 24;
  layout.HY = top + 40;
  layout.MODE_Y = layout.HY - 6;
  layout.SCORE_Y = layout.MODE_Y + 70;
  layout.SCORE_TEXT.y = layout.SCORE_Y - layout.SCORE_TEXT.h / 2;
  // BEST label shares the mode heading row; the best value stays under that label.
  layout.BEST_Y = layout.MODE_Y;
  layout.BEST_SCORE_Y = layout.BEST_Y + 32;
  layout.POWER_BTN.y = layout.BEST_SCORE_Y + 18;
  // Align Settings with the heading now that it is the only top-right icon.
  layout.PAUSE_BTN.y = layout.MODE_Y - 11;
  // Clear the score (including its impact scale) and optional Power control.
  const minBY = Math.max(layout.SCORE_Y + 60, layout.POWER_BTN.y + layout.POWER_BTN.h + 16,
    layout.PAUSE_BTN.y + layout.PAUSE_BTN.h + 16) + FACE_H + LEVEL_BAR_H;
  const floorY = layout.VH - safeBot - 20 - PANEL_H - COLLECTION_H;
  const maxBY = floorY - BH - BOARD_OUTLINE_WIDTH / 2;
  // Favor the upper space so the preview and Junior tools have breathing room below.
  layout.BY = Math.round(minBY + Math.max(0, maxBY - minBY) * 0.35);
  // Canvas strokes straddle the grid edge. Meet the outside of the board frame.
  layout.PANEL.y = layout.BY + BH + BOARD_OUTLINE_WIDTH / 2;
  layout.PREV_Y = layout.PANEL.y + PREVIEW_TOP;
  layout.COLLECTION_Y = layout.PANEL.y + PANEL_H + COLLECTION_GAP;
}

export function bindCanvas(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  safeProbe = document.createElement('div');
  safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(safeProbe);
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  document.fonts?.addEventListener('loadingdone', invalidateCanvas);
}

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const cs = getComputedStyle(safeProbe);
  const safeTop = parseFloat(cs.paddingTop) || 0;
  const safeBot = parseFloat(cs.paddingBottom) || 0;
  // Fit the complete layout inside the usable height, including on short screens.
  const s = Math.min(vw / W, Math.max(1, vh - safeTop - safeBot) / H);
  layout.VH = vh / s;
  layout.VW = vw / s;
  layout.OY = (layout.VH - H) / 2;
  layout.OX = (layout.VW - W) / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = Math.floor(vw), cssH = Math.floor(vh);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  document.body.style.background = C.bg;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / layout.VW, 0, 0, canvas.height / layout.VH,
    layout.OX * canvas.width / layout.VW, 0);
  const k = layout.VH / Math.max(1, cssH);
  place(safeTop * k, safeBot * k);
  invalidateCanvas();
}

export function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * layout.VW / r.width - layout.OX,
    y: (e.clientY - r.top) * layout.VH / r.height
  };
}

export const toOverlay = p => ({ x: p.x, y: p.y - layout.OY });
export const hit = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
