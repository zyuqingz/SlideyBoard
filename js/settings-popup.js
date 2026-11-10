import { H } from './theme.js';
import { POP_X, POP_W, MODE_RESUME_BTN } from './mode-popup.js';

const TITLE_Y = 56;
const LANG_Y = 104;
const BTN = MODE_RESUME_BTN;
const LANG_GAP = 16;
const BTN_STEP = BTN.h + 12;
const PAD_BOTTOM = 32;

export function settingsPopup() {
  const soundY = LANG_Y + BTN.h + 20;
  const restartY = soundY + BTN.h + 28;
  const resumeY = restartY + BTN_STEP;
  const h = resumeY + BTN.h + PAD_BOTTOM;
  const y = Math.round((H - h) / 2);
  const langW = (BTN.w - LANG_GAP) / 2;
  return {
    card: { x: POP_X, y, w: POP_W, h },
    titleY: y + TITLE_Y,
    en: { x: BTN.x, y: y + LANG_Y, w: langW, h: BTN.h },
    zh: { x: BTN.x + langW + LANG_GAP, y: y + LANG_Y, w: langW, h: BTN.h },
    sound: { ...BTN, y: y + soundY },
    restart: { ...BTN, y: y + restartY },
    resume: { ...BTN, y: y + resumeY }
  };
}
