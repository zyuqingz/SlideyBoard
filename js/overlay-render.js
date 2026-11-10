// Settings, mode selection and game-over overlays in design-canvas coordinates.
import { W, COLORS, C } from './theme.js';
import { ctx, layout, GO_RESTART } from './canvas-layout.js';
import { rr, text, hoverOf } from './canvas-draw.js';
import { modePopup, shapeControl } from './mode-popup.js';
import { settingsPopup } from './settings-popup.js';
import { getLang, t, modeLabel } from './i18n.js';
import { isMuted } from './audio.js';

function drawButton(b, label, color, size = 42, hover = 0) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const scale = 1 + 0.06 * hover;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = color;
  rr(b.x, b.y, b.w, b.h, 20); ctx.fill();
  text(label, cx, b.y + b.h / 2 + 2, size, C.white);
  ctx.restore();
}

function drawCard(x, y, w, h) {
  ctx.fillStyle = C.bg;
  rr(x, y, w, h, 26); ctx.fill();
  ctx.strokeStyle = '#43374c'; ctx.lineWidth = 4;
  rr(x, y, w, h, 26); ctx.stroke();
}

function drawSelector(b, label, hover, fill = C.panel, ink = '#c5adc9', border = '#43374c') {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const scale = 1 + 0.05 * hover;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = fill;
  rr(b.x, b.y, b.w, b.h, 18); ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 2;
  rr(b.x, b.y, b.w, b.h, 18); ctx.stroke();
  const lines = label.split('\n');
  const size = lines.length > 1 ? 22 : label.length > 12 ? 21 : 26;
  lines.forEach((line, index) =>
    text(line, cx, cy + 1 + (index - (lines.length - 1) / 2) * 24, size, ink));
  ctx.save();
  ctx.strokeStyle = ink; ctx.lineWidth = 5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const direction of [-1, 1]) {
    const x = direction < 0 ? b.x + 28 : b.x + b.w - 28;
    const y = b.y + b.h / 2;
    ctx.beginPath(); ctx.moveTo(x - direction * 4, y - 9);
    ctx.lineTo(x + direction * 4, y); ctx.lineTo(x - direction * 4, y + 9); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawShapeControl(modes, selection, present) {
  const b = shapeControl(modes);
  if (!b || !selection) return;
  const option = selection.options.find(option => option.id === selection.value);
  const lines = t('boardShape').split('\n');
  lines.forEach((line, index) =>
    text(line, b.x - 100, b.y + b.h / 2 + 1 + (index - (lines.length - 1) / 2) * 22,
      18, C.muted, 'left'));
  const label = option.id === 'corridor' ? t('corridorSelector') : modeLabel(option.id, option.label);
  drawSelector(b, label, hoverOf(present, 'shape'));
}

function drawCheckbox(b, label, checked, hover) {
  const size = 30, x = b.x + 16, y = b.y + (b.h - size) / 2;
  ctx.save();
  if (hover > 0) {
    ctx.fillStyle = `rgba(197,173,201,${0.07 * hover})`;
    rr(b.x, b.y, b.w, b.h, 12); ctx.fill();
  }
  ctx.fillStyle = checked ? COLORS[3] : C.panel;
  rr(x, y, size, size, 7); ctx.fill();
  ctx.strokeStyle = checked ? COLORS[3] : '#6c5c78'; ctx.lineWidth = 2;
  rr(x, y, size, size, 7); ctx.stroke();
  if (checked) {
    ctx.strokeStyle = C.white; ctx.lineWidth = 3;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x + 7, y + 15);
    ctx.lineTo(x + 13, y + 21); ctx.lineTo(x + 23, y + 9); ctx.stroke();
  }
  text(label, x + size + 16, b.y + b.h / 2 + 1, 24, '#c5adc9', 'left');
  ctx.restore();
}

