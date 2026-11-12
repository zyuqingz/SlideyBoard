import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCanvas, layout } from '../js/canvas-layout.js';
import { createPresenter } from '../js/presenter.js';
import { createState } from '../js/sim.js';
import { W, H, BX, BW, CELL, PAD, COLLECTION_SIZE, LEVEL_BAR_H } from '../js/theme.js';

test('collection and row-score rendering', async t => {
  const globals = ['Image', 'getComputedStyle', 'window', 'document']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  globalThis.Image = class {};
  globalThis.getComputedStyle = () => ({});
  globalThis.window = { innerWidth: W, innerHeight: H, addEventListener() {} };
  globalThis.document = {
    createElement: () => ({ style: {} }), body: { style: {}, appendChild() {} }
  };
  t.after(() => {
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  let pose = { x: 0, y: 0, sx: 1, sy: 1, globalAlpha: 1 };
  const stack = [], labels = [], scores = [], hudLabels = [], fills = [];
  const ctx = new Proxy({
    save() { stack.push({ ...pose }); },
    restore() { pose = stack.pop(); },
    translate(x, y) { pose.x += x * pose.sx; pose.y += y * pose.sy; },
    scale(x, y) { pose.sx *= x; pose.sy *= y; },
    measureText: () => ({ width: 40 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect(x, y, w, h) { fills.push({ x, y, w, h }); },
    fillText(label, x, y) {
      hudLabels.push({ label, x: pose.x + x * pose.sx, y: pose.y + y * pose.sy,
        align: this.textAlign, color: this.fillStyle });
      if (label === '+100') labels.push({ ...pose, x: pose.x + x * pose.sx, y: pose.y + y * pose.sy });
      if (label.startsWith('+')) scores.push({ ...pose, font: this.font, color: this.fillStyle });
    }
  }, {
    get(target, key) { return key === 'globalAlpha' ? pose.globalAlpha : target[key] ?? (() => {}); },
    set(target, key, value) {
      if (key === 'globalAlpha') pose.globalAlpha = value;
      else target[key] = value;
      return true;
    }
  });
  bindCanvas({ style: {}, getContext: () => ctx });
  const { draw } = await import('../js/render.js');
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset({ ...createState(0, 'easy', 'totem-building'), blocks: [], nextRow: [] });
  await t.test('fully grown creatures fly into the collection without any score label', async () => {
    const block = { id: 1, kind: 'totem', row: 5, col: 3, len: 1, height: 1, smile: 3, color: 0 };
    const initial = { ...createState(0, 'easy', 'totem-building', 2), blocks: [block], nextRow: [] };
    const final = { ...structuredClone(initial), blocks: [] };
    presenter.reset(initial);
    const done = presenter.play({ accepted: true, events: [
      { type: 'totem-collect', blocks: [block], state: final },
      { type: 'turn-complete', state: final }
    ] });
    let flew = false;
    for (let i = 0; i < 90; i++) {
      presenter.update(16);
      for (let j = 0; j < 12; j++) await Promise.resolve();
      flew ||= presenter.present.flyingTotems.length > 0;
      draw(presenter.effects.now(), presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
    }
    assert.equal(await done, true);
    assert.ok(flew, 'the creature flight remains visible');
    assert.deepEqual(scores, [], 'no bonus labels appear during contact, flight, or arrival');
    assert.equal(presenter.present.displayScore, 0);
    assert.equal(presenter.present.juniorCollection.reduce((sum, count) => sum + count, 0), 1);
  });
  await t.test('junior HUD shows unknown slots, matching sprites, and duplicate badges', () => {
    presenter.reset({ ...createState(0, 'easy', 'totem-building'), blocks: [], nextRow: [] });
    hudLabels.length = 0;
    fills.length = 0;
    draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
    assert.equal(hudLabels.filter(item => item.label === '?').length, 4);
    const bar = fills.find(item => item.h === LEVEL_BAR_H);
    const label = hudLabels.find(item => item.align === 'left' && item.y === bar.y + bar.h / 2);
    assert.ok(label.x + 40 < bar.x, 'progress label is entirely to the left of the bar');
    assert.equal(label.x, BX);
    assert.equal(bar.x + bar.w, BX + BW, 'label and bar fill the board width');
    assert.equal(label.color, '#d6c7df');
    assert.ok(bar.h < 28, 'progress bar remains thin');
    assert.equal(COLLECTION_SIZE, CELL - 2 * PAD);
    assert.ok(layout.COLLECTION_Y + COLLECTION_SIZE * 1.22 < bar.y, 'bouncing collection row clears the progress bar');

    presenter.present.juniorCollection = [1, 0, 12, 2];
    hudLabels.length = 0;
    draw(1001, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
    assert.equal(hudLabels.filter(item => item.label === '?').length, 1);
    const badges = hudLabels.filter(item => item.y === layout.COLLECTION_Y + 2);
    assert.deepEqual(badges.map(item => item.label), ['12', '2']);
    assert.ok(badges[0].x < badges[1].x, 'badge counts stay with their matching sprite slots');
  });
  await t.test('row-clear scores stay on the board throughout their exit', () => {
    const origin = { x: BX + BW / 2, y: layout.BY + CELL * 8.5 };
    const fx = presenter.present.scoreFx = { pts: 100, t0: 0, origin, exit: 0 };
    for (const exit of [0, 0.25, 0.75, 0.99]) {
      fx.exit = exit;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      const label = labels.at(-1);
      assert.equal(label.x, origin.x);
      assert.equal(label.y, origin.y);
      assert.equal(label.globalAlpha, 1);
    }
  });
});
