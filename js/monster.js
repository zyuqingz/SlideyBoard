// Board-creature poses live on the presentation clock, separate from game rules.
import { COLS } from './board.js';
import { facesOf } from './block-geometry.js';
import { BX, CELL } from './theme.js';

export function createMonster(dead = false) {
  return { target: null, eyes: [{ x: 0, y: 3 }, { x: 0, y: 3 }],
    happyUntil: 0, smile: 0, panic: 0, dead };
}

export function monsterGeometry(state, boardY) {
  const { left, right } = state.shape?.rows[0] ?? { left: 0, right: COLS };
  const x = BX + left * CELL, w = (right - left) * CELL;
  const center = x + w / 2, spacing = Math.min(112, w * 0.23);
  return { x, w, center, eyeY: boardY - 36, eyes: [center - spacing, center + spacing] };
}

export function celebrateMonster(monster, now) {
  if (!monster.dead) monster.happyUntil = now + 1500;
}

export function updateMonster(monster, state, viewOf, boardY, now, ms) {
  monster.dead ||= state.phase === 'over';
  // Use occupied-cell overlap: only fully above-board arrivals are excluded.
  const danger = !monster.dead && state.blocks.some(b => {
    const v = viewOf(b);
    return !v.clearing && facesOf(b).some(face => {
      const row = v.vy + face.row;
      return row < 2 && row + 1 > 0;
    });
  });
  const ease = 1 - Math.exp(-14 * Math.max(0, ms) / 1000);
  const smile = !monster.dead && !danger && now < monster.happyUntil ? 1 : 0;
  monster.smile = smile;
  monster.panic = danger ? 1 : 0;
  const geometry = monsterGeometry(state, boardY);
  monster.eyes.forEach((eye, i) => {
    const dx = monster.target ? (monster.target.x - geometry.eyes[i]) / 100 : 0;
    const dy = monster.target ? (monster.target.y - geometry.eyeY) / 100 : 0.35;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const x = monster.dead ? 0 : 8 * dx / distance;
    const y = monster.dead ? 0 : 8 * dy / distance;
    eye.x += (x - eye.x) * ease;
    eye.y += (y - eye.y) * ease;
  });
}
