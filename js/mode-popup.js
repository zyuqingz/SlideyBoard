import { H } from './theme.js';

export const POP_X = 145;
export const POP_W = 460;
export const POP_BTN = { x: 185, w: 380, h: 72 };
export const MODE_RESUME_BTN = { x: 245, w: 260, h: 58 };

const SHAPE_CONTROL_H = 100;
const MODE_TITLE_Y = 56;
const MODE_FIRST_BTN_Y = 104;
const MODE_BTN_STEP = 84;
const MODE_PAD_BOTTOM = 32;

function placeY(rect, y) {
  return rect && { ...rect, y: rect.y + y };
}

// Offsets are measured from the card top so extra modes grow the card, then
// the whole card is centered on H.
export function modePopup(modes = []) {
  const shapedIndex = modes.findIndex(mode => mode.id === 'shaped');
  const buttons = (modes.length ? modes : [{ id: 'classic' }]).map((_, index) => ({
    ...POP_BTN,
    y: MODE_FIRST_BTN_Y + index * MODE_BTN_STEP
      + (shapedIndex >= 0 && index > shapedIndex ? SHAPE_CONTROL_H : 0)
  }));
  const last = buttons[buttons.length - 1];
  const shapedBtn = shapedIndex >= 0 ? buttons[shapedIndex] : null;
  const control = shapedBtn
    ? { x: 285, y: shapedBtn.y + shapedBtn.h + 32, w: 280, h: 60 }
    : null;
  const modesBottom = Math.max(last.y + last.h, control ? control.y + control.h : 0);
  const dividerY = modesBottom + 28;
  const difficulty = { ...POP_BTN, y: dividerY + 40, h: 60 };
  const totems = { x: difficulty.x, y: difficulty.y + difficulty.h + 16, w: difficulty.w, h: 60 };
  const resume = {
    ...MODE_RESUME_BTN,
    y: totems.y + totems.h + 28
  };
  const h = resume.y + resume.h + MODE_PAD_BOTTOM;
  const y = Math.round((H - h) / 2);
  return {
    card: { x: POP_X, y, w: POP_W, h },
    titleY: y + MODE_TITLE_Y,
    dividerY: y + dividerY,
    buttons: buttons.map(b => placeY(b, y)),
    control: placeY(control, y),
    difficulty: placeY(difficulty, y),
    totems: placeY(totems, y),
    resume: placeY(resume, y)
  };
}

export const modeButton = (index, modes = []) => {
  const { buttons } = modePopup(modes);
  return buttons[index] ?? buttons[0];
};
export const shapeControl = modes => modePopup(modes).control;
export const modeResume = modes => modePopup(modes).resume;
export const difficultyControl = modes => modePopup(modes).difficulty;
export const totemControl = modes => modePopup(modes).totems;
