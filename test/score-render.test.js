import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCanvas, layout } from '../js/canvas-layout.js';
import { createPresenter } from '../js/presenter.js';
import { createState } from '../js/sim.js';
import { W, H } from '../js/theme.js';

test('totem score text stays visible to the HUD edge and disappears on contact', async t => {
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
  const stack = [], labels = [], scores = [];
  const ctx = new Proxy({
    save() { stack.push({ ...pose }); },
    restore() { pose = stack.pop(); },
    translate(x, y) { pose.x += x * pose.sx; pose.y += y * pose.sy; },
    scale(x, y) { pose.sx *= x; pose.sy *= y; },
    measureText: () => ({ width: 40 }),
    fillText(label, x, y) {
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
  const fx = { id: 1, pts: 100, t0: 0, origin: null, flight: 0 };
  presenter.present.totemScoreFx.push(fx);
  for (const total of [0, 12345, 123456789012]) {
    presenter.present.displayScore = total;
    const digits = String(total).length;
    const fit = Math.min(1, 420 / (digits * 40 * 1.28));
    for (const x of [50, W / 2, W - 50]) {
      const origin = fx.origin = { x, y: layout.BY + 600 };
      const dx = origin.x - W / 2, dy = origin.y - layout.SCORE_Y;
      const edge = Math.min(1, digits * 40 * fit / 2 / Math.abs(dx), 38 * fit / Math.abs(dy));
      const target = { x: W / 2 + dx * edge, y: layout.SCORE_Y + dy * edge };
      assert.ok(target.y > layout.SCORE_Y, 'contact is on the near edge, before the center');
      for (const p of [0.5, 0.9, 0.99, 0.999999]) {
        fx.flight = p;
        draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
        const label = labels.at(-1);
        assert.equal(label.globalAlpha, 1, 'the label must not fade before arrival');
        assert.equal(label.sx, 1, 'the label must not shrink away before arrival');
        assert.equal(label.sy, 1);
        assert.equal(label.x, origin.x + (target.x - origin.x) * p);
        assert.equal(label.y, origin.y + (target.y - origin.y) * p);
      }
      const count = labels.length;
      fx.flight = 1;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      assert.equal(labels.length, count, 'the label disappears on edge contact');
    }
  }
  for (const level of [1, 10]) {
    const sizes = [];
    for (const smile of [1, 2, 3]) {
      fx.smile = smile;
      fx.pts = 50 * smile * level;
      fx.flight = 0;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      const rendered = scores.at(-1);
      assert.equal(rendered.color, ['#ffffff', '#ffe6ac', '#ffd05a'][smile - 1]);
      assert.equal(rendered.globalAlpha, 1);
      const size = Number(rendered.font.match(/([\d.]+)px/)[1]);
      sizes.push(size);
      fx.flight = 0.9;
      draw(1000, presenter.state, presenter.viewOf, presenter.present, presenter.effects, []);
      assert.equal(scores.at(-1).font, rendered.font, 'the stage size stays intact during flight');
      assert.equal(scores.at(-1).color, rendered.color);
    }
    assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2],
      'each expression earns a larger popup, including at higher levels');
  }
});
