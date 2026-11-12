// Presentation-space ceiling exposure shared by block, board and creature feedback.
import { facesOf } from './block-geometry.js';

export function isVisibleDanger(block, view) {
  return !view.clearing && !view.spawning && facesOf(block).some(face => {
    const row = view.vy + face.row;
    return row < 2 && row + 1 > 0;
  });
}
