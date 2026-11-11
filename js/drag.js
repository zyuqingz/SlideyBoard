// Pointer travel in cells → responsive preview and stable landing column.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const DRAG_DEAD_ZONE = 0.12;
export const DRAG_GAIN = 0.92;
export const DRAG_COMMIT = 0.6;
export const DRAG_GRID_PULL = 0.32;
const AXIS_BIAS = 1.25;

function dragOffset(travel) {
  const distance = Math.max(0, Math.abs(travel) - DRAG_DEAD_ZONE);
  // Slight resistance without acceleration or frame-dependent input lag.
  return Math.sign(travel) * distance * DRAG_GAIN;
}

function pointerTravel(offset) {
  if (!offset) return 0;
  return Math.sign(offset) * (Math.abs(offset) / DRAG_GAIN + DRAG_DEAD_ZONE);
}

export function createDrag(col, min, max) {
  return {
    col0: col, min, max, vx: col, target: col, travel: 0,
    minTravel: pointerTravel(min - col), maxTravel: pointerTravel(max - col),
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
  // Discard travel into walls so reversing never has to unwind overshoot.
  drag.travel = clamp(drag.travel + dxCells, drag.minTravel, drag.maxTravel);
  const vx = clamp(drag.col0 + dragOffset(drag.travel), drag.min, drag.max);
  const direction = Math.sign(vx - drag.vx);
  drag.vx = vx;
  if (!direction) return vx;

  drag.target = commitTarget(vx, drag.target, drag.min, drag.max, direction);
  return vx;
}

// Gently bias the pose toward the selected slot while following the hand.
// Crossing a commit threshold gives a soft cell-to-cell snap with fast follow.
export function visualDragCol(drag) {
  if (!drag.active) return drag.col0;
  return drag.vx + (drag.target - drag.vx) * DRAG_GRID_PULL;
}

export function commitTarget(vx, target, min, max, direction) {
  // Cross beyond the midpoint to choose a cell; cross back past the opposite
  // threshold to undo it. The 0.2-cell band absorbs release jitter naturally.
  if (direction > 0 && vx >= target + DRAG_COMMIT - 1e-9)
    return clamp(Math.floor(vx + (1 - DRAG_COMMIT) + 1e-9), min, max);
  if (direction < 0 && vx <= target - DRAG_COMMIT + 1e-9)
    return clamp(Math.ceil(vx - (1 - DRAG_COMMIT) - 1e-9), min, max);
  return target;
}
