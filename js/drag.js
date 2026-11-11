// Pointer travel in cells → responsive preview and stable landing column.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const DRAG_DEAD_ZONE = 0.06;
export const DRAG_GAIN = 1.65;
export const DRAG_COMMIT = 0.42;
const START_GAIN = 1.1, GAIN_RAMP = 0.65, REVERSE_BUFFER = 0.16;

function dragOffset(travel) {
  const distance = Math.max(0, Math.abs(travel) - DRAG_DEAD_ZONE);
  const t = Math.min(distance / GAIN_RAMP, 1);
  // Integral of smoothstep: gain increases gently, independent of event rate.
  const boost = GAIN_RAMP * (t ** 3 - t ** 4 / 2) + Math.max(0, distance - GAIN_RAMP);
  return Math.sign(travel) * (START_GAIN * distance + (DRAG_GAIN - START_GAIN) * boost);
}

function pointerTravel(offset) {
  if (!offset) return 0;
  let low = 0, high = Math.abs(offset) / START_GAIN + DRAG_DEAD_ZONE;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (dragOffset(mid) < Math.abs(offset)) low = mid;
    else high = mid;
  }
  return Math.sign(offset) * (low + high) / 2;
}

export function createDrag(col, min, max) {
  return {
    col0: col, min, max, vx: col, target: col, travel: 0,
    minTravel: pointerTravel(min - col), maxTravel: pointerTravel(max - col),
    direction: 0, extreme: col
  };
}

export function followDrag(drag, dxCells) {
  // Discard travel into walls so reversing never has to unwind overshoot.
  drag.travel = clamp(drag.travel + dxCells, drag.minTravel, drag.maxTravel);
  const vx = clamp(drag.col0 + dragOffset(drag.travel), drag.min, drag.max);
  const direction = Math.sign(vx - drag.vx);
  drag.vx = vx;
  if (!direction) return vx;

  if (!drag.direction) {
    drag.direction = direction;
    drag.extreme = vx;
  } else if (direction === drag.direction) {
    drag.extreme = direction > 0 ? Math.max(drag.extreme, vx) : Math.min(drag.extreme, vx);
  } else {
    // Early commitment puts the ghost ahead of the block. Tiny backtracking
    // should move the block naturally without flipping that ghost on release.
    if (Math.abs(vx - drag.extreme) < REVERSE_BUFFER) return vx;
    drag.direction = direction;
    drag.extreme = vx;
  }
  drag.target = commitTarget(vx, drag.target, drag.min, drag.max, direction);
  return vx;
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