export function drawOverlays(now, state, present, modes, shapeSelection) {
  const phase = present.menu || state.phase;
  const { VH, OY } = layout;
  ctx.save();
  ctx.translate(0, OY);
  if (phase === 'pause') {
    ctx.fillStyle = 'rgba(16,11,19,0.82)';
    ctx.fillRect(0, -OY, W, VH);
    const pop = settingsPopup();
    drawCard(pop.card.x, pop.card.y, pop.card.w, pop.card.h);
    text(t('settings'), W / 2, pop.titleY, 48, C.white);
    const lang = getLang();
    drawButton(pop.en, 'EN', lang === 'en' ? COLORS[3] : '#141018', 28, hoverOf(present, 'btn:en'));
    drawButton(pop.zh, '中文', lang === 'zh' ? COLORS[3] : '#141018', 28, hoverOf(present, 'btn:zh'));
    drawButton(pop.sound, isMuted() ? t('soundOff') : t('soundOn'), isMuted() ? '#141018' : COLORS[3], 28,
      hoverOf(present, 'btn:sound'));
    drawButton(pop.restart, t('restart'), COLORS[0], 28, hoverOf(present, 'btn:restart'));
    drawButton(pop.resume, t('resume'), COLORS[1], 28, hoverOf(present, 'btn:resume'));
  }
  if (phase === 'mode') {
    ctx.fillStyle = 'rgba(16,11,19,0.82)';
    ctx.fillRect(0, -OY, W, VH);
    const pop = modePopup(modes);
    drawCard(pop.card.x, pop.card.y, pop.card.w, pop.card.h);
    text(t('mode'), W / 2, pop.titleY, 48, C.white);
    modes.forEach((mode, i) => drawButton(pop.buttons[i], modeLabel(mode.id, mode.label), COLORS[3], 34,
      hoverOf(present, 'btn:mode:' + mode.id)));
    drawShapeControl(modes, shapeSelection, present);
    ctx.strokeStyle = '#43374c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pop.difficulty.x, pop.dividerY);
    ctx.lineTo(pop.difficulty.x + pop.difficulty.w, pop.dividerY); ctx.stroke();
    const normal = state.difficulty === 'normal';
    text(t('difficulty'), pop.difficulty.x, pop.difficulty.y - 14, 16, C.muted, 'left');
    drawSelector(pop.difficulty, t(normal ? 'normal' : 'easy'), hoverOf(present, 'btn:difficulty'),
      normal ? '#b83242' : C.panel, normal ? C.white : '#c5adc9', normal ? '#db5363' : '#43374c');
    drawCheckbox(pop.totems, t('totems'), state.totemsEnabled, hoverOf(present, 'btn:totems'));
    drawButton(pop.resume, t('resume'), COLORS[1], 28, hoverOf(present, 'btn:mode-resume'));
  }
  if (phase === 'over') {
    ctx.save();
    ctx.globalAlpha = present.overlayA;
    ctx.fillStyle = 'rgba(16,11,19,0.84)';
    ctx.fillRect(0, -OY, W, VH);
    const dy = (1 - present.overlayA) * 40;
    ctx.translate(0, dy);
    drawCard(95, 380, 560, 610);
    text(t('gameOver'), W / 2, 465, 62, C.white);
    if (state.gameOverReason === 'no-moves')
      text(t('noMoves'), W / 2, 515, 22, '#c5adc9');
    text(t('score'), W / 2, 555, 28, C.muted);
    text(String(state.score), W / 2, 625, 96, C.white);
    if (state.newBest) {
      const pulse = 1 + 0.05 * Math.sin(now / 160);
      ctx.save(); ctx.translate(W / 2, 715); ctx.scale(pulse, pulse);
      text(t('newHigh'), 0, 0, 34, COLORS[4]);
      ctx.restore();
    } else {
      text(t('highScore'), W / 2, 715, 28, C.muted);
    }
    text(String(state.best), W / 2, 775, 58, COLORS[4]);
    drawButton(GO_RESTART, t('restart'), COLORS[0], 42, hoverOf(present, 'btn:go-restart'));
    ctx.restore();
  }
  ctx.restore();
}
