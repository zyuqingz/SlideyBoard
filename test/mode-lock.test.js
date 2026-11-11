import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE_PASSWORD, isModeUnlocked, modePasswordDigits, setModePasswordDigits,
  lockModeUi } from '../js/mode-lock.js';

test('mode password 6767 unlocks and shorter entries stay locked', () => {
  lockModeUi();
  assert.equal(MODE_PASSWORD, '6767');
  assert.equal(isModeUnlocked(), false);
  assert.equal(setModePasswordDigits('67'), null);
  assert.equal(modePasswordDigits(), '67');
  assert.equal(isModeUnlocked(), false);
  assert.equal(setModePasswordDigits('6767'), true);
  assert.equal(isModeUnlocked(), true);
  assert.equal(modePasswordDigits(), '');
});
