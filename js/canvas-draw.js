// Shared drawing primitives for the board/HUD and modal overlays.
import { ctx } from './canvas-layout.js';
import { FONT, CELL, PAD, C } from './theme.js';

export function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function text(str, x, y, size, color, align = 'center', weight = 800, base = 'middle', maxWidth) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (maxWidth === undefined) ctx.fillText(str, x, y);
  else ctx.fillText(str, x, y, maxWidth);
}

export function outlinedText(str, x, y, size, color, align = 'center', weight = 800, maxWidth) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = C.bg;
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.lineJoin = 'round';
  if (maxWidth === undefined) ctx.strokeText(str, x, y);
  else ctx.strokeText(str, x, y, maxWidth);
  text(str, x, y, size, color, align, weight, 'middle', maxWidth);
  ctx.restore();
}

export const hoverOf = (present, key) => present?.hoverAmt?.[key] ?? 0;

export function drawTile(x, y, w, h, paint, radius = 14) {
  const detail = Math.min(1, h / (CELL - 2 * PAD));
  const depth = 5 * detail, inset = 4 * detail;
  ctx.fillStyle = paint.shade;
  rr(x, y, w, h, radius); ctx.fill();
  ctx.fillStyle = paint.fill;
  rr(x, y, w, h - depth, radius); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 2 * detail;
  rr(x + inset, y + inset, w - 2 * inset, h - depth - 2 * inset, radius - inset); ctx.stroke();
}
