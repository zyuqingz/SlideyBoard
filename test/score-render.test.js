import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCanvas, layout } from '../js/canvas-layout.js';
import { createPresenter } from '../js/presenter.js';
import { createState } from '../js/sim.js';
import { juniorPreview } from '../js/junior-powers.js';
import { getLang, setLang } from '../js/i18n.js';
import { COLS, ROWS } from '../js/board.js';
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
  const stack = [], labels = [], scores = [], hudLabels = [], fills = [], ranges = [];
  let path = [];
  const ctx = new Proxy({
    save() { stack.push({ ...pose }); },
    restore() { pose = stack.pop(); },
    translate(x, y) { pose.x += x * pose.sx; pose.y += y * pose.sy; },
    scale(x, y) { pose.sx *= x; pose.sy *= y; },
    measureText: () => ({ width: 40 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    beginPath() { path = []; },
    moveTo(x, y) { path.push([x, y]); },
    arcTo(x1, y1, x2, y2) { path.push([x1, y1], [x2, y2]); },
    setLineDash(dash) { pose.dash = dash; },
    stroke() {
      if (!pose.dash?.length || !path.length) return;
      ranges.push({ left: Math.min(...path.map(p => p[0])), top: Math.min(...path.map(p => p[1])),
        right: Math.max(...path.map(p => p[0])), bottom: Math.max(...path.map(p => p[1])),
        dash: pose.dash, color: this.strokeStyle, width: this.lineWidth });
    },
    fillRect(x, y, w, h) { fills.push({ x, y, w, h, color: this.fillStyle }); },
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
    assert.ok(bar.y >= layout.PAUSE_BTN.y + layout.PAUSE_BTN.h + 16,
      'progress bar clears the top-right buttons');
    assert.equal(layout.PREV_H, CELL / 2, 'preview tiles keep their original dimensions');
    assert.ok(layout.PANEL.h < 75, 'preview panel trims padding rather than scaling tiles');
    assert.equal(COLLECTION_SIZE, CELL - 2 * PAD);
    assert.ok(layout.COLLECTION_Y > layout.PREV_Y + layout.PREV_H, 'collection is below the preview');
    assert.ok(layout.COLLECTION_Y + COLLECTION_SIZE * 1.11 < layout.VH, 'bouncing collection fits the viewport');

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
  await t.test('tooltips explain hovered and off-board dragged juniors, hiding on-board and in menus', t => {
    const previousLang = getLang();
    setLang('en');
    t.after(() => setLang(previousLang));
    presenter.present.juniorCollection = [1, 1, 1, 1];
    for (let variant = 0; variant < 4; variant++) {
      presenter.present.hoverKey = 'junior:' + variant;
      hudLabels.length = 0;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      assert.ok(hudLabels.some(item => item.label.includes('One use each')));
    }
    presenter.present.hoverKey = null;
    presenter.present.drag = { kind: 'junior', variant: 1, x: 300, y: 600,
      target: null, preview: juniorPreview(presenter.state, 1, 4, 3) };
    hudLabels.length = 0;
    draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
    assert.ok(!hudLabels.some(item => item.label === 'SPROUT · GROWTH'));
    assert.ok(!hudLabels.some(item => item.label.includes('Release to use')));
    for (const [row, col] of [[10, 3], [-1, 3], [4, -1], [4, 8], [4, 3], [10, 3]]) {
      Object.assign(presenter.present.drag, {
        x: BX + (col + 0.5) * CELL, y: layout.BY + (row + 0.5) * CELL,
        preview: juniorPreview(presenter.state, 1, row, col)
      });
      hudLabels.length = 0;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      assert.equal(hudLabels.some(item => item.label === 'SPROUT · GROWTH'), row !== 4 || col !== 3);
    }
    presenter.present.drag = null;
    presenter.present.hoverKey = 'junior:1';
    presenter.present.menu = 'pause';
    hudLabels.length = 0;
    draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
    assert.ok(!hudLabels.some(item => item.label === 'SPROUT · GROWTH'));
  });
  await t.test('junior drag outlines show each tool range, including empty targets and board edges', () => {
    presenter.reset({ ...createState(0, 'easy', 'totem-building'), blocks: [], nextRow: [],
      juniorCollection: [1, 1, 1, 1] });
    const preview = (variant, row, col) => {
      presenter.present.drag = { kind: 'junior', variant,
        x: BX + (col + 0.5) * CELL, y: layout.BY + (row + 0.5) * CELL, target: null,
        preview: juniorPreview(presenter.state, variant, row, col) };
      ranges.length = 0;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      return [...ranges];
    };
    const bounds = (left, top, right, bottom) => ({
      left: BX + left * CELL + 2, top: layout.BY + top * CELL + 2,
      right: BX + right * CELL - 2, bottom: layout.BY + bottom * CELL - 2,
      dash: [10, 14], color: '#ffffff', width: 4
    });
    assert.deepEqual(preview(0, 5, 3), [bounds(0, 5, COLS, 6)], 'crown covers the row');
    assert.deepEqual(preview(1, 5, 3), [bounds(3, 5, 4, 6)], 'sprout marks the target cell');
    assert.deepEqual(preview(2, 5, 3), [bounds(2, 4, 5, 7)], 'horns cover a 3 × 3 area');
    assert.deepEqual(preview(3, 5, 3), [bounds(0, 0, COLS, ROWS)], 'bow covers the board');
    assert.deepEqual(preview(2, 0, 0), [bounds(0, 0, 2, 2)], 'blast range stops at board edges');
    assert.deepEqual(preview(0, -1, 3), [], 'outside the board has no range');
    presenter.state.shape = { rows: Array.from({ length: ROWS }, () => ({ left: 2, right: 6 })) };
    assert.deepEqual(preview(2, 5, 2), [bounds(2, 4, 4, 7)], 'range respects shaped-board edges');
    assert.deepEqual(preview(3, 5, 2), [bounds(2, 0, 6, ROWS)], 'bow respects shaped-board edges');
    assert.deepEqual(preview(0, 5, 1), [], 'shape cutouts have no range');
  });
  await t.test('ceiling warning agrees with visible danger through spawn, rise and clear', () => {
    const block = { id: 1, row: 1, col: 3, len: 1, kind: 'totem', smile: 1, adultVariant: 0 };
    presenter.reset({ ...createState(0, 'easy', 'totem-building', 2), blocks: [block] });
    const view = presenter.viewOf(block);
    for (const [vy, spawning, clearing, danger] of [
      [-1, true, false, false], [1, true, false, false], [1, false, false, true],
      [2, false, false, false], [1.75, false, false, true], [1, false, true, false]
    ]) {
      Object.assign(view, { vy, spawning, clearing });
      presenter.update(0);
      fills.length = 0;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      const warned = fills.some(fill => fill.color.startsWith('rgba(210,75,45,'));
      assert.equal(warned, danger, `visible row ${vy}, spawning=${spawning}, clearing=${clearing}`);
      assert.equal(presenter.present.monster.panic, danger ? 1 : 0);
    }
  });
});
