import { H } from './theme.js';

export const POP_X = 145;
export const POP_W = 460;
export const POP_BTN = { x: 185, w: 380, h: 72 };
export const MODE_RESUME_BTN = { x: 245, w: 260, h: 58 };

const MODE_TITLE_Y = 56;
const MODE_FIRST_BTN_Y = 104;
const MODE_PAD_BOTTOM = 32;

function placeY(rect, y) {
  return rect && { ...rect, y: rect.y + y };
}

// Offsets are measured from the card top so extra modes grow the card, then
// the whole card is centered on H.
export function modePopup(modes = []) {
  const map = { ...POP_BTN, y: MODE_FIRST_BTN_Y, h: 60 };
  const control = { x: 285, y: map.y + map.h + 32, w: 280, h: 60 };
  const dividerY = control.y + control.h + 28;
  const modeTitleY = dividerY + 36;
  const playMode = { ...POP_BTN, y: modeTitleY + 48, h: 60 };
  const difficulty = { ...POP_BTN, y: playMode.y + playMode.h + 40, h: 60 };
  const powerButton = { ...POP_BTN, y: difficulty.y + difficulty.h + 40, h: 60 };
  const resume = {
    ...MODE_RESUME_BTN,
    y: powerButton.y + powerButton.h + 28
  };
  const h = resume.y + resume.h + MODE_PAD_BOTTOM;
  const y = Math.round((H - h) / 2);
  const passwordBox = { ...POP_BTN, y: 0, h: 60 };
  const passwordBack = { ...MODE_RESUME_BTN, y: 0 };
  const lockStack = 36 + 48 + passwordBox.h + 28 + passwordBack.h;
  const lockTop = Math.round((h - lockStack) / 2);
  const passwordTitleY = lockTop + 36;
  passwordBox.y = passwordTitleY + 48;
  passwordBack.y = passwordBox.y + passwordBox.h + 28;
  return {
    card: { x: POP_X, y, w: POP_W, h },
    titleY: y + MODE_TITLE_Y,
    modeTitleY: y + modeTitleY,
    dividerY: y + dividerY,
    map: placeY(map, y),
    buttons: [placeY(map, y)],
    control: placeY(control, y),
    playMode: placeY(playMode, y),
    difficulty: placeY(difficulty, y),
    powerButton: placeY(powerButton, y),
    resume: placeY(resume, y),
    passwordTitleY: y + passwordTitleY,
    passwordBox: placeY(passwordBox, y),
    passwordBack: placeY(passwordBack, y)
  };
}

export const modeButton = (index, modes = []) => {
  const { buttons } = modePopup(modes);
  return buttons[index] ?? buttons[0];
};
export const mapControl = modes => modePopup(modes).map;
export const shapeControl = modes => modePopup(modes).control;
export const modeResume = modes => modePopup(modes).resume;
export const difficultyControl = modes => modePopup(modes).difficulty;
export const powerButtonControl = modes => modePopup(modes).powerButton;
export const playModeControl = modes => modePopup(modes).playMode;
export const passwordBoxControl = modes => modePopup(modes).passwordBox;
export const passwordBackControl = modes => modePopup(modes).passwordBack;
