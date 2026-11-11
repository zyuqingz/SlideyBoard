// Board, HUD and effects drawing. Reads state. Does not change the board.

import { COLS, ROWS } from './board.js';
import { facesOf, isCarved } from './block-geometry.js';
import { W, CELL, PAD, BX, BW, BH, LEVEL_BAR_H, COLORS, BLOCK_PALETTE, CARVED_PAINT, C, FONT, totemPaint } from './theme.js';
import { Ease } from './fx.js';
import { t, modeLabel } from './i18n.js';
import { ctx, layout, paintRevision, invalidateCanvas } from './canvas-layout.js';
import { rr, text, hoverOf } from './canvas-draw.js';
import { drawOverlays } from './overlay-render.js';

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

function totemHitsCeiling(b, v, shape) {
  if (b.kind !== 'totem') return false;
  const vx = Number.isFinite(v?.vx) ? v.vx : b.col;
  for (const face of facesOf(b)) {
    const row = b.row + face.row, col = vx + face.col;
    if (row < 0) continue;
    if (row === 0) return true;
    const above = shape?.rows[row - 1];
    if (above && (col + 0.5 < above.left || col + 0.5 >= above.right)) return true;
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

function drawTile(x, y, w, h, paint, radius = BLOCK_R) {
  const detail = Math.min(1, h / (CELL - 2 * PAD));
  const depth = 5 * detail, inset = 4 * detail;
  ctx.fillStyle = paint.shade;
  rr(x, y, w, h, radius); ctx.fill();
  ctx.fillStyle = paint.fill;
  rr(x, y, w, h - depth, radius); ctx.fill();
  // Shared shallow bevel, scaled down for the next-row preview.
  ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 2 * detail;
  rr(x + inset, y + inset, w - 2 * inset, h - depth - 2 * inset, radius - inset); ctx.stroke();
}

function drawBuildingFace(x, y, w, h, stage, pulse, panic, shocked) {
  const paint = totemPaint(stage);
  drawTile(x, y, w, h, paint);
  const happy = clamp(stage - 2, 0, 1);
  const smile = clamp(stage - 1, 0, 1);
  ctx.strokeStyle = paint.ink;
  ctx.lineCap = 'round';
  if (panic) drawPanicFace(x, y + 2, w);
  else {
    ctx.lineWidth = 5;
    for (const cx of [x + w * 0.24, x + w * 0.76]) {
      ctx.beginPath();
      ctx.moveTo(cx - 5 * happy, y + 14);
      ctx.quadraticCurveTo(cx, y + 14 - 9 * happy, cx + 5 * happy, y + 19 - 5 * happy);
      ctx.stroke();
    }
    if (shocked) drawShockedMouth(x, y, w, paint.ink);
    else {
      ctx.lineWidth = 4;
      const halfMouth = w * (0.13 + 0.05 * smile + 0.03 * happy);
      const mouthY = y + 30 - 3 * happy;
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
    rr(x + 2, y + 2, w - 4, h - 4, BLOCK_R - 1); ctx.stroke();
  }
}

function drawBlock(b, v, hover = 0, shape = null, now = 0, building = false, held = false) {
  if (v.s <= 0) return;
  const x = BX + v.vx * CELL + PAD, y = layout.BY + v.vy * CELL + PAD;
  const w = b.len * CELL - 2 * PAD, h = (b.height ?? 1) * CELL - 2 * PAD;
  const pop = v.collecting ? 0 : Math.max(v.slot, hover);
  const scale = v.s * (1 + 0.07 * pop);
  const panic = totemHitsCeiling(b, v, shape) && v.vy === b.row && !v.clearing && !v.evolve;
  const shocked = held && b.kind === 'totem' && !panic;
  ctx.save();
  if (b.kind === 'totem') {
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
  if (panic) ctx.translate(Math.sin(now / 40) * 3.5, 0);
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
      drawBuildingFace(sx, sy, w, cellH, v.expression ?? b.smile ?? 1, v.evolve ?? 0, panic, shocked);
    } else {
      drawTile(sx, sy, w, cellH, isCarved(b) ? CARVED_PAINT : BLOCK_PALETTE[b.color]);
    }
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
    if (v.land > 0 && !v.clearing) {
      ctx.strokeStyle = `rgba(255,250,225,${0.65 * v.land * v.land})`;
      ctx.lineWidth = 2;
      rr(sx + 2, sy + 2, w - 4, cellH - 4, BLOCK_R - 1); ctx.stroke();
    }
    if (v.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, 0.85 * v.flash)})`;
      rr(sx, sy, w, cellH, BLOCK_R); ctx.fill();
    }
    if (v.danger > 0 && !panic) {
      ctx.fillStyle = `rgba(40,0,10,${0.45 * v.danger})`;
      rr(sx, sy, w, cellH, BLOCK_R); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,70,${v.danger})`; ctx.lineWidth = 4;
      rr(sx + 2, sy + 2, w - 4, cellH - 4, BLOCK_R - 1); ctx.stroke();
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
  return { x: W / 2, y: scoreY, halfWidth: digits * cellW * fit / 2, halfHeight: 38 * fit };
}

function drawScorePopup(now, fx, target) {
  const age = Math.max(0, now - fx.t0);
  const p = fx.flight ?? 0;
  const totem = fx.id != null;
  if (totem && p >= 1) return;
  const x0 = fx.origin?.x ?? W / 2;
  const y0 = fx.origin?.y ?? layout.COMBO_Y;
  const dx = x0 - target.x, dy = y0 - target.y;
  // Intersect the approach with the score's bounds, rather than its center.
  const edge = totem ? Math.min(1, target.halfWidth / Math.abs(dx), target.halfHeight / Math.abs(dy)) : 0;
  const x = x0 + (target.x + dx * edge - x0) * p;
  const y = y0 + (target.y + dy * edge - y0) * p;
  const arrival = clamp((p - 0.5) / 0.5, 0, 1);
  const scale = fx.flight === null || fx.flight === 0
    ? Ease.outBack(clamp(age / 220, 0, 1)) : totem ? 1 : 1 - Ease.in(arrival);
  ctx.save();
  // Totem labels remain visible until contact with the HUD edge.
  ctx.globalAlpha = totem ? 1 : 1 - Ease.out(clamp((p - 0.5) / 0.4, 0, 1));
  ctx.translate(x, y); ctx.scale(scale, scale);
  if (fx.id == null) {
    const glow = ctx.createRadialGradient(0, 4, 0, 0, 4, 46);
    glow.addColorStop(0, 'rgba(155,70,215,0.32)');
    glow.addColorStop(1, 'rgba(155,70,215,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-46, -42, 92, 92);
  }
  const label = '+' + fx.pts;
  const stage = clamp(Math.round(fx.smile ?? 1), 1, 3);
  // A shared length fit preserves the size hierarchy even for larger awards.
  const fit = Math.min(1, (CELL - 12) / (label.length * 0.65 * 28));
  const size = totem ? [20, 27, 34][stage - 1] * fit : 48;
  const color = totem ? [C.white, '#ffe6ac', '#ffd05a'][stage - 1] : C.white;
  text(label, 0, 0, size, color);
  ctx.restore();
}

function drawLevelBar(state, present, warning) {
  const { left, right } = state.shape?.rows[0] ?? { left: 0, right: COLS };
  const x = BX + left * CELL, y = layout.BY - LEVEL_BAR_H;
  const w = (right - left) * CELL;
  const progress = clamp(present.displayProgress ?? state.levelProgress ?? 0, 0, 1);
  const label = `${t('level')} ${present.displayLevel ?? state.level}`;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  rr(x, y, w, LEVEL_BAR_H, 6); ctx.clip();
  ctx.fillStyle = '#43374c';
  ctx.fillRect(x, y, w, LEVEL_BAR_H);
  text(label, x + w / 2, y + LEVEL_BAR_H / 2 + 1, 22, C.white);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w * progress, LEVEL_BAR_H); ctx.clip();
  ctx.fillStyle = '#e9ba78';
  ctx.fillRect(x, y, w, LEVEL_BAR_H);
  text(label, x + w / 2, y + LEVEL_BAR_H / 2 + 1, 22, '#392b3d');
  ctx.restore();
  const pulse = ((present.levelScale ?? 1) - 1) / 0.12;
  if (pulse > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 * pulse})`;
    ctx.fillRect(x, y, w, LEVEL_BAR_H);
  }
  for (const fx of present.spawnFx) {
    ctx.fillStyle = `rgba(255,239,203,${0.8 * (1 - fx.progress)})`;
    ctx.fillRect(BX + fx.col * CELL, layout.BY - 4, fx.len * CELL, 4);
  }
  if (warning !== null) {
    ctx.fillStyle = `rgba(230,85,60,${0.5 + 0.5 * warning})`;
    ctx.fillRect(x, layout.BY - 6, w, 4);
  }
  ctx.restore();
  ctx.strokeStyle = '#a493b0'; ctx.lineWidth = 2;
  rr(x, y, w, LEVEL_BAR_H, 6); ctx.stroke();
}

function drawLevelUp(fx, powerActive) {
  if (fx.scale <= 0) return;
  ctx.save();
  ctx.globalAlpha = fx.alpha;
  ctx.translate(W / 2, layout.BY + BH / 2 + (powerActive ? 88 : 0) - fx.rise);
  ctx.scale(fx.scale, fx.scale);
  const label = t('levelUp');
  ctx.font = `800 52px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = '#392b3d';
  ctx.strokeText(label, 0, 0);
  text(label, 0, 0, 52, '#ffdb79');
  ctx.restore();
}

