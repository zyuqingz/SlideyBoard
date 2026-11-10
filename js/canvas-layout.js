// Browser viewport, safe-area layout and input coordinate conversion.
import { W, H, BH, C } from './theme.js';

const PANEL_H = 216, BOARD_GAP = 24, PREVIEW_TOP = 46;
export const GO_RESTART = { x: 215, y: 850, w: 320, h: 100 };
export const layout = {
  VH: H, OY: 0, BY: 0, HY: 0, SCORE_Y: 0, COMBO_Y: 0,
  PANEL: { x: 48, y: 0, w: 654, h: PANEL_H },
  PREV_Y: 0,
  MODE_BTN: { x: 52, y: 0, w: 80, h: 80 },
  PAUSE_BTN: { x: 617, y: 0, w: 80, h: 80 }
};

let canvas, safeProbe;
export let ctx, paintRevision = 0;
export function invalidateCanvas() { paintRevision++; }

function place(safeTop, safeBot) {
  const top = safeTop + 24;
  layout.HY = top + 40;
  layout.SCORE_Y = layout.HY + 50;
  layout.MODE_BTN.y = layout.HY - 40;
  layout.PAUSE_BTN.y = layout.HY - 40;
  const minBY = layout.HY + 150;
  const floorY = layout.VH - safeBot - 20 - PANEL_H;
  const maxBY = floorY - BOARD_GAP - BH;
  layout.BY = Math.round(minBY + Math.max(0, maxBY - minBY) * 0.82);
  const hugged = layout.BY + BH + BOARD_GAP;
  layout.PANEL.y = Math.max(layout.BY + BH + 16, Math.min(floorY, hugged));
  layout.PREV_Y = layout.PANEL.y + PREVIEW_TOP;
  layout.COMBO_Y = Math.round((layout.SCORE_Y + 32 + layout.BY) / 2);
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
  layout.VH = vw < vh ? Math.max(H, W * vh / vw) : H;
  layout.OY = (layout.VH - H) / 2;
  const s = Math.min(vw / W, vh / layout.VH);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = Math.floor(W * s), cssH = Math.floor(layout.VH * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  document.body.style.background = vw < vh ? C.bg : '';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / layout.VH, 0, 0);
  const cs = getComputedStyle(safeProbe);
  const k = layout.VH / Math.max(1, cssH);
  place((parseFloat(cs.paddingTop) || 0) * k, (parseFloat(cs.paddingBottom) || 0) * k);
  invalidateCanvas();
}

export function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * layout.VH / r.height };
}

export const toOverlay = p => ({ x: p.x, y: p.y - layout.OY });
export const hit = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
