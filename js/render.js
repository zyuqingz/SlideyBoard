// Board, HUD and effects drawing. Reads state. Does not change the board.

import { COLS, ROWS } from './board.js';
import { facesOf } from './block-geometry.js';
import { W, CELL, PAD, BX, BW, BH, COLORS, C, FONT } from './theme.js';
import { Ease } from './fx.js';
import { t, modeLabel } from './i18n.js';
import { ctx, layout, paintRevision, invalidateCanvas } from './canvas-layout.js';
import { rr, text, hoverOf } from './canvas-draw.js';
import { drawOverlays } from './overlay-render.js';

const PANEL_R = 28;
const BLOCK_R = 14;
// Intervals inside the next-row panel, measured from the panel top.
const NEXT_SIZE = 16;
const NEXT_BASELINE = 30;
const METER_TOP = 152;
const STAT_BASELINE = 188;

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

function drawCeilingWarn(b, v, x, y, shape) {
  if (b.kind === 'totem') {
    for (const face of facesOf(b))
      drawCeilingWarn({ ...b, kind: 'face', row: b.row + face.row, len: 1, height: 1 },
        { ...v, vx: v.vx + face.col, vy: v.vy + face.row },
        x + face.col * CELL, y + face.row * CELL, shape);
    return;
  }
  if (!shape || b.row <= 0 || v.vy !== b.row || v.clearing || v.detached) return;
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

function drawBlock(b, v, hover = 0, shape = null) {
  if (v.s <= 0) return;
  const lift = v.lift;
  const x = BX + v.vx * CELL + PAD, y = layout.BY + v.vy * CELL + PAD;
  const w = b.len * CELL - 2 * PAD, h = (b.height ?? 1) * CELL - 2 * PAD;
  const scale = v.s * (1 + 0.07 * hover);
  ctx.save();
  if (v.rotation) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(v.rotation);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  if (scale !== 1) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  if (v.sq && !v.clearing) {
    const sx = 1 + v.sq * 0.6 / b.len, sy = 1 - v.sq;
    ctx.translate(x + w / 2, y + h); ctx.scale(sx, sy); ctx.translate(-(x + w / 2), -(y + h));
  }
  if (lift > 0) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 * lift})`;
    for (const face of facesOf(b)) {
      rr(x + face.col * CELL + 2 * lift, y + face.row * CELL + 6 * lift,
        face.len * CELL - 2 * PAD, CELL - 2 * PAD, BLOCK_R); ctx.fill();
    }
    ctx.translate(0, -14 * lift);
  }
  // Each face uses exactly the same cell bounds and gaps as a normal block.
  // Apply highlights per cell too, so animation never draws an outer container.
  for (const face of facesOf(b)) {
    const sx = x + face.col * CELL, sy = y + face.row * CELL;
    const faceW = face.len * CELL - 2 * PAD, cellH = CELL - 2 * PAD;
    ctx.fillStyle = b.kind === 'totem' ? '#e9ba78' : COLORS[b.color];
    rr(sx, sy, faceW, cellH, BLOCK_R); ctx.fill();
    if (b.kind === 'totem') {
      ctx.fillStyle = '#583d37';
      rr(sx + faceW * 0.22, sy + 20, 9, 10, 3); ctx.fill();
      rr(sx + faceW * 0.65, sy + 20, 9, 10, 3); ctx.fill();
      rr(sx + faceW * 0.32, sy + 39, faceW * 0.36, 6, 3); ctx.fill();
    }
    if (v.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, 0.85 * v.flash)})`;
      rr(sx, sy, faceW, cellH, BLOCK_R); ctx.fill();
    }
    if (v.danger > 0) {
      ctx.fillStyle = `rgba(40,0,10,${0.45 * v.danger})`;
      rr(sx, sy, faceW, cellH, BLOCK_R); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,70,${v.danger})`; ctx.lineWidth = 4;
      rr(sx + 2, sy + 2, faceW - 4, cellH - 4, BLOCK_R - 1); ctx.stroke();
    }
  }
  drawCeilingWarn(b, v, x, y, shape);
  ctx.restore();
}

let digitWidth, digitRevision = -1;
function drawScore(present) {
  ctx.save();
  ctx.translate(W / 2, layout.SCORE_Y);
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
    text(digit, (i - (digits - 1) / 2) * cellW, 0, 76, C.muted);
  });
  ctx.restore();
}

function drawScorePopup(now, fx) {
  const age = Math.max(0, now - fx.t0);
  const p = fx.flight ?? 0;
  const x = W / 2;
  const y = layout.COMBO_Y + (layout.SCORE_Y - layout.COMBO_Y) * p;
  const scale = fx.flight === null ? Ease.outBack(clamp(age / 220, 0, 1)) : 1;
  ctx.save();
  // Dissolve text and glow before they overlap the total score's center.
  ctx.globalAlpha = 1 - Ease.out(clamp((p - 0.4) / 0.4, 0, 1));
  ctx.translate(x, y); ctx.scale(scale, scale);
  const glow = ctx.createRadialGradient(0, 4, 0, 0, 4, 46);
  glow.addColorStop(0, 'rgba(155,70,215,0.32)');
  glow.addColorStop(1, 'rgba(155,70,215,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-46, -42, 92, 92);
  text('+' + fx.pts, 0, 0, 48, C.white);
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
  const { VH, BY, HY, COMBO_Y, PANEL, PREV_Y } = layout;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, VH);
  ctx.save();
  if (present.shake) ctx.translate(present.shake, 0);

  ctx.fillStyle = C.deco;
  DECO.forEach(([x, fy, s], i) => {
    const oy = Math.sin(now / 1400 + i * 1.7) * 3;
    ctx.fillRect(x - s / 2, fy * VH - s / 2 + oy, s, s);
  });

  if (phase !== 'pause') drawIcon(modeIcon, 92, HY, 50, hoverOf(present, 'icon:mode'));
  drawIcon(gearIcon, 657, HY, 50, hoverOf(present, 'icon:pause'));
  const playId = state.playMode || 'standard';
  if (playId !== 'standard')
    text(`${modeLabel(playId, playId)} ${t('mode')}`,
      W / 2, layout.SCORE_Y - 56, 22, C.muted, 'center', 700);
  drawScore(present);
  if (playId === 'totem-building') {
    const cap = state.spiritualEnergyMax;
    const fill = Math.min(1, (state.spiritualEnergy || 0) / cap);
    const bx = W / 2 - 140, by = layout.SCORE_Y + 52, bw = 280, bh = 16;
    ctx.fillStyle = C.panel;
    rr(bx, by, bw, bh, 8); ctx.fill();
    ctx.fillStyle = '#e9ba78';
    if (fill > 0) { rr(bx, by, Math.max(10, bw * fill), bh, 8); ctx.fill(); }
    ctx.strokeStyle = '#43374c'; ctx.lineWidth = 2;
    rr(bx, by, bw, bh, 8); ctx.stroke();
    text(t('energy'), bx - 12, by + bh / 2 + 1, 16, C.muted, 'right');
    if (state.totemSpawnBlocked)
      text(t('waitingForSpace'), W / 2, by + 28, 18, '#e9ba78');
  }

  if (!present.scoreFx && !state.hasMoved && state.phase !== 'over') {
    const a = 0.55 + 0.25 * Math.sin(now / 400);
    ctx.globalAlpha = a;
    const hint = playId === 'totem-building' ? t('hintTotemBuilding')
      : playId === 'totem' ? t('hintTotem')
        : state.shape ? t('hintShaped') : t('hintClassic');
    text(hint, W / 2, COMBO_Y + 6, state.shape || playId !== 'standard' ? 25 : 30, '#9c89a8', 'center', 700);
    ctx.globalAlpha = 1;
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
  if (state.shape) {
    ctx.strokeStyle = '#6c5c78'; ctx.lineWidth = 2;
    ctx.beginPath();
    const spans = state.shape.rows;
    ctx.moveTo(BX + spans[0].left * CELL, BY);
    for (let r = 0; r < ROWS; r++) {
      ctx.lineTo(BX + spans[r].left * CELL, BY + r * CELL);
      ctx.lineTo(BX + spans[r].left * CELL, BY + (r + 1) * CELL);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      ctx.lineTo(BX + spans[r].right * CELL, BY + (r + 1) * CELL);
      ctx.lineTo(BX + spans[r].right * CELL, BY + r * CELL);
    }
    ctx.closePath(); ctx.stroke();
  }

  if (state.phase !== 'over' && state.blocks.some(b => b.row === 0)) {
    const { left, right } = state.shape?.rows[0] ?? { left: 0, right: COLS };
    const pulse = 0.5 + 0.5 * Math.sin(now / 140);
    ctx.fillStyle = `rgba(210,75,45,${0.10 + 0.12 * pulse})`;
    ctx.fillRect(BX + left * CELL, BY, (right - left) * CELL, CELL);
    ctx.fillStyle = `rgba(230,85,60,${0.5 + 0.5 * pulse})`;
    ctx.fillRect(BX + left * CELL, BY - 6, (right - left) * CELL, 4);
  }

  const drag = present.drag;
  const dragged = drag && state.blocks.find(b => b.id === drag.blockId);
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
    ctx.fillStyle = COLORS[dragged.color];
    ctx.globalAlpha = 0.18;
    const x = BX + drag.target * CELL + PAD, y = BY + dragged.row * CELL + PAD;
    for (const face of facesOf(dragged)) {
      rr(x + face.col * CELL, y + face.row * CELL,
        face.len * CELL - 2 * PAD, CELL - 2 * PAD, BLOCK_R); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (const face of facesOf(dragged)) {
      rr(x + face.col * CELL, y + face.row * CELL,
        face.len * CELL - 2 * PAD, CELL - 2 * PAD, BLOCK_R); ctx.stroke();
    }
  }

  ctx.save();
  ctx.beginPath();
  if (state.shape) {
    for (const [r, { left, right }] of state.shape.rows.entries())
      ctx.rect(BX + left * CELL, BY + r * CELL, (right - left) * CELL, CELL);
  } else ctx.rect(BX - 10, BY - 40, BW + 20, BH + 40);
  ctx.clip();
  const warnShape = state.phase === 'play' ? state.shape : null;
   const aboveBoard = b => b.id === drag?.blockId || viewOf(b).lift > 0 || viewOf(b).detached
    || hoverOf(present, 'block:' + b.id) > 0;
  for (const b of state.blocks) if (!aboveBoard(b))
    drawBlock(b, viewOf(b), hoverOf(present, 'block:' + b.id), warnShape);
  if (dragged) {
    const x = BX + drag.col0 * CELL;
    const y = BY + dragged.row * CELL;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    for (const face of facesOf(dragged)) {
      rr(x + PAD + face.col * CELL, y + PAD + face.row * CELL,
        face.len * CELL - 2 * PAD, CELL - 2 * PAD, BLOCK_R); ctx.stroke();
    }
  }
  ctx.restore();
  // Lifted and hovered tiles draw above the board silhouette so scale is not clipped.
  for (const b of state.blocks) if (aboveBoard(b))
    drawBlock(b, viewOf(b), hoverOf(present, 'block:' + b.id), warnShape);

  ctx.globalAlpha = 1;
  effects.eachParticle(p => {
    ctx.fillStyle = p.color;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  });

  ctx.fillStyle = C.panel;
  rr(PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL_R); ctx.fill();
  text(state.shape ? `${modeLabel(state.shape.id, state.shape.label)} · ${t('nextRow')}`
    : t('nextRow'),
    W / 2, PANEL.y + NEXT_BASELINE, NEXT_SIZE, C.muted, 'center', 800);
  ctx.fillStyle = C.slot;
  const bottom = state.shape?.rows[ROWS - 1] ?? { left: 0, right: COLS };
  for (let c = bottom.left; c < bottom.right; c++) {
    rr(BX + c * CELL + 1, PREV_Y + 1, CELL - 2, CELL - 2, 12);
    ctx.fill();
  }
  for (const s of state.nextRow) {
    ctx.fillStyle = COLORS[s.color];
    rr(BX + s.col * CELL + PAD, PREV_Y + PAD, s.len * CELL - 2 * PAD, CELL - 2 * PAD, BLOCK_R);
    ctx.fill();
  }
  text(t('best'), PANEL.x + 42, PANEL.y + STAT_BASELINE, 26, C.muted, 'left', 800);
  text(String(Math.max(state.best, state.score)), PANEL.x + 120, PANEL.y + STAT_BASELINE, 30, '#a493b0', 'left', 800);
  text(t('level'), PANEL.x + PANEL.w - 80, PANEL.y + STAT_BASELINE, 26, C.muted, 'right', 800);
  text(String(state.level), PANEL.x + PANEL.w - 42, PANEL.y + STAT_BASELINE, 30, '#a493b0', 'right', 800);
  const prog = (state.lines % 10) / 10;
  ctx.fillStyle = C.slot; rr(PANEL.x + 42, PANEL.y + METER_TOP, PANEL.w - 84, 8, 4); ctx.fill();
  if (prog > 0) { ctx.fillStyle = '#6c5c78'; rr(PANEL.x + 42, PANEL.y + METER_TOP, (PANEL.w - 84) * prog, 8, 4); ctx.fill(); }

  // Keep feedback above the board and particles, but below modal overlays.
  if (present.scoreFx) drawScorePopup(now, present.scoreFx);
  if (present.comboFx) drawCombo(now, present.comboFx);
  ctx.restore();

  drawOverlays(now, state, present, modes, shapeSelection);
}