function drawCombo(now, fx) {
  const age = Math.max(0, now - fx.t0);
  const scale = Ease.outBack(clamp(age / 240, 0, 1));
  ctx.save();
  ctx.globalAlpha = fx.alpha;
  ctx.translate(W / 2, layout.VH / 2); ctx.scale(scale, scale);
  text(t('combo') + ' x' + fx.mult, 0, 0, 48, C.white);
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
  text(label, 0, 6, 58, '#392b3d');
  text(label, 0, 0, 58, '#ffdb79');
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
  const { VH, BY, PANEL, PREV_Y, PREV_H } = layout;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, VH);
  ctx.save();
  if (present.shake) ctx.translate(present.shake, 0);

  ctx.fillStyle = C.deco;
  DECO.forEach(([x, fy, s], i) => {
    const oy = Math.sin(now / 1400 + i * 1.7) * 3;
    ctx.fillRect(x - s / 2, fy * VH - s / 2 + oy, s, s);
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
  if (playId !== 'standard')
    text(`${modeLabel(playId, playId)} ${t('mode')}`,
      W / 2, layout.MODE_Y, 22, C.muted, 'center', 700);
  const scoreTarget = drawScore(present, slots.scoreY);
  const guideY = BY - LEVEL_BAR_H - 26;
  // Instructions and the live countdown sit just above the board-edge bar.
  if (state.phase === 'play') {
    if (!present.scoreFx && !state.hasMoved) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now / 400);
      const hint = playId === 'totem-building' ? t('hintTotemBuilding')
        : playId === 'tetris' ? t('hintTetris')
          : state.shape ? t('hintShaped') : t('hintClassic');
      text(hint, W / 2, guideY, 22, '#9c89a8', 'center', 700);
      ctx.globalAlpha = 1;
    } else if (playId === 'tetris' && !state.blocks.some(b => b.kind === 'totem')) {
      const n = Number.isInteger(state.tetrisDropIn) ? state.tetrisDropIn : 1;
      text(`${t('nextDrop')}  ${n}`, W / 2, guideY, 22, '#e9ba78', 'center', 800);
    }
  }

  ctx.fillStyle = C.line;
  if (state.shape) {
    for (const [r, { left, right }] of state.shape.rows.entries())
      ctx.fillRect(BX + left * CELL, BY + r * CELL, (right - left) * CELL, CELL);
  } else ctx.fillRect(BX, BY, BW, BH);
  ctx.fillStyle = C.cell;
  for (let r = 0; r < ROWS; r++) {
    const { left, right } = state.shape?.rows[r] ?? { left: 0, right: COLS };
    for (let c = left; c < right; c++)
      ctx.fillRect(BX + c * CELL + 1, BY + r * CELL + 1, CELL - 2, CELL - 2);
  }
  ctx.strokeStyle = '#6c5c78'; ctx.lineWidth = 5;
  ctx.beginPath();
  const span = r => state.shape?.rows[r] ?? { left: 0, right: COLS };
  ctx.moveTo(BX + span(0).left * CELL, BY);
  for (let r = 0; r < ROWS; r++) {
    ctx.lineTo(BX + span(r).left * CELL, BY + r * CELL);
    ctx.lineTo(BX + span(r).left * CELL, BY + (r + 1) * CELL);
  }
  for (let r = ROWS - 1; r >= 0; r--) {
    ctx.lineTo(BX + span(r).right * CELL, BY + (r + 1) * CELL);
    ctx.lineTo(BX + span(r).right * CELL, BY + r * CELL);
  }
  ctx.closePath(); ctx.stroke();

  let warning = null;
  if (state.phase !== 'over'
    && state.blocks.some(b => b.row <= 0 && b.kind !== 'totem')) {
    const { left, right } = state.shape?.rows[0] ?? { left: 0, right: COLS };
    warning = 0.5 + 0.5 * Math.sin(now / 140);
    ctx.fillStyle = `rgba(210,75,45,${0.10 + 0.12 * warning})`;
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
    const homeX = BX + drag.col0 * CELL + PAD, homeY = BY + dragged.row * CELL + PAD;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (const face of facesOf(dragged)) {
      rr(homeX + face.col * CELL, homeY + face.row * CELL,
        face.len * CELL - 2 * PAD, CELL - 2 * PAD, BLOCK_R); ctx.stroke();
    }
    ctx.fillStyle = COLORS[dragged.color];
    ctx.globalAlpha = 0.18;
    const x = BX + drag.target * CELL + PAD, y = BY + dragged.row * CELL + PAD;
    for (const face of facesOf(dragged)) {
      rr(x + face.col * CELL, y + face.row * CELL,
        face.len * CELL - 2 * PAD, CELL - 2 * PAD, BLOCK_R); ctx.fill();
    }
    ctx.globalAlpha = 1;
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
  const aboveBoard = b => !!viewOf(b).flight || !viewOf(b).collecting && (b.id === drag?.blockId
    || viewOf(b).slot > 0 || hoverOf(present, 'block:' + b.id) > 0);
  for (const b of state.blocks) if (!aboveBoard(b))
    drawBlock(b, viewOf(b), hoverOf(present, 'block:' + b.id), warnShape, now, playId === 'totem-building');
  ctx.restore();
  // Active and hovered tiles draw last so their feedback is not clipped.
  for (const b of state.blocks) if (aboveBoard(b))
    drawBlock(b, viewOf(b), hoverOf(present, 'block:' + b.id), warnShape, now,
      playId === 'totem-building', b.id === drag?.blockId);

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

  // Opaque across its full width, above tiles and their particles.
  drawLevelBar(state, present, warning);

  ctx.fillStyle = C.panel;
  rr(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL_R); ctx.fill();
  text(t('nextRow'), W / 2, PANEL.y + NEXT_BASELINE, NEXT_SIZE, C.muted, 'center', 800);
  ctx.fillStyle = C.slot;
  const bottom = state.shape?.rows[ROWS - 1] ?? { left: 0, right: COLS };
  for (let c = bottom.left; c < bottom.right; c++) {
    rr(BX + c * CELL + 1, PREV_Y + 1, CELL - 2, PREV_H - 2, 8);
    ctx.fill();
  }
  for (const s of state.nextRow) {
    drawTile(BX + s.col * CELL + PAD, PREV_Y + PAD,
      s.len * CELL - 2 * PAD, PREV_H - 2 * PAD, BLOCK_PALETTE[s.color], 8);
  }

  // Keep feedback above the board and particles, but below modal overlays.
  if (present.scoreFx) drawScorePopup(now, present.scoreFx, scoreTarget);
  for (const fx of present.totemScoreFx) drawScorePopup(now, fx, scoreTarget);
  if (present.comboFx && !present.godClearFx) drawCombo(now, present.comboFx);
  if (present.godClearFx) drawGodClear(present.godClearFx);
  if (present.levelUpFx) drawLevelUp(present.levelUpFx, !!present.godClearFx);
  ctx.restore();

  drawOverlays(now, state, present, modes, shapeSelection);
}
