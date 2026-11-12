// Pointer travel in cells → responsive preview and stable landing column.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const DRAG_DEAD_ZONE = 0.12;
export const DRAG_COMMIT = 0.55;
const AXIS_BIAS = 1.25;

export function createDrag(col, min, max) {
  return {
    col0: col, min, max, vx: col, target: col, travel: 0,
    minTravel: min - col, maxTravel: max - col,
    active: false, rejected: false, pendingX: 0, pendingY: 0
  };
}

export function followDrag(drag, dxCells, dyCells = 0) {
  if (drag.rejected) return drag.vx;
  if (!drag.active) {
    drag.pendingX += dxCells;
    drag.pendingY += dyCells;
    const x = Math.abs(drag.pendingX), y = Math.abs(drag.pendingY);
    if (y >= DRAG_DEAD_ZONE && y > x * AXIS_BIAS) {
      drag.rejected = true;
      return drag.vx;
    }
    if (x < DRAG_DEAD_ZONE || x < y * AXIS_BIAS) return drag.vx;
    drag.active = true;
    dxCells = drag.pendingX;
  }
  // The dead zone gates pickup only. Once active, keep all pointer travel so
  // the grabbed point follows the hand one-to-one, even across the full board.
  // Discard travel into walls so reversing never has to unwind overshoot.
  drag.travel = clamp(drag.travel + dxCells, drag.minTravel, drag.maxTravel);
  const vx = clamp(drag.col0 + drag.travel, drag.min, drag.max);
  const direction = Math.sign(vx - drag.vx);
  drag.vx = vx;
  if (!direction) return vx;

  drag.target = commitTarget(vx, drag.target, drag.min, drag.max, direction);
  return vx;
}

// Follow the hand continuously; the selected slot only affects the outline
// and release destination, never the held tile's position.
export function visualDragCol(drag) {
  if (!drag.active) return drag.col0;
  return drag.vx;
}

export function commitTarget(vx, target, min, max, direction) {
  // Cross beyond the midpoint to choose a cell; cross back past the opposite
  // threshold to undo it. The 0.1-cell band absorbs release jitter naturally.
  if (direction > 0 && vx >= target + DRAG_COMMIT - 1e-9)
    return clamp(Math.floor(vx + (1 - DRAG_COMMIT) + 1e-9), min, max);
  if (direction < 0 && vx <= target - DRAG_COMMIT + 1e-9)
    return clamp(Math.ceil(vx - (1 - DRAG_COMMIT) - 1e-9), min, max);
  return target;
}
