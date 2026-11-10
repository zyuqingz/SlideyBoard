// Plays detached engine events. This module never imports or invokes game rules.
import { COLS } from './board.js';
import { cellsOf } from './block-geometry.js';
import { W, CELL, BX, COLORS } from './theme.js';
import { Ease, createEffects } from './fx.js';
import { createScorePresentation, stackScore, bankScore } from './score-fx.js';
import { playSfx } from './audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createPresenter({ boardY = () => 0, effects = createEffects(), sfx = playSfx } = {}) {
  const views = new Map();
  const present = {
    ...createScorePresentation(), shake: 0, overlayA: 0, drag: null, menu: null,
    hoverKey: null, hoverAmt: {}
  };
  const { tween, wait } = effects;
  let state, busy = false, generation = 0, lock = 0, motion = 0;

  // Landing squash keeps writing after its fall returns. A later slide, drop,
  // clear, or rise must invalidate that write or blocks flatten mid-motion.
  function interruptSquash() {
    motion++;
    for (const v of views.values()) v.sq = 0;
  }

  function viewOf(block) {
    if (!views.has(block.id)) views.set(block.id, {
      vx: block.col, vy: block.row, flash: 0, s: 1, sq: 0, detached: false, rotation: 0,
      danger: 0, clearing: false, lift: 0
    });
    return views.get(block.id);
  }

  function adopt(snapshot) {
    state = structuredClone(snapshot);
    const keep = new Set(state.blocks.map(b => b.id));
    // A snapshot is a geometry boundary. Only an explicit animation may offset
    // it; cached views must never retain a removed block's scale or old position.
    for (const b of state.blocks) Object.assign(viewOf(b), {
      vx: b.col, vy: b.row, s: 1, flash: 0, clearing: false, detached: false, rotation: 0
    });
    for (const id of views.keys()) if (!keep.has(id)) views.delete(id);
  }

  function reset(snapshot) {
    generation++;
    lock++;
    motion++;
    effects.clear();
    views.clear();
    adopt(snapshot);
    Object.assign(present, createScorePresentation(), {
      displayScore: state.score, shake: 0, overlayA: state.phase === 'over' ? 1 : 0,
      drag: null, menu: null, hoverKey: null, hoverAmt: {}
    });
    busy = false;
  }

  function burstBlock(b, power = 1, velocity = null) {
    for (const cell of cellsOf(b)) {
      const cx = BX + (b.col + cell.col + 0.5) * CELL;
      const cy = boardY() + (b.row + cell.row + 0.5) * CELL;
      for (let k = 0; k < 3 * power; k++) effects.spawnParticle({
        x: cx + (Math.random() - 0.5) * 32, y: cy + (Math.random() - 0.5) * 24,
        vx: velocity ? velocity.x + (Math.random() - 0.5) * 440 * Math.sqrt(power)
          : ((cx - W / 2) * 0.65 + (Math.random() - 0.5) * 440) * Math.sqrt(power),
        vy: velocity ? velocity.y + (Math.random() - 0.5) * 400 * Math.sqrt(power)
          : (-240 - Math.random() * 400) * Math.sqrt(power),
        size: (8 + Math.random() * 12) * Math.sqrt(power),
        color: power > 1 && b.kind === 'totem' ? (k % 3 === 0 ? '#ffe3a8' : '#e9ba78') : COLORS[b.color],
        life: 0.55 + Math.random() * 0.35 + (power - 1) * 0.12, rot: Math.random() * 6
      });
    }
  }

  async function animate(event, run) {
    const current = () => run === generation;
    switch (event.type) {
      case 'slide': {
        interruptSquash();
        const from = viewOf(state.blocks.find(b => b.id === event.id)).vx;
        adopt(event.state);
        const v = viewOf(state.blocks.find(b => b.id === event.id));
        v.vx = from;
        const dist = Math.abs(event.to - from);
        sfx('slide', { volume: 0.45 + 0.15 * Math.min(1, dist / 4), rate: 0.88 });
        return tween(85 + 65 * Math.min(1, dist),
          p => { v.vx = from + (event.to - from) * p; }, Ease.out);
      }
      case 'gravity': {
        interruptSquash();
        adopt(event.state);
        const results = await Promise.all(event.moves.map(async move => {
          const v = viewOf(state.blocks.find(b => b.id === move.id));
          const d = move.to - move.from;
          // The snapshot is already at the landing row. Pin the pre-fall row
          // before the first paint so a block cannot flash at the destination.
          v.vy = move.from;
          if (!await tween(110 + 95 * Math.sqrt(d), t => { v.vy = move.from + d * t; }, Ease.in) || !current())
            return false;
          const amp = Math.min(0.22, 0.1 + 0.04 * d);
          const stamp = motion;
          tween(320, t => { if (stamp === motion) v.sq = amp * t; }, Ease.damped);
          return true;
        }));
        return results.every(Boolean);
      }
      case 'clear': {
        // Keep the pre-clear snapshot visible until the departing blocks vanish.
        // The flash still travels from the middle outward, but every block
        // shrinks on the same final window. An early block used to hit scale 0
        // and leave a hole until the slowest block finished.
        interruptSquash();
        if (event.displayBlocks) adopt({ ...state, blocks: event.displayBlocks });
        const detached = (event.detached ?? []).map((b, i) => ({ b, v: viewOf(b), burst: false,
          dx: (b.col + 0.5 < COLS / 2 ? -1 : 1) * (1.7 + i % 3 * 0.45),
          lift: 2.8 + i % 3 * 0.5 }));
        const rowOrder = event.rows.slice().sort((a, b) => b - a);
        const clears = event.blocks.map(b => ({ b, v: viewOf(b), burst: false,
          delay: Math.abs(b.col + b.len / 2 - COLS / 2) / (COLS / 2) * 70
            + Math.min(3, rowOrder.indexOf(b.row)) * 24 }));
        for (const { v } of clears) v.clearing = true;
        const duration = 320 + Math.max(0, ...clears.map(c => c.delay));
        const shrink = 150;
        const total = duration + (detached.length ? 300 : 0);
        if (!await tween(total, t => {
          const elapsed = t * total;
          const flashEnd = duration - shrink;
          for (const clear of clears) {
            const { b, v, delay } = clear;
            if (elapsed < flashEnd) {
              const q = Ease.outBack(clamp((elapsed - delay) / (flashEnd - delay), 0, 1));
              v.s = 1 + 0.12 * q;
              v.flash = q;
            } else {
              const q = clamp((elapsed - flashEnd) / shrink, 0, 1);
              v.s = 1.12 * (1 - Ease.inCubic(q));
              v.flash = 1 - Ease.out(q);
              if (!clear.burst) {
                const first = !clears.some(c => c.burst);
                clear.burst = true;
                burstBlock(b);
                if (first) {
                  const mult = event.award?.mult || 1;
                  sfx('clear', { volume: 0.62, rate: 0.86 });
                  if (mult > 1) sfx('combo', { volume: 0.38, rate: 0.82 });
                }
              }
            }
          }
          // Off-row faces never flash or use the row's shrink. They break away
          // when the row bursts, travel independently, then burst at their new position.
          for (const fragment of detached) {
            const { b, v, dx, lift } = fragment;
            if (elapsed < flashEnd || fragment.burst) continue;
            v.detached = true;
            const q = clamp((elapsed - flashEnd) / (total - flashEnd), 0, 1);
            const seconds = q * (total - flashEnd) / 1000;
            // Ballistic flight in grid units: constant outward velocity and
            // downward acceleration. Burst debris continues under particle gravity.
            v.vx = b.col + dx * q;
            v.vy = b.row - lift * 3 * seconds + 0.5 * 60 * seconds * seconds;
            v.rotation = Math.sign(dx) * q * Math.PI * 1.5;
            if (q >= 0.85) {
              fragment.burst = true;
              v.s = 0;
              burstBlock({ ...b, col: v.vx, row: v.vy }, 3, {
                x: dx * CELL / ((total - flashEnd) / 1000),
                y: (-lift * 3 + 60 * seconds) * CELL
              });
            }
          }
        }, Ease.lin) || !current()) return false;
        adopt(event.state);
        stackScore(present, event.award, effects);
        return true;
      }
      case 'totem-drop':
      case 'totem-stack':
        interruptSquash();
        adopt(event.state);
        sfx('place', { volume: 0.45, rate: 0.88 });
        return true;
      case 'rise':
      case 'shaped-rise': {
        interruptSquash();
        // Animate the original geometry upward, then chip away discarded spans.
        // The temporary shown snapshot is detached from the authoritative result.
        const shaped = event.type === 'shaped-rise';
        adopt(shaped ? { ...event.state, blocks: event.blocks } : event.state);
        const moving = state.blocks.map(b => {
          const v = viewOf(b);
          v.vy = b.row + 1;
          return { v, row: b.row };
        });
        sfx('rise', { volume: 0.4, rate: 0.88 });
        if (!await tween(shaped ? 240 : 210, p => {
          for (const { v, row } of moving) v.vy = row + 1 - p;
        }, Ease.out) || !current()) return false;
        if (event.trimmed?.length) sfx('clear', { volume: 0.4, rate: 0.84 });
        for (const fragment of event.trimmed ?? []) burstBlock(fragment);
        adopt(event.state);
        return true;
      }
      case 'game-over': {
        interruptSquash();
        if (!await bankScore(present, effects, current) || !current()) return false;
        const top = state.blocks.filter(b => event.blockIds.includes(b.id));
        sfx('error', { volume: 0.55, rate: 0.8 });
        tween(450, p => { present.shake = (1 - p) * 14 * Math.sin(p * 45); }, Ease.lin);
        if (!await tween(350, p => top.forEach(b => { viewOf(b).danger = p; }), Ease.out) || !current()) return false;
        const moving = state.blocks.slice();
        if (!await tween(260, p => {
          for (const b of moving) viewOf(b).vy = b.row - p * 0.35;
        }, Ease.out) || !current()) return false;
        if (!await wait(250) || !current()) return false;
        adopt(event.state);
        return tween(300, p => { present.overlayA = p; }, Ease.out);
      }
      default:
        throw new Error(`No presentation handler for event: ${event.type}`);
    }
  }

  async function play(result) {
    if (busy || !result.accepted) return false;
    const run = generation;
    const mine = ++lock;
    busy = true;
    try {
      for (const event of result.events) {
        if (run !== generation) return false;
        if (event.type === 'turn-complete') {
          // Commit geometry before accepting another gesture. Score feedback can
          // outlive this turn, but must never adopt a snapshot after input unlocks.
          adopt(event.state);
          if (lock === mine) busy = false;
          return await bankScore(present, effects, () => run === generation)
            && run === generation;
        }
        if (!await animate(event, run)) return false;
      }
      return run === generation;
    } finally {
      if (lock === mine) busy = false;
    }
  }

  async function snapBack(block) {
    if (busy) return false;
    block = state.blocks.find(b => b.id === block.id);
    if (!block) return false;
    interruptSquash();
    const run = generation;
    const mine = ++lock;
    const v = viewOf(block), from = v.vx;
    busy = true;
    try {
      return await tween(85 + 65 * Math.min(1, Math.abs(block.col - from)),
        p => { v.vx = from + (block.col - from) * p; }, Ease.out);
    } finally {
      if (lock === mine && run === generation) busy = false;
    }
  }

  function update(ms) {
    let hoverChanged = false;
    const ease = 1 - Math.exp(-18 * ms / 1000);
    const amts = present.hoverAmt;
    const active = present.hoverKey;
    if (active && amts[active] == null) amts[active] = 0;
    for (const key of Object.keys(amts)) {
      const target = key === active ? 1 : 0;
      if (amts[key] !== target) hoverChanged = true;
      amts[key] += (target - amts[key]) * ease;
      if (target === 0 && amts[key] < 0.002) delete amts[key];
      else if (Math.abs(target - amts[key]) < 0.002) amts[key] = target;
    }
    // Menus pause visual playback; the logical turn was already resolved.
    if (present.menu) return hoverChanged;
    effects.update(ms);
    for (const b of state.blocks) {
      const v = viewOf(b);
      const target = present.drag?.blockId === b.id ? 1 : 0;
      v.lift += (target - v.lift) * (1 - Math.exp(-34 * ms / 1000));
      if (Math.abs(target - v.lift) < 0.001) v.lift = target;
    }
    return true;
  }

  return { reset, play, snapBack, update, viewOf, present, effects,
    get state() { return state; }, get busy() { return busy; } };
}
