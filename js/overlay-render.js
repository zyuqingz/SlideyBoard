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

function drawShapeControl(modes, selection, present) {
  const b = shapeControl(modes);
  if (!b || !selection) return;
  const hover = hoverOf(present, 'shape');
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const scale = 1 + 0.05 * hover;
  text(t('boardShape'), W / 2, b.y - 13, 16, C.muted);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = C.panel;
  rr(b.x, b.y, b.w, b.h, 18); ctx.fill();
  ctx.strokeStyle = '#43374c'; ctx.lineWidth = 2;
  rr(b.x, b.y, b.w, b.h, 18); ctx.stroke();
  const option = selection.options.find(option => option.id === selection.value);
  const optionText = modeLabel(option.id, option.label);
  text(optionText, W / 2, b.y + b.h / 2 + 1,
    optionText.length > 12 ? 21 : 26, '#c5adc9');
  ctx.save();
  ctx.strokeStyle = '#c5adc9'; ctx.lineWidth = 5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const direction of [-1, 1]) {
    const x = direction < 0 ? b.x + 28 : b.x + b.w - 28;
    const y = b.y + b.h / 2;
    ctx.beginPath(); ctx.moveTo(x - direction * 4, y - 9);
    ctx.lineTo(x + direction * 4, y); ctx.lineTo(x - direction * 4, y + 9); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  text(t('chooseShape'), W / 2, b.y + b.h + 18, 16, C.muted, 'center', 700);
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
    drawButton(pop.restart, t('restart'), COLORS[0], 34, hoverOf(present, 'btn:restart'));
    drawButton(pop.resume, t('resume'), COLORS[1], 34, hoverOf(present, 'btn:resume'));
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
