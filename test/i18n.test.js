import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang, t, getLang } from '../js/i18n.js';

test('language toggle switches settings title', () => {
  setLang('en');
  assert.equal(getLang(), 'en');
  assert.equal(t('settings'), 'SETTINGS');
  setLang('zh');
  assert.equal(getLang(), 'zh');
  assert.equal(t('settings'), '设置');
  assert.equal(t('soundOn'), '音效开');
  setLang('en');
  assert.equal(t('soundOn'), 'SOUND ON');
});
