// Browser viewport, safe-area layout and input coordinate conversion.
import { W, H, BH, CELL, C } from './theme.js';

const PANEL_H = 124, BOARD_GAP = 24, PREVIEW_TOP = 48;
const ICON_EDGE = 18;
const HUD_ICON_SIZE = 64, HUD_GAP = 12;
export const GO_RESTART = { x: 215, y: 850, w: 320, h: 100 };
export const layout = {
  VH: H, OY: 0, BY: 0, HY: 0, SCORE_Y: 0, COMBO_Y: 0,
  LEVEL_X: ICON_EDGE + 52, LEVEL_Y: 0, MODE_Y: 0, SPIRIT_Y: 0,
  DROP_Y: 0,
  PANEL: { x: 48, y: 0, w: 654, h: PANEL_H },
  PREV_Y: 0, PREV_H: CELL / 2,
  MODE_BTN: { x: W - ICON_EDGE - 80, y: 0, w: 80, h: HUD_ICON_SIZE },
  PAUSE_BTN: { x: W - ICON_EDGE - 80, y: 0, w: 80, h: HUD_ICON_SIZE }
};

let canvas, safeProbe;
export let ctx, paintRevision = 0;
export function invalidateCanvas() { paintRevision++; }

function place(safeTop, safeBot) {
  const top = safeTop + 24;
  layout.HY = top + 40;
  layout.MODE_Y = layout.HY - 6;
  // Upper HUD slot (live total, or spirit in Totem Building). Lower slot is the swap.
  layout.SCORE_Y = layout.MODE_Y + 50;
  layout.SPIRIT_Y = layout.HY + 118;
  layout.LEVEL_Y = layout.MODE_Y + 50;
  // Align the icon stack's top with the 22px center heading, keeping equal gaps.
  const hudTop = layout.MODE_Y - 11;
  layout.MODE_BTN.y = hudTop;
  layout.PAUSE_BTN.y = layout.MODE_BTN.y + layout.MODE_BTN.h + HUD_GAP;
  // Reserve space under the lower HUD slot for hint/score FX.
  const hudBottom = layout.HY + 168;
  const minBY = hudBottom + 64;
  const floorY = layout.VH - safeBot - 20 - PANEL_H;
  const maxBY = floorY - BOARD_GAP - BH;
  layout.BY = Math.round(minBY + Math.max(0, maxBY - minBY) * 0.28);
  layout.DROP_Y = layout.BY - 28;
  const hugged = layout.BY + BH + BOARD_GAP;
  layout.PANEL.y = Math.max(layout.BY + BH + 16, Math.min(floorY, hugged));
  layout.PREV_Y = layout.PANEL.y + PREVIEW_TOP;
  layout.COMBO_Y = Math.round((hudBottom + layout.BY) / 2);
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
  layout.OY = (layout.VH - H) / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = Math.floor(W * s), cssH = Math.floor(layout.VH * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  document.body.style.background = vw < vh ? C.bg : '';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / layout.VH, 0, 0);
  const k = layout.VH / Math.max(1, cssH);
  place(safeTop * k, safeBot * k);
  invalidateCanvas();
}

export function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * layout.VH / r.height };
}

export const toOverlay = p => ({ x: p.x, y: p.y - layout.OY });
export const hit = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
