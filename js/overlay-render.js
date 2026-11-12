// Settings, mode selection and game-over overlays in design-canvas coordinates.
import { W, COLORS, C } from './theme.js';
import { ctx, layout, GO_RESTART } from './canvas-layout.js';
import { rr, text, hoverOf } from './canvas-draw.js';
import { modePopup, shapeControl } from './mode-popup.js';
import { settingsPopup } from './settings-popup.js';
import { getLang, t, modeLabel } from './i18n.js';
import { isMuted } from './audio.js';

function drawButton(b, label, color, size = 42, hover = 0, ink = C.white) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const scale = 1 + 0.06 * hover;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = color;
  rr(b.x, b.y, b.w, b.h, 20); ctx.fill();
  text(label, cx, b.y + b.h / 2 + 2, size, ink);
  ctx.restore();
}

function drawCard(x, y, w, h) {
  ctx.fillStyle = C.bg;
  rr(x, y, w, h, 26); ctx.fill();
  ctx.strokeStyle = '#43374c'; ctx.lineWidth = 4;
  rr(x, y, w, h, 26); ctx.stroke();
}

const MAP_CHROME = {
  shaped: { fill: COLORS[3], ink: C.white, border: '#1d6e6c' },
  classic: { fill: COLORS[0], ink: C.white, border: '#b56a18' }
};
const MODE_CHROME = {
  standard: { fill: COLORS[1], ink: C.white, border: '#6e8830' },
  tetris: { fill: COLORS[2], ink: C.white, border: '#9a351c' },
  'totem-building': { fill: '#7a4db5', ink: C.white, border: '#5a338a' }
};

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

function drawShapeControl(modes, selection, present, enabled) {
  const b = shapeControl(modes);
  if (!b || !selection) return;
  const option = selection.options.find(option => option.id === selection.value);
  const lines = t('boardShape').split('\n');
  const caption = enabled ? C.muted : '#2e2736';
  lines.forEach((line, index) =>
    text(line, b.x - 100, b.y + b.h / 2 + 1 + (index - (lines.length - 1) / 2) * 22,
      18, caption, 'left'));
  const label = option.id === 'corridor' ? t('corridorSelector') : modeLabel(option.id, option.label);
  drawSelector(b, label, enabled ? hoverOf(present, 'shape') : 0,
    enabled ? C.panel : '#100d14', enabled ? '#c5adc9' : '#3a3144',
    enabled ? '#43374c' : '#241c2a');
}

export function drawOverlays(now, state, present, modes, shapeSelection) {
  const phase = present.menu || state.phase;
  const { VH, VW, OY, OX } = layout;
  ctx.save();
  ctx.translate(0, OY);
  if (phase === 'pause') {
    ctx.fillStyle = 'rgba(16,11,19,0.82)';
    ctx.fillRect(-OX, -OY, VW, VH);
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
    ctx.fillRect(-OX, -OY, VW, VH);
    const pop = modePopup(modes);
    drawCard(pop.card.x, pop.card.y, pop.card.w, pop.card.h);
    text(t('map'), W / 2, pop.titleY, 36, C.white);
    const current = modes.find(mode => mode.id === state.mode) ?? modes[0];
    const mapLocked = state.playMode === 'tetris';
    const mapChrome = MAP_CHROME[current.id] ?? MAP_CHROME.classic;
    drawSelector(pop.map, modeLabel(current.id, current.label),
      mapLocked ? 0 : hoverOf(present, 'btn:map'),
      mapLocked ? '#100d14' : mapChrome.fill,
      mapLocked ? '#3a3144' : mapChrome.ink,
      mapLocked ? '#241c2a' : mapChrome.border);
    drawShapeControl(modes, shapeSelection, present, state.mode === 'shaped');
    ctx.strokeStyle = '#43374c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pop.playMode.x, pop.dividerY);
    ctx.lineTo(pop.playMode.x + pop.playMode.w, pop.dividerY); ctx.stroke();
    const playId = state.playMode || 'standard';
    text(t('mode'), W / 2, pop.modeTitleY, 36, C.white);
    const modeChrome = MODE_CHROME[playId] ?? MODE_CHROME.standard;
    drawSelector(pop.playMode, t(playId), hoverOf(present, 'btn:play-mode'),
      modeChrome.fill, modeChrome.ink, modeChrome.border);
    const building = playId === 'totem-building';
    text(t('buildingRules'), pop.buildingMode.x, pop.buildingMode.y - 14, 16, C.muted, 'left');
    drawSelector(pop.buildingMode, t(state.buildingMode === 2 ? 'buildingMode2' : 'buildingMode1'),
      building ? hoverOf(present, 'btn:building-mode') : 0,
      building ? C.panel : '#100d14', building ? '#c5adc9' : '#3a3144');
    const normal = state.difficulty === 'normal';
    text(t('difficulty'), pop.difficulty.x, pop.difficulty.y - 14, 16, C.muted, 'left');
    drawSelector(pop.difficulty, t(normal ? 'normal' : 'easy'), hoverOf(present, 'btn:difficulty'));
    text(t('powerButton'), pop.powerButton.x, pop.powerButton.y - 14, 16, C.muted, 'left');
    drawSelector(pop.powerButton, t(present.powerButton ? 'on' : 'off'),
      hoverOf(present, 'btn:power-toggle'),
      present.powerButton ? '#7a4db5' : C.panel,
      present.powerButton ? C.white : '#c5adc9',
      present.powerButton ? '#5a338a' : '#43374c');
    drawButton(pop.resume, t('resume'), COLORS[1], 28, hoverOf(present, 'btn:mode-resume'));
  }
  if (phase === 'over') {
    ctx.save();
    ctx.globalAlpha = present.overlayA;
    ctx.fillStyle = 'rgba(16,11,19,0.84)';
    ctx.fillRect(-OX, -OY, VW, VH);
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
