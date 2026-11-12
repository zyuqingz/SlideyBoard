// Board block and Junior sprites, shared with inventory and detached flights.
import { facesOf, isCarved } from './block-geometry.js';
import { W, CELL, PAD, BX, CARVED_PAINT, totemPaint } from './theme.js';
import { ctx, layout } from './canvas-layout.js';
import { rr, drawTile } from './canvas-draw.js';
import { drawFood, foodRadius } from './food-art.js';
import { drawAdultAccessory } from './creature-art.js';
import { isVisibleDanger } from './visible-danger.js';

const BLOCK_R = 14;
const CEILING_WARN = '#6b1218';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function drawPanicFace(sx, sy, w) {
  ctx.strokeStyle = '#583d37';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const eyeY = sy + 14;
  const lx = sx + w * 0.24, rx = sx + w * 0.76;
  ctx.beginPath();
  ctx.moveTo(lx - 4, eyeY - 5);
  ctx.lineTo(lx + 3, eyeY);
  ctx.lineTo(lx - 4, eyeY + 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx + 4, eyeY - 5);
  ctx.lineTo(rx - 3, eyeY);
  ctx.lineTo(rx + 4, eyeY + 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx + w * 0.32, sy + 30);
  ctx.lineTo(sx + w * 0.68, sy + 30);
  ctx.stroke();
}

