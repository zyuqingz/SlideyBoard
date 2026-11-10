// Pointer travel in cells → committed landing column.
// 1:1 tracking felt late on a 2-cell slide because round() only
// advanced at .5 past the current cell (1.56 with the old gate).
// Step the landing column when the block crosses COMMIT past the
// current target so a ~1.4-cell swipe lands 2 cells, while a full
// 1-cell swipe stays on 1.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const DRAG_GAIN = 1.06;
export const DRAG_COMMIT = 0.38;

export function followDrag(vx, dxCells, min, max) {
  return clamp(vx + dxCells * DRAG_GAIN, min, max);
}

export function commitTarget(vx, target, min, max, direction) {
  // Use pointer direction, not vx - target: an early commit puts the target
  // ahead of the pointer. Stationary/repeated events must not undo that commit.
  if (direction > 0 && vx >= target + DRAG_COMMIT - 1e-9)
    return clamp(Math.floor(vx + (1 - DRAG_COMMIT) + 1e-9), min, max);
  if (direction < 0 && vx <= target - DRAG_COMMIT + 1e-9)
    return clamp(Math.ceil(vx - (1 - DRAG_COMMIT) - 1e-9), min, max);
  return target;
}
