import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAG_COMMIT, DRAG_DEAD_ZONE, createDrag, commitTarget, followDrag } from '../js/drag.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);

for (const direction of [-1, 1]) {
  test(`short gestures stay deliberate, longer slides need less travel: ${direction}`, () => {
    for (const [distance, cells] of [[0.2, 0], [0.35, 0], [0.42, 1], [0.8, 1], [1.05, 2], [1.65, 3]]) {
      const drag = createDrag(4, 0, 8);
      followDrag(drag, distance * direction);
      assert.equal(drag.target, 4 + cells * direction);
      followDrag(drag, 0);
      assert.equal(drag.target, 4 + cells * direction);
    }
    assert.equal(commitTarget(4 + direction * (DRAG_COMMIT - 0.01), 4, 0, 8, direction), 4);
    assert.equal(commitTarget(4 + direction * DRAG_COMMIT, 4, 0, 8, direction), 4 + direction);
  });

  test(`tap jitter stays still and returning home cancels the slide: ${direction}`, () => {
    const drag = createDrag(4, 0, 8);
    for (let i = 0; i < 20; i++) {
      followDrag(drag, direction * DRAG_DEAD_ZONE * 0.9);
      assert.equal(drag.vx, 4);
      followDrag(drag, -direction * DRAG_DEAD_ZONE * 0.9);
      assert.equal(drag.target, 4);
    }
    followDrag(drag, direction * 1.05);
    assert.equal(drag.target, 4 + direction * 2);
    followDrag(drag, -direction * 1.05);
    close(drag.vx, 4);
    assert.equal(drag.target, 4);
  });

  test(`release jitter preserves the landing, deliberate reversal changes it: ${direction}`, () => {
    const drag = createDrag(4, 0, 8);
    followDrag(drag, direction * 0.42);
    const committed = drag.target;
    for (let i = 0; i < 10; i++) {
      followDrag(drag, -direction * 0.02);
      assert.equal(drag.target, committed);
      followDrag(drag, direction * 0.02);
      assert.equal(drag.target, committed);
    }
    // Accumulate small events into a real reversal, rather than gating each event.
    for (let i = 0; i < 10; i++) followDrag(drag, -direction * 0.02);
    assert.equal(drag.target, 4);
  });

  test(`travel is independent of pointer event frequency: ${direction}`, () => {
    for (const distance of [0.2, 0.42, 1.05, 1.65]) {
      const single = createDrag(4, 0, 8), many = createDrag(4, 0, 8);
      followDrag(single, direction * distance);
      for (let i = 0; i < 100; i++) followDrag(many, direction * distance / 100);
      close(single.vx, many.vx);
      assert.equal(single.target, many.target);
      // The same consistency also applies while returning toward the origin.
      followDrag(single, -direction * distance);
      for (let i = 0; i < 100; i++) followDrag(many, -direction * distance / 100);
      close(single.vx, many.vx);
      assert.equal(single.target, many.target);
    }
  });

  test(`small forward jitters do not mask an intentional reversal: ${direction}`, () => {
    const drag = createDrag(4, 0, 8);
    followDrag(drag, direction * 0.42);
    for (let i = 0; i < 10; i++) {
      followDrag(drag, -direction * 0.03);
      followDrag(drag, direction * 0.01);
    }
    assert.equal(drag.target, 4);
  });

  test(`walls discard overshoot and allow immediate reversal: ${direction}`, () => {
    const drag = createDrag(4, 2, 6), edge = direction > 0 ? 6 : 2;
    close(followDrag(drag, 20 * direction), edge);
    assert.equal(drag.target, edge);
    close(followDrag(drag, 20 * direction), edge);
    const reversed = followDrag(drag, -direction * 0.1);
    assert.ok((edge - reversed) * direction > 0.1);
    assert.equal(drag.target, edge);
    followDrag(drag, -direction * 0.3);
    assert.equal(drag.target, edge - direction);
  });
}

test('a blocked block stays in place', () => {
  const drag = createDrag(3, 3, 3);
  for (const dx of [1, -2, 0, 10]) {
    assert.equal(followDrag(drag, dx), 3);
    assert.equal(drag.target, 3);
  }
});
