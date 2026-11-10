import test from 'node:test';
import assert from 'node:assert/strict';
import { H } from '../js/theme.js';
import { settingsPopup } from '../js/settings-popup.js';

test('settings popup card is vertically centered', () => {
  const { card } = settingsPopup();
  assert.equal(card.y, Math.round((H - card.h) / 2));
});

test('settings language buttons sit side by side inside the card', () => {
  const { card, en, zh, sound, restart, resume } = settingsPopup();
  assert.ok(en.y >= card.y && zh.y >= card.y);
  assert.ok(en.x + en.w < zh.x);
  assert.equal(en.y, zh.y);
  assert.equal(en.w, zh.w);
  assert.ok(sound.y > en.y + en.h);
  assert.ok(sound.y + sound.h < restart.y);
  for (const b of [en, zh, sound, restart, resume]) {
    assert.ok(b.y + b.h <= card.y + card.h);
    assert.ok(b.x >= card.x && b.x + b.w <= card.x + card.w);
  }
});
