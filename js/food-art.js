// Large, sparse food details preserve the silhouette of each sliding piece.
import { ctx } from './canvas-layout.js';
import { rr, drawTile } from './canvas-draw.js';
import { BLOCK_PALETTE } from './theme.js';

export const foodRadius = color => [20, 26, 22, 26, 14][color] ?? 20;

export function drawFood(x, y, w, h, color) {
  const radius = Math.min(foodRadius(color), h * 0.36);
  drawTile(x, y, w, h, BLOCK_PALETTE[color], radius);
  ctx.save();
  const inset = Math.min(1, h / 75);
  rr(x + 5 * inset, y + 4 * inset, w - 10 * inset, h - 10 * inset,
    Math.max(2, radius - 4 * inset)); ctx.clip();
  ctx.lineCap = 'round';
  // A few broad marks, even on a long piece; previews use the same motifs.
  const count = Math.min(4, Math.max(1, Math.round(w / 76)));
  const unit = Math.min(h, 75, w / count);
  for (let i = 0; i < count; i++) {
    const cx = x + w * (i + 0.5) / count, cy = y + h * 0.46;
    if (color === 0) { // Bread: three soft diagonal scoring marks.
      ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = unit * 0.09;
      for (const offset of [-0.19, 0, 0.19]) {
        ctx.beginPath();
        ctx.moveTo(cx + unit * (offset - 0.055), cy + unit * 0.15);
        ctx.lineTo(cx + unit * (offset + 0.055), cy - unit * 0.15);
        ctx.stroke();
      }
    } else if (color === 1) { // Kiwi: a cream core surrounded by small dark seeds in green flesh.
      ctx.fillStyle = '#e8e5ad';
      ctx.beginPath(); ctx.ellipse(cx, cy, unit * 0.105, unit * 0.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#514735';
      for (let seed = 0; seed < 8; seed++) {
        const angle = (seed + 0.5) * Math.PI * 2 / 8;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
        ctx.beginPath(); ctx.ellipse(0, -unit * 0.235, unit * 0.025, unit * 0.045, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    } else if (color === 2) { // Watermelon: pointed seeds above one continuous rind.
      ctx.fillStyle = '#623e35';
      for (const [dx, dy] of [[-0.22, -0.09], [0, 0.035], [0.22, -0.09]]) {
        ctx.save(); ctx.translate(cx + unit * dx, cy + unit * dy); ctx.rotate(-dx * 1.5);
        ctx.beginPath(); ctx.moveTo(0, -unit * 0.085);
        ctx.bezierCurveTo(unit * 0.085, unit * 0.025, unit * 0.055, unit * 0.09, 0, unit * 0.09);
        ctx.bezierCurveTo(-unit * 0.055, unit * 0.09, -unit * 0.085, unit * 0.025, 0, -unit * 0.085); ctx.fill();
        ctx.restore();
      }
    } else if (color === 3) { // Blueberry: a five-point blossom scar directly on the blue skin.
      ctx.fillStyle = '#465586';
      ctx.beginPath();
      for (let step = 0; step < 10; step++) {
        const angle = -Math.PI / 2 + step * Math.PI / 5;
        const r = unit * (step % 2 ? 0.105 : 0.22);
        const px = cx + Math.cos(angle) * r, py = cy + Math.sin(angle) * r;
        if (step === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#303e68';
      ctx.beginPath(); ctx.arc(cx, cy, unit * 0.065, 0, Math.PI * 2); ctx.fill();
    } else { // Cheese: three unmistakable, generously sized holes.
      ctx.fillStyle = '#cc963e';
      for (const [dx, dy, r] of [[-0.2, -0.1, 0.09], [0.17, -0.12, 0.065], [0.07, 0.17, 0.1]]) {
        ctx.beginPath(); ctx.arc(cx + unit * dx, cy + unit * dy, unit * r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (color === 2) {
    ctx.fillStyle = '#aed17c'; ctx.fillRect(x, y + h * 0.73, w, h * 0.1);
    ctx.fillStyle = '#638e51'; ctx.fillRect(x, y + h * 0.83, w, h * 0.15);
  }
  ctx.restore();
}
