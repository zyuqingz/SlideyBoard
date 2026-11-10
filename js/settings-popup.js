import { H } from './theme.js';
import { POP_X, POP_W, POP_BTN } from './mode-popup.js';

const TITLE_Y = 56;
const LANG_Y = 104;
const LANG_H = 58;
const LANG_GAP = 16;
const LANG_INSET = 40;
const BTN_STEP = 84;
const PAD_BOTTOM = 32;

export function settingsPopup() {
  const soundY = LANG_Y + LANG_H + 20;
  const restartY = soundY + LANG_H + 28;
  const resumeY = restartY + BTN_STEP;
  const h = resumeY + POP_BTN.h + PAD_BOTTOM;
  const y = Math.round((H - h) / 2);
  const langW = (POP_W - LANG_INSET * 2 - LANG_GAP) / 2;
  return {
    card: { x: POP_X, y, w: POP_W, h },
    titleY: y + TITLE_Y,
    en: { x: POP_X + LANG_INSET, y: y + LANG_Y, w: langW, h: LANG_H },
    zh: { x: POP_X + LANG_INSET + langW + LANG_GAP, y: y + LANG_Y, w: langW, h: LANG_H },
    sound: { x: POP_X + LANG_INSET, y: y + soundY, w: POP_W - LANG_INSET * 2, h: LANG_H },
    restart: { ...POP_BTN, y: y + restartY },
    resume: { ...POP_BTN, y: y + resumeY }
  };
}
