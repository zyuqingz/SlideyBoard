// Board, HUD and effects drawing. Reads state. Does not change the board.

import { COLS, ROWS } from './board.js';
import { facesOf, isCarved } from './block-geometry.js';
import { W, CELL, PAD, BX, BW, BH, LEVEL_BAR_H, FACE_H, CARVED_PAINT, C, FONT, totemPaint, ADULT_LOOKS, juniorSlot } from './theme.js';
import { Ease } from './fx.js';
import { t } from './i18n.js';
import { ctx, layout, paintRevision, invalidateCanvas } from './canvas-layout.js';
import { rr, text, outlinedText, hoverOf, drawTile } from './canvas-draw.js';
import { drawFood, foodRadius } from './food-art.js';
import { drawAdultAccessory } from './creature-art.js';
import { drawOverlays } from './overlay-render.js';
import { monsterGeometry } from './monster.js';

const PANEL_R = 20;
const BLOCK_R = 14;
// Intervals inside the next-row panel, measured from the panel top.
const NEXT_SIZE = 16;
const NEXT_BASELINE = 26;

const DECO = [
  [737, .14, 10], [148, .22, 9], [710, .25, 9], [277, .78, 8], [501, .77, 8],
  [745, .80, 9], [78, .95, 8], [24, .48, 8], [728, .59, 7], [18, .31, 6], [380, .99, 7]
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loadIcon(src) {
  const img = new Image();
  const state = { img, ready: false };
  img.onload = () => { state.ready = true; invalidateCanvas(); };
  img.src = src;
  return state;
}

// Phosphor fill icons from assets/, recolored to muted UI purple.
const modeIcon = loadIcon('assets/game-controller-fill.svg');
const gearIcon = loadIcon('assets/gear-fill.svg');

function drawIcon(icon, cx, cy, size = 50, light = 0) {
  if (!icon.ready) return;
  ctx.save();
  if (light > 0) ctx.filter = `brightness(${1 + 2.2 * light}) saturate(${1 - light})`;
  ctx.drawImage(icon.img, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

const CEILING_WARN = '#6b1218';

function hitsDeathCeiling(b) {
  for (const face of facesOf(b)) {
    const row = b.row + face.row;
    // Row 1 is one rise from top-out; row 0 is the rescue/death row.
    if (row === 0 || row === 1) return true;
  }
  return false;
}

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

function drawBuildingFace(x, y, w, h, stage, pulse, panic, shocked, variant) {
  const paint = totemPaint(stage, variant);
  const grow = totemGrow(stage);
  const bodyH = h * grow;
  const bodyY = y + h - bodyH;
  if (grow < 1) {
    // Outline the occupied cell so a stack has visible support even around a baby.
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

function drawBlock(b, v, hover = 0, shape = null, now = 0, building = false, held = false) {
  if (v.s <= 0) return;
  const x = BX + v.vx * CELL + PAD, y = layout.BY + v.vy * CELL + PAD;
  const w = b.len * CELL - 2 * PAD, h = (b.height ?? 1) * CELL - 2 * PAD;
  const pop = v.collecting ? 0 : Math.max(v.slot, hover);
  const scale = v.s * (1 + 0.07 * pop);
  const dangerShake = hitsDeathCeiling(b) && v.vy === b.row && !v.clearing && !v.evolve;
  const panic = b.kind === 'totem' && dangerShake;
  const shocked = held && b.kind === 'totem' && !panic;
  ctx.save();
  if (b.kind === 'totem' && !v.flight) {
    // Apply before hover/scale transforms as well: incoming faces only emerge
    // below the board edge, never through the bar or its rounded corners.
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
  // Each face uses exactly the same cell bounds and gaps as a normal block.
  // Apply highlights per cell too, so animation never draws an outer container.
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

let digitWidth, digitRevision = -1;
function hudSlots() {
  return {
    scoreY: layout.SCORE_Y,
    bestX: layout.BEST_X,
    bestY: layout.BEST_Y,
    bestScoreY: layout.BEST_SCORE_Y
  };
}

function drawScore(present, scoreY) {
  ctx.save();
  ctx.translate(W / 2, scoreY);
  ctx.font = `800 76px ${FONT}`;
  if (digitRevision !== paintRevision) {
    digitWidth = Math.max(...[...'0123456789'].map(d => ctx.measureText(d).width));
    digitRevision = paintRevision;
  }
  const cellW = digitWidth;
  const digits = String(present.displayScore).length;
  const fit = Math.min(1, 420 / (digits * cellW * 1.28));
  ctx.scale(present.scoreScale * fit, present.scoreScale * fit);
  [...String(present.displayScore)].forEach((digit, i) => {
    text(digit, (i - (digits - 1) / 2) * cellW, 0, 76, '#a493b0');
  });
  ctx.restore();
}

function drawScorePopup(now, fx) {
  const age = Math.max(0, now - fx.t0);
  const x = fx.origin?.x ?? W / 2;
  const y = fx.origin?.y ?? layout.BY + CELL / 2 + 12;
  const scale = Ease.outBack(clamp(age / 220, 0, 1)) * (1 - Ease.in(fx.exit ?? 0));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.translate(x, y); ctx.scale(scale, scale);
  outlinedText('+' + fx.pts, 0, 0, 48, C.white);
  ctx.restore();
}

function drawLevelBar(state, present) {
  const { left, right } = state.shape?.rows[0] ?? { left: 0, right: COLS };
  const available = (right - left) * CELL;
  const y = layout.BY - FACE_H - LEVEL_BAR_H;
  const progress = clamp(present.displayProgress ?? state.levelProgress ?? 0, 0, 1);
  const label = state.playMode === 'totem-building' ? t('nextJunior') : t('nextMeal');
  ctx.font = `800 18px ${FONT}`;
  const labelWidth = Math.min(ctx.measureText(label).width, available * 0.42);
  const labelSize = 18 * labelWidth / ctx.measureText(label).width;
  const gap = 14, w = available - labelWidth - gap;
  const start = BX + left * CELL;
  const x = start + labelWidth + gap;
  outlinedText(label, start, y + LEVEL_BAR_H / 2, labelSize, '#d6c7df', 'left', 800);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  rr(x, y, w, LEVEL_BAR_H, 6); ctx.clip();
  ctx.fillStyle = '#43374c';
  ctx.fillRect(x, y, w, LEVEL_BAR_H);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w * progress, LEVEL_BAR_H); ctx.clip();
  ctx.fillStyle = '#e9ba78';
  ctx.fillRect(x, y, w, LEVEL_BAR_H);
  ctx.restore();
  const pulse = ((present.levelScale ?? 1) - 1) / 0.12;
  if (pulse > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 * pulse})`;
    ctx.fillRect(x, y, w, LEVEL_BAR_H);
  }
  ctx.restore();
  ctx.strokeStyle = '#a493b0'; ctx.lineWidth = 2;
  rr(x, y, w, LEVEL_BAR_H, 6); ctx.stroke();
}

function drawJuniorCollection(present) {
  ADULT_LOOKS.forEach((_, variant) => {
    const { x, y, size } = juniorSlot(variant, layout.COLLECTION_Y);
    const count = present.juniorCollection?.[variant] ?? 0;
    if (!count) {
      ctx.fillStyle = '#48424e';
      rr(x, y, size, size, 12); ctx.fill();
      text('?', x + size / 2, y + size / 2, 28, '#a39aa9');
      return;
    }
    // Reuse the grown junior's board sprite, including its identifying accessory.
    ctx.save();
    const scale = present.juniorScales?.[variant] ?? 1;
    ctx.translate(x + size / 2, y + size / 2); ctx.scale(scale, scale);
    ctx.translate(-size / 2, -size / 2);
    drawBuildingFace(0, 0, size, size, 3, 0, false, false, variant);
    if (count > 1) {
      const cx = size - 2, cy = 2, radius = 13;
      ctx.fillStyle = '#e53935';
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
      const label = String(count);
      ctx.font = `800 15px ${FONT}`;
      const fontSize = Math.min(15, 15 * (radius * 2 - 6) / ctx.measureText(label).width);
      text(label, cx, cy, fontSize, C.white);
    }
    ctx.restore();
  });
}

function drawPlayerFace(state, present, warning, now) {
  const { x, w, eyes, eyeY } = monsterGeometry(state, layout.BY);
  const y = layout.BY, monster = present.monster;
  const dead = monster.dead || state.phase === 'over';
  const panic = dead ? 0 : monster.panic;
  const smile = dead ? 0 : monster.smile * (1 - panic);
  // Celebrations only change the eyes. Retain the subtle nervous panic wave.
  const lipY = px => y + panic * 2 * Math.sin((px - x) / 15 + now / 65);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#392934';
  rr(x - 8, y - 64, w + 16, 77, 29); ctx.fill();
  ctx.fillStyle = '#614451';
  rr(x - 5, y - 66, w + 10, 73, 28); ctx.fill();
  eyes.forEach((eyeX, i) => {
    const side = i === 0 ? -1 : 1;
    const eyeH = 40 + panic * 5 - smile * 4;
    ctx.fillStyle = '#48313f';
    rr(eyeX - 21, eyeY - eyeH / 2 - 2, 42, eyeH + 6, 19); ctx.fill();
    ctx.fillStyle = '#f4e4c8';
    rr(eyeX - 18, eyeY - eyeH / 2, 36, eyeH, 16); ctx.fill();
    ctx.save(); ctx.clip();
    if (dead) {
      ctx.strokeStyle = '#e65b59'; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(eyeX - 9, eyeY - 10); ctx.lineTo(eyeX + 9, eyeY + 10);
      ctx.moveTo(eyeX + 9, eyeY - 10); ctx.lineTo(eyeX - 9, eyeY + 10);
      ctx.stroke();
    } else if (smile) {
      ctx.strokeStyle = '#302330'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(eyeX - 9, eyeY + 5);
      ctx.bezierCurveTo(eyeX - 9, eyeY - 9, eyeX + 9, eyeY - 9, eyeX + 9, eyeY + 5);
      ctx.stroke();
    } else {
      const gaze = monster.eyes[i];
      const irisW = 14 - panic * 4, irisH = 21 - panic * 6;
      const ix = eyeX + gaze.x, iy = eyeY + gaze.y;
      ctx.fillStyle = '#302330';
      rr(ix - irisW / 2, iy - irisH / 2, irisW, irisH, 7); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#a66f7e';
    rr(eyeX + side * 36 - 15, y - 22, 30, 9, 6); ctx.fill();
    if (panic > 0.01) {
      ctx.save(); ctx.globalAlpha *= panic;
      // Raised inner eyebrows emphasize the widened, worried eyes.
      ctx.strokeStyle = '#352632'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(eyeX - side * 12, y - 62);
      ctx.lineTo(eyeX + side * 14, y - 55); ctx.stroke();
      ctx.restore();
    }
  });
  // Teeth cover the top of row zero, including incoming pieces and clear particles.
  ctx.fillStyle = '#eddcbe';
  ctx.strokeStyle = '#b59679'; ctx.lineWidth = 2;
  for (let col = 0; col < w / CELL; col++) {
    const cx = x + (col + 0.5) * CELL, ty = lipY(cx);
    ctx.beginPath(); ctx.moveTo(cx - 20, ty + 2);
    ctx.quadraticCurveTo(cx - 3, ty + 32, cx, ty + 32);
    ctx.quadraticCurveTo(cx + 3, ty + 32, cx + 20, ty + 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x, lipY(x));
  for (let px = x + 4; px < x + w; px += 4) ctx.lineTo(px, lipY(px));
  ctx.lineTo(x + w, lipY(x + w));
  ctx.strokeStyle = '#412d3a'; ctx.lineWidth = 13; ctx.stroke();
  ctx.strokeStyle = '#936676'; ctx.lineWidth = 8; ctx.stroke();
  for (const fx of present.spawnFx) {
    ctx.fillStyle = `rgba(255,239,203,${0.8 * (1 - fx.progress)})`;
    ctx.fillRect(BX + fx.col * CELL, y - 4, fx.len * CELL, 4);
  }
  if (warning !== null) {
    ctx.fillStyle = `rgba(230,85,60,${0.5 + 0.5 * warning})`;
    ctx.fillRect(x, y - 4, w, 4);
  }
  ctx.restore();
}

function drawBoardWell(state) {
  const span = r => state.shape?.rows[r] ?? { left: 0, right: COLS };
  const y = layout.BY;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(BX + span(0).left * CELL, y);
  for (let r = 0; r < ROWS; r++) {
    ctx.lineTo(BX + span(r).left * CELL, y + r * CELL);
    ctx.lineTo(BX + span(r).left * CELL, y + (r + 1) * CELL);
  }
  for (let r = ROWS - 1; r >= 0; r--) {
    ctx.lineTo(BX + span(r).right * CELL, y + (r + 1) * CELL);
    ctx.lineTo(BX + span(r).right * CELL, y + r * CELL);
  }
  ctx.closePath();
  ctx.fillStyle = C.line; ctx.fill();
  // Layered, flat-color strokes preserve the soft toy-like art and shaped outline.
  ctx.strokeStyle = '#1f1823'; ctx.lineWidth = 24; ctx.stroke();
  ctx.strokeStyle = '#563b49'; ctx.lineWidth = 18; ctx.stroke();
  ctx.strokeStyle = '#936676'; ctx.lineWidth = 10; ctx.stroke();
  for (let r = 0; r < ROWS; r++) {
    const { left, right } = span(r);
    for (let c = left; c < right; c++) {
      const cx = BX + c * CELL, cy = y + r * CELL;
      ctx.fillStyle = C.cell;
      rr(cx + 2, cy + 2, CELL - 4, CELL - 4, 8); ctx.fill();
    }
  }
  ctx.restore();
}

function drawOpeningGuide(state, present, now) {
  if (state.phase !== 'play') return;
  const playId = state.playMode || 'standard';
  const spans = [0, 1, 2].map(row => state.shape?.rows[row] ?? { left: 0, right: COLS });
  const left = Math.max(...spans.map(s => s.left)), right = Math.min(...spans.map(s => s.right));
  const cx = BX + (left + right) * CELL / 2, maxWidth = (right - left) * CELL - 28;
  if (!present.scoreFx && !state.hasMoved) {
    const hint = playId === 'totem-building' ? t(state.buildingMode === 2 ? 'hintTotemBuilding2' : 'hintTotemBuilding')
      : playId === 'tetris' ? t('hintTetris') : state.shape ? t('hintShaped') : t('hintClassic');
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.15 * Math.sin(now / 400);
    ctx.font = `700 20px ${FONT}`;
    let y = layout.BY + 65;
    for (const paragraph of [t('mouthIntro'), hint]) {
      let line = '';
      const tokens = paragraph.includes(' ') ? paragraph.split(/(?<= )/) : [...paragraph];
      for (const token of tokens) {
        if (line && ctx.measureText(line + token).width > maxWidth) {
          text(line.trim(), cx, y, 20, '#bba3b7', 'center', 700);
          y += 25;
          line = '';
        }
        line += token;
      }
      if (line) { text(line.trim(), cx, y, 20, '#bba3b7', 'center', 700); y += 25; }
    }
    ctx.restore();
  } else if (playId === 'tetris' && !state.blocks.some(b => b.kind === 'totem')) {
    const n = Number.isInteger(state.tetrisDropIn) ? state.tetrisDropIn : 1;
    outlinedText(`${t('nextDrop')}  ${n}`, cx, layout.BY + 65, 22, '#e9ba78');
  }
}

function drawLevelUp(fx, powerActive, building) {
  if (fx.scale <= 0) return;
  ctx.save();
  ctx.globalAlpha = fx.alpha;
  ctx.translate(W / 2, layout.BY + BH / 2 + (powerActive ? 88 : 0) - fx.rise);
  ctx.scale(fx.scale, fx.scale);
  const label = t(building ? 'juniorIncoming' : 'mealUp');
  ctx.font = `800 52px ${FONT}`;
  const fit = Math.min(1, (BW - 64) / ctx.measureText(label).width);
  ctx.scale(fit, fit);
  outlinedText(label, 0, 0, 52, '#ffdb79');
  ctx.restore();
}

function drawCombo(now, fx) {
  const age = Math.max(0, now - fx.t0);
  const scale = Ease.outBack(clamp(age / 240, 0, 1));
  ctx.save();
  ctx.globalAlpha = fx.alpha;
  ctx.translate(W / 2, layout.VH / 2); ctx.scale(scale, scale);
  outlinedText(t('combo') + ' x' + fx.mult, 0, 0, 48, C.white);
  ctx.restore();
}

function drawGodClear(fx) {
  const seconds = fx.elapsed / 1000;
  const shrink = 1 - Ease.inCubic(clamp((fx.elapsed - 1450) / 350, 0, 1));
  for (const p of fx.confetti) {
    ctx.save();
    ctx.translate(p.x + p.vx * seconds,
      layout.BY + p.y + p.vy * seconds + 525 * seconds * seconds);
    ctx.rotate(p.rot + p.spin * seconds);
    ctx.scale(shrink, shrink);
    ctx.fillStyle = p.color;
    const flutter = 0.25 + 0.75 * Math.abs(Math.cos(p.rot + seconds * 11));
    ctx.fillRect(-p.size / 2, -p.size * flutter / 4, p.size, p.size * flutter / 2);
    ctx.restore();
  }
  if (fx.scale <= 0) return;
  ctx.save();
  ctx.translate(W / 2, layout.BY + BH / 2);
  ctx.font = `800 58px ${FONT}`;
  const label = t('powerModeActivated');
  const fit = Math.min(1, (BW - 64) / ctx.measureText(label).width);
  ctx.scale(fx.scale * fit, fx.scale * fit);
  outlinedText(label, 0, 0, 58, '#ffdb79');
  ctx.restore();
}

let lastRevision = -1, lastMenu, lastState;
export function draw(now, state, viewOf, present, effects, modes, shapeSelection, changed = true) {
  // Hover still animates in menus. Only skip a frame once all visible work is
  // settled, with input, resize, fonts and icons invalidating the cached paint.
  if (present.menu && !changed && lastMenu === present.menu && lastState === state
    && lastRevision === paintRevision) return;
  lastRevision = paintRevision;
  lastMenu = present.menu;
  lastState = state;
  const phase = present.menu || state.phase;
  const { VH, VW, OX, BY, PANEL, PREV_Y, PREV_H } = layout;
  ctx.fillStyle = C.bg;
  ctx.fillRect(-OX, 0, VW, VH);
  ctx.save();
  if (present.shake) ctx.translate(present.shake, 0);

  ctx.fillStyle = C.deco;
  const decoShift = Math.max(0, Math.ceil(OX / W));
  DECO.forEach(([x, fy, s], i) => {
    const oy = Math.sin(now / 1400 + i * 1.7) * 3;
    for (let k = -decoShift; k <= decoShift; k++)
      ctx.fillRect(x + k * W - s / 2, fy * VH - s / 2 + oy, s, s);
  });

  const modeCx = layout.MODE_BTN.x + layout.MODE_BTN.w / 2;
  const pauseCx = layout.PAUSE_BTN.x + layout.PAUSE_BTN.w / 2;
  if (phase !== 'pause') drawIcon(modeIcon, modeCx,
    layout.MODE_BTN.y + layout.MODE_BTN.h / 2, layout.MODE_BTN.h, hoverOf(present, 'icon:mode'));
  drawIcon(gearIcon, pauseCx,
    layout.PAUSE_BTN.y + layout.PAUSE_BTN.h / 2, layout.PAUSE_BTN.h, hoverOf(present, 'icon:pause'));
  const playId = state.playMode || 'standard';
  const slots = hudSlots();
  text(t('best'), slots.bestX, slots.bestY, 22, C.muted, 'left', 700);
  text(String(Math.max(state.best, state.score)),
    slots.bestX, slots.bestScoreY, 24, C.muted, 'left', 800);
  if (present.powerButton) {
    const power = layout.POWER_BTN;
    const powerOn = playId === 'totem-building' && state.phase === 'play';
    const powerHover = hoverOf(present, 'btn:power');
    ctx.save();
    ctx.globalAlpha = powerOn ? 1 : 0.38;
    ctx.fillStyle = powerOn ? '#7a4db5' : C.panel;
    rr(power.x, power.y, power.w, power.h, 12); ctx.fill();
    ctx.strokeStyle = powerOn ? '#5a338a' : '#43374c';
    ctx.lineWidth = 2;
    rr(power.x, power.y, power.w, power.h, 12); ctx.stroke();
    text(t('powerMode'), power.x + power.w / 2, power.y + power.h / 2 + 1,
      16, powerOn ? C.white : C.muted, 'center', 800);
    if (powerOn && powerHover > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 * powerHover})`;
      rr(power.x, power.y, power.w, power.h, 12); ctx.fill();
    }
    ctx.restore();
  }
  text(t('score'), W / 2, layout.MODE_Y, 22, '#a493b0', 'center', 700);
  drawScore(present, slots.scoreY);
  if (playId === 'totem-building') drawJuniorCollection(present);

  drawBoardWell(state);
  drawOpeningGuide(state, present, now);

  let warning = null;
  if (state.phase !== 'over' && state.blocks.some(hitsDeathCeiling)) {
    const { left, right } = state.shape?.rows[0] ?? { left: 0, right: COLS };
    warning = 0.5 + 0.5 * Math.sin(now / 140);
    ctx.fillStyle = `rgba(210,75,45,${0.16 + 0.16 * warning})`;
    ctx.fillRect(BX + left * CELL, BY, (right - left) * CELL, CELL);
  }

  const drag = present.drag;
  const dragged = drag?.active && state.blocks.find(b => b.id === drag.blockId);
  if (dragged) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    const corridor = new Set();
    for (const face of facesOf(dragged))
      for (let c = drag.min + face.col; c < drag.max + face.col + face.len; c++) {
        const row = dragged.row + face.row, key = `${row}:${c}`;
        if (corridor.has(key)) continue;
        corridor.add(key);
        ctx.fillRect(BX + c * CELL + 1, BY + row * CELL + 1, CELL - 2, CELL - 2);
      }
  }

  ctx.save();
  ctx.beginPath();
  if (state.shape) {
    for (const [r, { left, right }] of state.shape.rows.entries())
      ctx.rect(BX + left * CELL, BY + r * CELL, (right - left) * CELL, CELL);
  } else if (playId === 'totem-building') ctx.rect(BX - 10, BY, BW + 20, BH);
  else ctx.rect(BX - 10, BY - 40, BW + 20, BH + 40);
  ctx.clip();
  const warnShape = state.phase === 'play' ? state.shape : null;
  const aboveBoard = b => !viewOf(b).collecting && (b.id === drag?.blockId
    || viewOf(b).slot > 0 || hoverOf(present, 'block:' + b.id) > 0);
  for (const b of state.blocks) if (!aboveBoard(b))
    drawBlock(b, viewOf(b), hoverOf(present, 'block:' + b.id), warnShape, now, playId === 'totem-building');
  ctx.restore();
  // Active and hovered tiles draw last so their feedback is not clipped.
  for (const b of state.blocks) if (aboveBoard(b))
    drawBlock(b, viewOf(b), hoverOf(present, 'block:' + b.id), warnShape, now,
      playId === 'totem-building', b.id === drag?.blockId);

  if (dragged) {
    // Frame the board slot, slightly outside the tile. Draw above the
    // held piece so its pickup scale cannot hide the release destination.
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 14]);
    ctx.lineCap = 'round';
    const inset = 2;
    for (const face of facesOf(dragged)) {
      rr(BX + (drag.target + face.col) * CELL + inset,
        BY + (dragged.row + face.row) * CELL + inset,
        face.len * CELL - 2 * inset, CELL - 2 * inset, BLOCK_R);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#ffefcb';
  for (const burst of present.landingDust) {
    const p = burst.progress;
    const fade = clamp((p - 0.15) / 0.85, 0, 1);
    ctx.globalAlpha = 0.85 * (1 - fade * fade * (3 - 2 * fade));
    for (const dust of burst.particles) {
      const travel = dust.travel * Ease.out(p);
      const hop = dust.hop * Math.sin(Math.PI * p);
      const size = dust.size * (1 - 0.55 * Ease.out(p));
      ctx.fillRect(dust.x + dust.side * (dust.offset + travel) - size / 2,
        BY + dust.y - hop - size, size, size);
    }
  }
  ctx.restore();

  ctx.globalAlpha = 1;
  effects.eachParticle(p => {
    ctx.fillStyle = p.color;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  });

  drawPlayerFace(state, present, warning, now);
  drawLevelBar(state, present);
  // Collection flights cross the mouth and HUD without being hidden by either.
  for (const { block, view } of present.flyingTotems)
    drawBlock(block, view, 0, null, now, true);

  ctx.fillStyle = C.panel;
  rr(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL_R); ctx.fill();
  ctx.strokeStyle = '#433447'; ctx.lineWidth = 2;
  rr(PANEL.x + 1, PANEL.y + 1, PANEL.w - 2, PANEL.h - 2, PANEL_R); ctx.stroke();
  text(t('nextRow'), W / 2, PANEL.y + NEXT_BASELINE, NEXT_SIZE, C.muted, 'center', 800);
  ctx.fillStyle = C.slot;
  const bottom = state.shape?.rows[ROWS - 1] ?? { left: 0, right: COLS };
  for (let c = bottom.left; c < bottom.right; c++) {
    rr(BX + c * CELL + 1, PREV_Y + 1, CELL - 2, PREV_H - 2, 8);
    ctx.fill();
  }
  for (const s of state.nextRow) {
    const x = BX + s.col * CELL + PAD, y = PREV_Y + PAD;
    const w = s.len * CELL - 2 * PAD, h = PREV_H - 2 * PAD;
    const tileH = CELL - 2 * PAD;
    // Show the middle strip of the board tile without shrinking its pattern.
    ctx.save();
    rr(x, y, w, h, 8); ctx.clip();
    drawFood(x, y - (tileH - h) / 2, w, tileH, s.color);
    ctx.restore();
  }

  // Keep feedback above the board and particles, but below modal overlays.
  if (present.scoreFx) drawScorePopup(now, present.scoreFx);
  if (present.comboFx && !present.godClearFx) drawCombo(now, present.comboFx);
  if (present.godClearFx) drawGodClear(present.godClearFx);
  if (present.levelUpFx) drawLevelUp(present.levelUpFx, !!present.godClearFx, playId === 'totem-building');
  ctx.restore();

  drawOverlays(now, state, present, modes, shapeSelection);
}
