// Board, HUD and effects drawing. Reads state. Does not change the board.

import { COLS, ROWS } from './board.js';
import { facesOf } from './block-geometry.js';
import { W, CELL, PAD, BX, BW, BH, LEVEL_BAR_H, FACE_H, BOARD_OUTLINE_WIDTH, C, FONT } from './theme.js';
import { Ease } from './fx.js';
import { t } from './i18n.js';
import { ctx, layout, paintRevision, invalidateCanvas } from './canvas-layout.js';
import { rr, text, outlinedText, hoverOf } from './canvas-draw.js';
import { drawFood } from './food-art.js';
import { drawBlock } from './block-render.js';
import { drawJuniorCollection, drawJuniorTool } from './junior-render.js';
import { drawOverlays } from './overlay-render.js';
import { monsterGeometry } from './monster.js';
import { isVisibleDanger } from './visible-danger.js';

const PANEL_R = 20;
const BLOCK_R = 14;
// Intervals inside the next-row panel, measured from the panel top.
const NEXT_SIZE = 20;
const NEXT_BASELINE = 12;

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
const gearIcon = loadIcon('assets/gear-fill.svg');

function drawIcon(icon, cx, cy, size = 50, light = 0) {
  if (!icon.ready) return;
  ctx.save();
  if (light > 0) ctx.filter = `brightness(${1 + 2.2 * light}) saturate(${1 - light})`;
  ctx.drawImage(icon.img, cx - size / 2, cy - size / 2, size, size);
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
  // Preserve digit slots and score fitting while enlarging the glyphs inside them.
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
    text(digit, (i - (digits - 1) / 2) * cellW, 0, 88, '#a493b0', 'center', 800, 'middle', cellW);
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
  outlinedText('+' + fx.pts, 0, 0, 58, C.white);
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
  const labelSize = 22 * labelWidth / ctx.measureText(label).width;
  const gap = 14, w = available - labelWidth - gap;
  const start = BX + left * CELL;
  const x = start + labelWidth + gap;
  // Keep the original bar geometry; fit larger lettering into its existing label slot.
  outlinedText(label, start, y + LEVEL_BAR_H / 2, labelSize, '#d6c7df', 'left', 800, labelWidth + gap - 4);
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
  ctx.strokeStyle = '#1f1823'; ctx.lineWidth = BOARD_OUTLINE_WIDTH; ctx.stroke();
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
    const paragraphs = [hint];
    if (playId === 'totem-building') paragraphs.push(t('hintJuniorPowers'));
    for (const paragraph of paragraphs) {
      let line = '';
      const tokens = paragraph.includes(' ') ? paragraph.split(/(?<= )/) : [...paragraph];
      for (const token of tokens) {
        if (line && ctx.measureText(line + token).width > maxWidth) {
          text(line.trim(), cx, y, 24, '#bba3b7', 'center', 700, 'middle', maxWidth);
          y += 25;
          line = '';
          // Wrapping uses the original metrics to preserve every line's position.
          ctx.font = `700 20px ${FONT}`;
        }
        line += token;
      }
      if (line) { text(line.trim(), cx, y, 24, '#bba3b7', 'center', 700, 'middle', maxWidth); y += 25; }
      ctx.font = `700 20px ${FONT}`;
    }
    ctx.restore();
  } else if (playId === 'tetris' && !state.blocks.some(b => b.kind === 'totem')) {
    const n = Number.isInteger(state.tetrisDropIn) ? state.tetrisDropIn : 1;
    outlinedText(`${t('nextDrop')}  ${n}`, cx, layout.BY + 65, 26, '#e9ba78', 'center', 800, maxWidth);
  }
}

function drawLevelUp(fx, powerActive, building) {
  if (fx.scale <= 0) return;
  ctx.save();
  ctx.globalAlpha = fx.alpha;
  ctx.translate(W / 2, layout.BY + BH / 2 + (powerActive ? 88 : 0) - fx.rise);
  ctx.scale(fx.scale, fx.scale);
  const label = t(building ? 'juniorIncoming' : 'mealUp');
  ctx.font = `800 62px ${FONT}`;
  const fit = Math.min(1, (BW - 64) / ctx.measureText(label).width);
  ctx.scale(fit, fit);
  outlinedText(label, 0, 0, 62, '#ffdb79');
  ctx.restore();
}

function drawCombo(now, fx) {
  const age = Math.max(0, now - fx.t0);
  const scale = Ease.outBack(clamp(age / 240, 0, 1));
  ctx.save();
  ctx.globalAlpha = fx.alpha;
  ctx.translate(W / 2, layout.VH / 2); ctx.scale(scale, scale);
  outlinedText(t('combo') + ' x' + fx.mult, 0, 0, 58, C.white, 'center', 800, BW - 32);
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
  ctx.font = `800 70px ${FONT}`;
  const label = t('powerModeActivated');
  const fit = Math.min(1, (BW - 64) / ctx.measureText(label).width);
  ctx.scale(fx.scale * fit, fx.scale * fit);
  outlinedText(label, 0, 0, 70, '#ffdb79');
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

  const pauseCx = layout.PAUSE_BTN.x + layout.PAUSE_BTN.w / 2;
  drawIcon(gearIcon, pauseCx,
    layout.PAUSE_BTN.y + layout.PAUSE_BTN.h / 2, layout.PAUSE_BTN.h, hoverOf(present, 'icon:pause'));
  const playId = state.playMode || 'standard';
  const slots = hudSlots();
  text(t('best'), slots.bestX, slots.bestY, 26, '#a493b0', 'left', 700);
  text(String(Math.max(state.best, state.score)),
    slots.bestX, slots.bestScoreY, 29, '#a493b0', 'left', 800);
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
      20, powerOn ? C.white : C.muted, 'center', 800, 'middle', power.w - 12);
    if (powerOn && powerHover > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 * powerHover})`;
      rr(power.x, power.y, power.w, power.h, 12); ctx.fill();
    }
    ctx.restore();
  }
  text(t('score'), W / 2, layout.MODE_Y, 26, '#a493b0', 'center', 700);
  drawScore(present, slots.scoreY);

  drawBoardWell(state);
  drawOpeningGuide(state, present, now);

  let warning = null;
  if (state.phase !== 'over' && state.blocks.some(b => isVisibleDanger(b, viewOf(b)))) {
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
    const x = BX + s.col * CELL + PAD, y = PREV_Y + PAD;
    const w = s.len * CELL - 2 * PAD, h = PREV_H - 2 * PAD;
    const tileH = CELL - 2 * PAD;
    // Show the middle strip of the board tile without shrinking its pattern.
    ctx.save();
    rr(x, y, w, h, 8); ctx.clip();
    drawFood(x, y - (tileH - h) / 2, w, tileH, s.color);
    ctx.restore();
  }

  if (playId === 'totem-building') drawJuniorCollection(present);
  // Flights also cross the preview on their way to the collection below it.
  for (const { block, view } of present.flyingTotems)
    drawBlock(block, view, 0, null, now, true);

  // Keep feedback above the board and particles, but below modal overlays.
  if (present.scoreFx) drawScorePopup(now, present.scoreFx);
  if (present.comboFx && !present.godClearFx) drawCombo(now, present.comboFx);
  if (present.godClearFx) drawGodClear(present.godClearFx);
  if (present.levelUpFx) drawLevelUp(present.levelUpFx, !!present.godClearFx, playId === 'totem-building');
  drawJuniorTool(state, present);
  ctx.restore();

  drawOverlays(now, state, present, modes, shapeSelection);
}
