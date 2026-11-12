import test from 'node:test';
import assert from 'node:assert/strict';
import { H } from '../js/theme.js';
import { modePopup } from '../js/mode-popup.js';

test('mode popup card is vertically centered', () => {
  const { card } = modePopup();
  assert.equal(card.y, Math.round((H - card.h) / 2));
  assert.equal(card.y + card.h, H - card.y);
});

test('mode popup content stays inside the centered card', () => {
  const { card, map, control, resume } = modePopup();
  assert.ok(map.y >= card.y);
  assert.ok(map.y + map.h <= card.y + card.h);
  assert.ok(control.y >= card.y && control.y + control.h <= card.y + card.h);
  assert.ok(resume.y >= card.y && resume.y + resume.h <= card.y + card.h);
});

test('map toggle sits above the shape control', () => {
  const { map, control, resume } = modePopup();
  assert.ok(map.y + map.h < control.y);
  assert.ok(control.y + control.h < resume.y);
});

test('difficulty sits below map, shape, and play mode with a larger gap', () => {
  const { card, map, control, dividerY, modeTitleY, playMode, difficulty, powerButton, resume } = modePopup();
  assert.ok(playMode.y - map.y - map.h >= 40);
  assert.ok(playMode.y > control.y + control.h + 28);
  assert.ok(dividerY > Math.max(map.y + map.h, control.y + control.h));
  assert.ok(dividerY < modeTitleY);
  assert.ok(modeTitleY < playMode.y);
  assert.equal(playMode.y, modeTitleY + 48);
  assert.ok(playMode.y + playMode.h < difficulty.y);
  assert.ok(difficulty.y + difficulty.h + 20 < powerButton.y);
  assert.ok(powerButton.y + powerButton.h + 20 < resume.y);
  assert.ok(resume.y + resume.h < card.y + card.h);
  assert.ok(card.y >= 0 && card.y + card.h <= H);
});