function drawShockedMouth(x, y, w, ink = '#583d37') {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 30, 6, 8, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCeilingWarn(b, v, x, y, shape) {
  if (b.kind === 'totem') return;
  if (isCarved(b)) {
    for (const face of facesOf(b))
      drawCeilingWarn({ id: b.id, kind: 'face', row: b.row + face.row, col: b.col, len: 1, height: 1 },
        { ...v, vx: v.vx + face.col, vy: v.vy + face.row },
        x + face.col * CELL, y + face.row * CELL, shape);
    return;
  }
  if (!shape || b.row <= 0 || v.vy !== b.row || v.clearing) return;
  const { left, right } = shape.rows[b.row - 1];
  ctx.strokeStyle = CEILING_WARN;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let run = 0;
  const flush = start => {
    if (run <= 0) return;
    ctx.lineWidth = 4;
    const rx = x + (start - v.vx) * CELL;
    const w = run * CELL - 2 * PAD, h = CELL - 2 * PAD;
    rr(rx, y, w, h, BLOCK_R); ctx.stroke();
    ctx.lineWidth = 6;
    for (let c = start; c < start + run; c++) {
      const ax = x - PAD + (c - v.vx + 0.5) * CELL;
      const ay = y - PAD + 14;
      ctx.beginPath(); ctx.moveTo(ax - 13, ay + 10); ctx.lineTo(ax, ay);
      ctx.lineTo(ax + 13, ay + 10); ctx.stroke();
    }
    run = 0;
  };
  for (let i = 0; i < b.len; i++) {
    const c = v.vx + i;
    if (c + 0.5 >= left && c + 0.5 < right) { flush(v.vx + i - run); continue; }
    run++;
  }
  flush(v.vx + b.len - run);
}

function totemGrow(stage) {
  const s = clamp(stage, 1, 3);
  const t1 = 0.52, t2 = 0.8;
  if (s <= 2) return t1 + (s - 1) * (t2 - t1);
  return t2 + (s - 2) * (1 - t2);
}

export function drawBuildingFace(x, y, w, h, stage, pulse, panic, shocked, variant) {
  const paint = totemPaint(stage, variant);
  const grow = totemGrow(stage);
  const bodyH = h * grow;
  const bodyY = y + h - bodyH;
  if (grow < 1) {
    // Outline the occupied cell so a stack has visible support around a baby.
    ctx.save();
    ctx.globalAlpha *= Math.min(1, (1 - grow) / 0.12);
    ctx.strokeStyle = '#b59679';
    ctx.lineWidth = 3;
    rr(x + 1.5, y + 1.5, w - 3, h - 3, BLOCK_R); ctx.stroke();
    ctx.restore();
  }
  drawTile(x, bodyY, w, bodyH, paint);
  const happy = clamp(stage - 2, 0, 1);
  const smile = clamp(stage - 1, 0, 1);
  const faceY = bodyY + 14 * happy;
  drawAdultAccessory(x, bodyY, w, bodyH, stage, variant);
  ctx.strokeStyle = paint.ink;
  ctx.lineCap = 'round';
  if (panic) drawPanicFace(x, faceY + 2, w);
  else {
    ctx.lineWidth = 5;
    for (const cx of [x + w * 0.24, x + w * 0.76]) {
      ctx.beginPath();
      ctx.moveTo(cx - 5 * happy, faceY + 14);
      ctx.quadraticCurveTo(cx, faceY + 14 - 9 * happy, cx + 5 * happy, faceY + 19 - 5 * happy);
      ctx.stroke();
    }
    if (shocked) drawShockedMouth(x, faceY, w, paint.ink);
    else {
      ctx.lineWidth = 4;
      const halfMouth = w * (0.13 + 0.05 * smile + 0.03 * happy);
      const mouthY = faceY + 30 - 3 * happy;
      ctx.beginPath();
      ctx.moveTo(x + w / 2 - halfMouth, mouthY);
      ctx.quadraticCurveTo(x + w / 2, mouthY + 14 * smile + 7 * happy,
        x + w / 2 + halfMouth, mouthY);
      ctx.stroke();
    }
  }
  if (pulse > 0) {
    ctx.strokeStyle = `rgba(255,250,220,${0.85 * pulse})`;
    ctx.lineWidth = 2 + 2 * pulse;
    rr(x + 2, bodyY + 2, w - 4, bodyH - 4, BLOCK_R - 1); ctx.stroke();
  }
}

export function drawBlock(b, v, hover = 0, shape = null, now = 0, building = false, held = false) {
  if (v.s <= 0) return;
  const x = BX + v.vx * CELL + PAD, y = layout.BY + v.vy * CELL + PAD;
  const w = b.len * CELL - 2 * PAD, h = (b.height ?? 1) * CELL - 2 * PAD;
  const pop = v.collecting ? 0 : Math.max(v.slot, hover);
  const scale = v.s * (1 + 0.07 * pop);
  const dangerShake = isVisibleDanger(b, v) && v.vy === b.row && !v.evolve;
  const panic = b.kind === 'totem' && dangerShake;
  const shocked = held && b.kind === 'totem' && !panic;
  ctx.save();
  if (b.kind === 'totem' && !v.flight) {
    // Incoming faces emerge below the bar, including during hover/scale transforms.
    ctx.beginPath();
    ctx.rect(0, layout.BY, W, layout.VH - layout.BY);
    ctx.clip();
  }
  if (v.flight) {
    ctx.globalAlpha *= v.flight.alpha;
    ctx.translate(x + w / 2 + v.flight.x, y + h / 2 + v.flight.y);
    ctx.rotate(v.flight.rotation);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  if (dangerShake) ctx.translate(Math.sin(now / 55) * 6, 0);
  if (scale !== 1) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  if (v.sq && (!v.clearing || v.collecting)) {
    const sx = 1 + v.sq * 0.6 / b.len, sy = 1 - v.sq;
    ctx.translate(x + w / 2, y + h); ctx.scale(sx, sy); ctx.translate(-(x + w / 2), -(y + h));
  }
  const faces = facesOf(b);
  const cellH = CELL - 2 * PAD;
  const faceW = CELL - 2 * PAD;
  if (isCarved(b) && faces.length > 1) {
    ctx.fillStyle = CARVED_PAINT.shade;
    for (const a of faces) for (const n of faces) {
      if (a.row === n.row && n.col === a.col + 1) {
        const sx = x + a.col * CELL + faceW * 0.55;
        const sy = y + a.row * CELL + cellH * 0.22;
        rr(sx, sy, CELL * 0.7, cellH * 0.56, 8); ctx.fill();
      }
      if (a.col === n.col && n.row === a.row + 1) {
        const sx = x + a.col * CELL + faceW * 0.22;
        const sy = y + a.row * CELL + cellH * 0.55;
        rr(sx, sy, faceW * 0.56, CELL * 0.7, 8); ctx.fill();
      }
    }
  }
  for (const face of faces) {
    const sx = x + face.col * CELL, sy = y + face.row * CELL;
    const w = face.len * CELL - 2 * PAD;
    if (building && b.kind === 'totem') {
      drawBuildingFace(sx, sy, w, cellH, v.expression ?? b.smile ?? 1, v.evolve ?? 0, panic, shocked, v.adultVariant);
    } else if (isCarved(b)) drawTile(sx, sy, w, cellH, CARVED_PAINT);
    else drawFood(sx, sy, w, cellH, b.color);
    if (isCarved(b) && !(building && b.kind === 'totem')) {
      const topRow = Math.min(...faces.map(f => f.row));
      if (panic && face.row === topRow) drawPanicFace(sx, sy, w);
      else {
        ctx.fillStyle = '#583d37';
        rr(sx + w * 0.16, sy + 12, 9, 10, 3); ctx.fill();
        rr(sx + w * 0.71, sy + 12, 9, 10, 3); ctx.fill();
        const smile = b.smile ?? (b.face === 'smile' ? 2 : 1);
        if (shocked) drawShockedMouth(sx, sy, w);
        else if (smile >= 2) {
          ctx.strokeStyle = '#583d37';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          const r = smile >= 3 ? w * 0.22 : w * 0.16;
          const y = smile >= 3 ? 24 : 26;
          ctx.arc(sx + w * 0.5, sy + y, r, 0.12 * Math.PI, 0.88 * Math.PI);
          ctx.stroke();
        } else {
          rr(sx + w * 0.32, sy + 28, w * 0.36, 6, 3); ctx.fill();
        }
      }
    }
    const grow = building && b.kind === 'totem' ? totemGrow(v.expression ?? b.smile ?? 1) : 1;
    const tileH = cellH * grow;
    const tileY = sy + cellH - tileH;
    const radius = isCarved(b) || b.kind === 'totem' ? BLOCK_R : foodRadius(b.color);
    if (v.land > 0 && !v.clearing) {
      ctx.strokeStyle = `rgba(255,250,225,${0.65 * v.land * v.land})`;
      ctx.lineWidth = 2;
      rr(sx + 2, tileY + 2, w - 4, tileH - 4, radius - 1); ctx.stroke();
    }
    if (v.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, 0.85 * v.flash)})`;
      rr(sx, tileY, w, tileH, radius); ctx.fill();
    }
    if (v.danger > 0 && !panic) {
      ctx.fillStyle = `rgba(40,0,10,${0.45 * v.danger})`;
      rr(sx, tileY, w, tileH, radius); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,70,${v.danger})`; ctx.lineWidth = 4;
      rr(sx + 2, tileY + 2, w - 4, tileH - 4, radius - 1); ctx.stroke();
    }
  }
  drawCeilingWarn(b, v, x, y, shape);
  ctx.restore();
}
