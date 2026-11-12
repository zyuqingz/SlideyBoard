// Detached Junior flight poses and inventory arrivals; never adopts board state.
import { COLS, ROWS } from './board.js';
import { CELL, BX, ADULT_LOOKS, juniorSlot } from './theme.js';
import { Ease } from './fx.js';
import { celebrateMonster } from './monster.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createCollectionPresentation(present, effects, { boardY, collectionY, sfx }) {
  const { tween } = effects;
  const motion = ADULT_LOOKS.map(() => 0);

  async function contact(items, current) {
    celebrateMonster(present.monster, effects.now());
    return await tween(340, p => {
      const squash = p < 0.28 ? 0.24 * Ease.out(p / 0.28)
        : p < 0.65 ? 0.24 - 0.33 * Ease.out((p - 0.28) / 0.37)
          : -0.09 * (1 - Ease.out((p - 0.65) / 0.35));
      for (const { block, view } of items)
        view.sq = p === 1 ? 0 : squash / Math.sqrt(block.height ?? 1);
    }, Ease.lin) && current();
  }

  function launch(items, mode2, current) {
    // Subsequent turns may replace live views without touching these poses.
    for (const item of items) {
      item.view = { ...item.view, sq: 0, slot: 0, flight: { x: 0, y: 0, rotation: 0, alpha: 1 } };
      present.flyingTotems.push(item);
    }
    sfx('totem-clear', { volume: 0.92 });
    const distance = mode2 ? 1 : Math.max(1, ...items.map(({ block }) => ROWS - block.row));
    return fly(items, 620 + (distance - 1) * 215, current);
  }

  async function fly(items, duration, current) {
    if (!await tween(duration, t => {
      const p = t * t * (3 - 2 * t);
      for (const { block: b, view: v } of items) {
        const slot = juniorSlot(v.adultVariant, collectionY());
        const dx = slot.x + slot.size / 2 - (BX + (v.vx + b.len / 2) * CELL);
        const dy = slot.y + slot.size / 2 - (boardY() + (v.vy + (b.height ?? 1) / 2) * CELL);
        const distance = Math.max(1, Math.hypot(dx, dy));
        const side = b.col + b.len / 2 < COLS / 2 ? -1 : 1;
        const arc = side * Math.min(150, distance * 0.2) * 2 * p * (1 - p);
        v.flight = {
          x: dx * p - dy / distance * arc,
          y: dy * p + dx / distance * arc,
          rotation: side * 0.12 * Math.sin(Math.PI * p), alpha: 1
        };
        v.s = p <= 0.5 ? 1 + 0.16 * Ease.out(clamp(p / 0.16, 0, 1))
          : 1 + 0.16 * (1 - Ease.out((p - 0.5) * 2));
      }
    }, Ease.lin) || !current()) return false;
    for (const { view } of items) present.juniorCollection[view.adultVariant]++;
    celebrateMonster(present.monster, effects.now());
    present.flyingTotems = present.flyingTotems.filter(item => !items.includes(item));
    const variants = [...new Set(items.map(item => item.view.adultVariant))];
    const finished = await Promise.all(variants.map(variant => bounce(variant, current)));
    return finished.every(Boolean);
  }

  async function bounce(variant, current) {
    const stamp = ++motion[variant];
    const from = present.juniorScales[variant];
    if (!await tween(70, p => {
      if (stamp === motion[variant]) present.juniorScales[variant] = from + (1.22 - from) * p;
    }, Ease.out) || !current()) return false;
    return await tween(180, p => {
      if (stamp === motion[variant]) present.juniorScales[variant] = 1 + 0.22 * (1 - p);
    }, Ease.outBack) && current();
  }

  return { contact, launch };
}
