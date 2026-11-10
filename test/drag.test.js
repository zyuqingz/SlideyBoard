import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAG_COMMIT, DRAG_GAIN, commitTarget, followDrag } from '../js/drag.js';

for (const direction of [-1, 1]) {
  test(`swipes and commit thresholds are symmetric: direction ${direction}`, () => {
    for (const [distance, cells] of [[0.2, 0], [0.4, 1], [1, 1], [1.4, 2]]) {
      const vx = followDrag(4, distance * direction, 0, 8);
      const target = commitTarget(vx, 4, 0, 8, direction);
      assert.equal(target, 4 + cells * direction);
      assert.equal(commitTarget(vx, target, 0, 8, direction), target);
      assert.equal(commitTarget(vx, target, 0, 8, 0), target);
    }
    assert.equal(commitTarget(4 + direction * (DRAG_COMMIT - 0.01), 4, 0, 8, direction), 4);
    assert.equal(commitTarget(4 + direction * DRAG_COMMIT, 4, 0, 8, direction), 4 + direction);
    assert.ok(DRAG_GAIN > 1);
  });

  test(`direction reversal and board boundaries: direction ${direction}`, () => {
    const vx = followDrag(4, 1.4 * direction, 0, 8);
    const target = commitTarget(vx, 4, 0, 8, direction);
    const reversed = followDrag(vx, -direction, 0, 8);
    assert.equal(commitTarget(reversed, target, 0, 8, -direction), 4);
    const edge = direction > 0 ? 8 : 0;
    const clamped = followDrag(4, 20 * direction, 0, 8);
    assert.equal(clamped, edge);
    assert.equal(commitTarget(clamped, 4, 0, 8, direction), edge);
  });
}
