import test from 'node:test';
import assert from 'node:assert/strict';
import { H } from '../js/theme.js';
import { modePopup } from '../js/mode-popup.js';

const classic = { id: 'classic', label: 'CLASSIC' };
const shaped = { id: 'shaped', label: 'SHAPED' };
const extra = { id: 'extra', label: 'EXTRA' };

function assertCentered(modes) {
  const { card } = modePopup(modes);
  assert.equal(card.y, Math.round((H - card.h) / 2));
  assert.equal(card.y + card.h, H - card.y);
}

test('mode popup card is vertically centered for current and taller lists', () => {
  assertCentered([classic]);
  assertCentered([classic, shaped]);
  assertCentered([classic, shaped, extra]);
});

test('mode popup content stays inside the centered card', () => {
  const modes = [classic, shaped, extra];
  const { card, buttons, control, resume } = modePopup(modes);
  for (const b of buttons) {
    assert.ok(b.y >= card.y);
    assert.ok(b.y + b.h <= card.y + card.h);
  }
  assert.ok(control.y >= card.y && control.y + control.h <= card.y + card.h);
  assert.ok(resume.y >= card.y && resume.y + resume.h <= card.y + card.h);
});

test('classic sits last among mode buttons, above resume', () => {
  const modes = [shaped, extra, classic];
  const { buttons, resume } = modePopup(modes);
  const lastMode = buttons[buttons.length - 1];
  assert.equal(modes[buttons.length - 1].id, 'classic');
  assert.ok(lastMode.y + lastMode.h < resume.y);
});

test('difficulty sits below all modes and shape controls with a larger gap', () => {
  for (const modes of [[classic], [shaped, extra, classic], [classic, extra, shaped]]) {
    const { card, buttons, control, dividerY, playMode, difficulty, resume } = modePopup(modes);
    for (const button of buttons) assert.ok(playMode.y - button.y - button.h >= 40);
    if (control) assert.ok(playMode.y > control.y + control.h + 28);
    assert.ok(dividerY > Math.max(...buttons.map(b => b.y + b.h), control ? control.y + control.h : 0));
    assert.ok(dividerY < playMode.y - 24);
    assert.ok(playMode.y + playMode.h < difficulty.y);
    assert.ok(difficulty.y + difficulty.h + 20 < resume.y);
    assert.ok(resume.y + resume.h < card.y + card.h);
    assert.ok(card.y >= 0 && card.y + card.h <= H);
  }
});
