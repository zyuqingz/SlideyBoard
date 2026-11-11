export const MODE_PASSWORD = '6767';

let unlocked = false;
let digits = '';

export function isModeUnlocked() {
  return unlocked;
}

export function modePasswordDigits() {
  return digits;
}

export function resetModePassword() {
  digits = '';
}

export function lockModeUi() {
  unlocked = false;
  digits = '';
}

export function setModePasswordDigits(value) {
  digits = String(value || '').replace(/\D/g, '').slice(0, MODE_PASSWORD.length);
  if (digits === MODE_PASSWORD) {
    unlocked = true;
    digits = '';
    return true;
  }
  if (digits.length >= MODE_PASSWORD.length) {
    digits = '';
    return false;
  }
  return null;
}
