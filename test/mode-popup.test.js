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
