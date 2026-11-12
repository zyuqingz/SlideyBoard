import { ctx } from './canvas-layout.js';
import { rr } from './canvas-draw.js';
import { ADULT_LOOKS } from './theme.js';

// One bold accessory per adult, contained inside its cell and above its eyes.
export function drawAdultAccessory(x, y, w, h, stage, variant) {
  const reveal = Math.max(0, Math.min(1, stage - 2));
  if (!reveal) return;
  const look = ADULT_LOOKS[variant] ?? ADULT_LOOKS[0];
  ctx.save();
  ctx.globalAlpha *= reveal;
  ctx.translate(x + w / 2, y + h * 0.13);
  const u = Math.min(w, h);
  ctx.scale(u / 75, u / 75);
  ctx.fillStyle = '#fff0b8';
  ctx.strokeStyle = look.ink; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  if (look.accessory === 'crown') {
    ctx.beginPath(); ctx.moveTo(-18, 7); ctx.lineTo(-21, -7);
    ctx.lineTo(-9, -1); ctx.lineTo(0, -11); ctx.lineTo(9, -1);
    ctx.lineTo(21, -7); ctx.lineTo(18, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (look.accessory === 'sprout') {
    ctx.fillStyle = '#477e55';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(side * 10, 0, 15, 7, side * -0.45, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#315c40'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 11); ctx.stroke();
  } else if (look.accessory === 'horns') {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 12, 7);
      ctx.quadraticCurveTo(side * 17, -3, side * 27, -10);
      ctx.lineTo(side * 28, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#9b4566';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(side * 21, -10);
      ctx.quadraticCurveTo(side * 27, 1, side * 21, 12); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#fff0b8'; rr(-6, -5, 12, 13, 4); ctx.fill();
  }
  ctx.restore();
}
