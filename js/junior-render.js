// Junior inventory and tool feedback. Target geometry is supplied by the engine.
import { W, CELL, BX, COLLECTION_SIZE, ADULT_LOOKS, C, FONT, juniorSlot } from './theme.js';
import { ctx, layout } from './canvas-layout.js';
import { rr, text, hoverOf } from './canvas-draw.js';
import { drawBuildingFace } from './block-render.js';
import { t } from './i18n.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function drawJuniorCollection(present) {
  const firstSlot = juniorSlot(0, layout.COLLECTION_Y);
  t('juniorTools').split('\n').forEach((line, i) =>
    text(line, firstSlot.x - 24, layout.COLLECTION_Y + firstSlot.size / 2 - 11 + i * 22,
      24, '#a493b0', 'right', 700));
  ADULT_LOOKS.forEach((_, variant) => {
    const { x, y, size } = juniorSlot(variant, layout.COLLECTION_Y);
    const count = present.juniorCollection?.[variant] ?? 0;
    if (!count) {
      ctx.fillStyle = '#48424e';
      rr(x, y, size, size, 12); ctx.fill();
      text('?', x + size / 2, y + size / 2, 34, '#a39aa9');
      return;
    }
    ctx.save();
    if (present.drag?.kind === 'junior' && present.drag.variant === variant) ctx.globalAlpha = 0.4;
    const scale = (present.juniorScales?.[variant] ?? 1) + hoverOf(present, 'junior:' + variant) * 0.06;
    ctx.translate(x + size / 2, y + size / 2); ctx.scale(scale, scale);
    ctx.translate(-size / 2, -size / 2);
    drawBuildingFace(0, 0, size, size, 3, 0, false, false, variant);
    if (count > 1) {
      const cx = size - 2, cy = 2, radius = 13;
      ctx.fillStyle = '#e53935';
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
      const label = String(count);
      ctx.font = `800 18px ${FONT}`;
      const fontSize = Math.min(18, 18 * (radius * 2 - 6) / ctx.measureText(label).width);
      text(label, cx, cy, fontSize, C.white);
    }
    ctx.restore();
  });
}

function drawJuniorRange(preview) {
  if (!preview) return;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 14]);
  ctx.lineCap = 'round';
  for (const band of preview.bands) {
    rr(BX + band.left * CELL + 2, layout.BY + band.row * CELL + 2,
      (band.right - band.left) * CELL - 4, (band.end - band.row) * CELL - 4, 14);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawJuniorTool(state, present) {
  if (present.menu || state.phase !== 'play' || state.playMode !== 'totem-building') return;
  const drag = present.drag?.kind === 'junior' ? present.drag : null;
  const variant = drag?.variant ?? (present.hoverKey?.startsWith('junior:')
    ? Number(present.hoverKey.split(':')[1]) : -1);
  if (variant < 0 || !present.juniorCollection[variant]) return;
  const paint = ADULT_LOOKS[variant];
  if (drag) {
    ctx.save();
    ctx.fillStyle = paint.fill;
    ctx.strokeStyle = paint.fill;
    ctx.lineWidth = 4;
    for (const { row, col, len } of drag.preview?.highlights ?? []) {
      const x = BX + col * CELL + 3;
      const y = layout.BY + row * CELL + 3;
      rr(x, y, len * CELL - 6, CELL - 6, 10);
      ctx.globalAlpha = 0.25; ctx.fill();
      ctx.globalAlpha = 1; ctx.stroke();
    }
    ctx.globalAlpha = drag.target ? 1 : 0.7;
    const size = COLLECTION_SIZE;
    drawBuildingFace(drag.x - size / 2, drag.y - size / 2, size, size, 3, 0, false, false, variant);
    ctx.restore();
    drawJuniorRange(drag.preview);
    if (drag.preview) return;
  }
  const w = 590, h = 104;
  const slot = juniorSlot(variant, layout.COLLECTION_Y);
  const x = clamp(slot.x + slot.size / 2 - w / 2, 16, W - w - 16);
  const y = clamp(slot.y - 12 - h, 12, layout.VH - h - 12);
  ctx.save();
  ctx.fillStyle = '#19131f'; ctx.strokeStyle = paint.fill; ctx.lineWidth = 2;
  rr(x, y, w, h, 14); ctx.fill(); ctx.stroke();
  text(t('juniorPower' + variant), x + w / 2, y + 23, 24, paint.fill, 'center', 800, 'middle', w - 24);
  text(t('juniorDesc' + variant), x + w / 2, y + 51, 24, C.white, 'center', 800, 'middle', w - 24);
  text(t('juniorUse'), x + w / 2, y + 80, 20, '#b8a8c4', 'center', 800, 'middle', w - 24);
  ctx.restore();
}
