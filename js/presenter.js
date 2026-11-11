// Plays detached engine events. This module never imports or invokes game rules.
import { COLS, ROWS } from './board.js';
import { cellsOf, facesOf } from './block-geometry.js';
import { W, CELL, PAD, BX, BW, BH, COLORS, totemPaint } from './theme.js';
import { Ease, createEffects } from './fx.js';
import { createScorePresentation, stackScore, bankScore, showTotemScore, finishTotemScores } from './score-fx.js';
import { playSfx } from './audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createPresenter({ boardY = () => 0, effects = createEffects(), sfx = playSfx } = {}) {
  const views = new Map();
  const present = {
    ...createScorePresentation(), shake: 0, overlayA: 0, drag: null, menu: null,
    hoverKey: null, hoverAmt: {}, landingDust: [], godClearFx: null,
    displayProgress: 0, displayLevel: 1, levelScale: 1
  };
  const { tween, wait } = effects;
  let state, busy = false, generation = 0, lock = 0, motion = 0;

  // Landing feedback keeps writing after its fall returns. A later slide, drop,
  // clear, or rise must invalidate that write or blocks flatten mid-motion.
  function interruptSquash() {
    motion++;
    for (const v of views.values()) { v.sq = 0; v.land = 0; }
  }

  function viewOf(block) {
    if (!views.has(block.id)) views.set(block.id, {
      vx: block.col, vy: block.row, flash: 0, s: 1, sq: 0, land: 0, slot: 0,
      danger: 0, clearing: false, collecting: false, expression: block.smile ?? 1, evolve: 0
    });
    return views.get(block.id);
  }

  function adopt(snapshot) {
    state = structuredClone(snapshot);
    const keep = new Set(state.blocks.map(b => b.id));
    // A snapshot is a geometry boundary. Only an explicit animation may offset
    // it; cached views must never retain a removed block's scale or old position.
    for (const b of state.blocks) Object.assign(viewOf(b), {
      vx: b.col, vy: b.row, s: 1, flash: 0, slot: 0, clearing: false, collecting: false,
      expression: b.smile ?? 1, evolve: 0
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
      drag: null, menu: null, hoverKey: null, hoverAmt: {}, landingDust: [], godClearFx: null,
      displayProgress: state.levelProgress ?? 0,
      displayLevel: state.level ?? 1,
      levelScale: 1
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
        color: b.kind === 'totem' && state.playMode === 'totem-building'
          ? totemPaint(b.smile).fill
          : power > 1 && b.kind === 'totem' ? (k % 3 === 0 ? '#ffe3a8' : '#e9ba78') : COLORS[b.color],
        life: 0.55 + Math.random() * 0.35 + (power - 1) * 0.12, rot: Math.random() * 6
      });
    }
  }

  const fallMs = d => 110 + 95 * Math.sqrt(d);
  const TOTEM_STAGGER_MS = 42;

  function celebrateGodClear() {
    const colors = ['#ffdb79', '#fff3cc', '#91d6bd', '#d7a6ff', '#ff9ba8'];
    const fx = { elapsed: 0, scale: 0, confetti: [] };
    for (const side of [-1, 1]) for (let i = 0; i < 28; i++) {
      fx.confetti.push({
        x: side < 0 ? BX - 18 : BX + BW + 18,
        y: BH * 0.62 + (Math.random() - 0.5) * 50,
        vx: -side * (180 + Math.random() * 420), vy: -420 - Math.random() * 420,
        size: 7 + Math.random() * 8, rot: Math.random() * Math.PI,
        spin: side * (5 + Math.random() * 8), color: colors[i % colors.length]
      });
    }
    present.godClearFx = fx;
    // One visual clock owns the pop, hold and accelerating scale-only exit.
    // The celebration can finish over subsequent board motion.
    tween(1500, p => {
      fx.elapsed = p * 1500;
      fx.scale = fx.elapsed < 260 ? Ease.outBack(fx.elapsed / 260)
        : fx.elapsed < 1120 ? 1
          : fx.elapsed < 1200 ? 1 + 0.08 * Ease.out((fx.elapsed - 1120) / 80)
            : 1.08 * (1 - Ease.inCubic((fx.elapsed - 1200) / 300));
      if (p === 1 && present.godClearFx === fx) present.godClearFx = null;
    }, Ease.lin);
  }

  function collectionScores(blocks, award) {
    return (award?.totems ?? []).map(points => {
      const b = blocks.find(block => block.id === points.id);
      return showTotemScore(present, { ...points, smile: b.smile ?? 1 }, effects, {
        x: BX + (b.col + b.len / 2) * CELL,
        y: boardY() + (b.row - 0.4) * CELL
      });
    });
  }

  function landingDust(b) {
    const faces = facesOf(b);
    const bottom = Math.max(...faces.map(face => face.row));
    const feet = faces.filter(face => face.row === bottom);
    const burst = { progress: 0, particles: [] };
    for (const face of feet) for (const side of [-1, 1]) {
      const edge = side < 0 ? face.col : face.col + face.len;
      if (feet.some(other => other !== face
        && (side < 0 ? other.col + other.len === edge : other.col === edge))) continue;
      for (let i = 0; i < 2; i++) {
        const travel = 14 + i * 18 + Math.random() * 10;
        burst.particles.push({
          x: BX + (b.col + edge) * CELL,
          y: (b.row + face.row + 1) * CELL - PAD,
          side, travel, hop: 6 + travel * 0.65 + Math.random() * 4,
          size: 6 + Math.random() * 4,
          offset: 2 + i * 9 + Math.random() * 5
        });
      }
    }
    present.landingDust.push(burst);
    // Independent of block poses: subsequent rises and clears cannot cut off the fade.
    tween(420, p => {
      burst.progress = p;
      if (p === 1) present.landingDust.splice(present.landingDust.indexOf(burst), 1);
    }, Ease.lin);
  }

  async function fall(moves, current) {
    const items = moves.map(move => {
      const b = state.blocks.find(block => block.id === move.id);
      const v = viewOf(b);
      // Pin the pre-fall row before the first paint of the landing snapshot.
      v.vy = move.from;
      return { move, b, v, d: move.to - move.from };
    });
    let totemWave = 0;
    const results = await Promise.all(items.map(async ({ move, b, v, d }) => {
      const delay = b?.kind === 'totem' ? totemWave++ * TOTEM_STAGGER_MS : 0;
      if (delay && (!await wait(delay) || !current())) return false;
      if (!await tween(fallMs(d), t => { v.vy = move.from + d * t; }, Ease.in) || !current())
        return false;
      if (d <= 0) return true;
      // Show contact immediately, then let the compression rebound before the
      // next event can interrupt it. The soft tail can outlive the turn.
      const amp = Math.min(0.24, 0.12 + 0.035 * d) / Math.sqrt(b.height ?? 1);
      const stamp = motion;
      v.sq = amp;
      landingDust(b);
      v.land = 1;
      tween(300, p => {
        if (stamp !== motion) return;
        v.sq = amp * Ease.damped(p);
        v.land = 1 - p;
      }, Ease.lin);
      return await wait(120) && current();
    }));
    return results.every(Boolean);
  }

  async function animate(event, run) {
    const current = () => run === generation;
    switch (event.type) {
      case 'slide': {
        interruptSquash();
        const from = viewOf(state.blocks.find(b => b.id === event.id)).vx;
        adopt(event.state);
        const moved = state.blocks.find(b => b.id === event.id);
        const v = viewOf(moved);
        v.vx = from;
        pickup(moved);
        const dist = Math.abs(event.to - from);
        sfx('slide', { volume: 0.45 + 0.15 * Math.min(1, dist / 4), rate: 0.88 });
        slotIn(v);
        return tween(85 + 65 * Math.min(1, dist),
          p => { v.vx = from + (event.to - from) * p; }, Ease.out);
      }
      case 'gravity': {
        interruptSquash();
        adopt(event.state);
        return fall(event.moves, current);
      }
      case 'clear': {
        // Keep the pre-clear snapshot visible until the departing blocks vanish.
        // Ordinary clears share a final shrink window. God clears deliberately
        // stagger the whole pop/shrink so the disappearance travels across the row.
        interruptSquash();
        if (state.playMode === 'totem-building') {
          const fromP = present.displayProgress;
          const toP = event.state.levelProgress ?? 0;
          const fromL = present.displayLevel;
          const toL = event.state.level ?? fromL;
          if (toL > fromL || toP > fromP) {
            const fillTo = toL > fromL ? 1 : toP;
            tween(500, p => {
              present.displayProgress = fromP + (fillTo - fromP) * p;
              present.displayLevel = fromL;
              // Fast swell, long Ease.out settle — UI motion, not particles.
              present.levelScale = p < 0.18
                ? 1 + 0.2 * Ease.out(p / 0.18)
                : 1.2 - 0.2 * Ease.out((p - 0.18) / 0.82);
            }, t => 1 - (1 - t) ** 4).then(ok => {
              if (!ok || !current()) return;
              present.displayProgress = toP;
              present.displayLevel = toL;
              present.levelScale = 1;
            });
          }
        }
        // Capture the old expression before any display snapshot can replace it.
        // Capped faces still acknowledge a clear with the same small pulse.
        const reactions = state.playMode === 'totem-building' ? state.blocks
          .filter(b => b.kind === 'totem'
            && cellsOf(b).some(cell => event.rows.includes(b.row + cell.row)))
          .flatMap(b => {
            const after = event.state.blocks.find(next => next.id === b.id);
            return after ? [{ b, from: b.smile ?? 1, to: after.smile ?? 1 }] : [];
          }) : [];
        if (event.displayBlocks) adopt({ ...state, blocks: event.displayBlocks });
        const scores = collectionScores(event.collected ?? [], event.collectionAward);
        for (const reaction of reactions) {
          reaction.v = viewOf(reaction.b);
          reaction.v.expression = reaction.from;
        }
        const rowOrder = event.rows.slice().sort((a, b) => b - a);
        const godIds = new Set(state.playMode === 'totem-building'
          ? (event.collected ?? []).map(b => b.id) : []);
        const waveLeft = Math.min(...(event.collected ?? []).map(b => b.col));
        const clears = event.blocks.map(b => ({ b, v: viewOf(b), burst: false,
          god: godIds.has(b.id),
          delay: godIds.has(b.id)
            ? (b.col - waveLeft) * 65 + Math.max(0, rowOrder.indexOf(b.row)) * 90
            : Math.abs(b.col + b.len / 2 - COLS / 2) / (COLS / 2) * 70
             + Math.min(3, rowOrder.indexOf(b.row)) * 24 }));
        for (const { v } of clears) v.clearing = true;
        const shrink = 150;
        const normalFlashEnd = 320 + Math.max(0, ...clears.filter(c => !c.god).map(c => c.delay)) - shrink;
        for (const clear of clears) clear.flashEnd = clear.god ? clear.delay + 170 : normalFlashEnd;
        const duration = Math.max(320, ...clears.map(c => c.flashEnd + shrink));
        let celebrated = false;
        if (!await tween(duration, t => {
          const elapsed = t * duration;
          for (const fx of scores) fx.flight = clamp((t - 0.4) / 0.6, 0, 1) ** 4;
          for (const { v, from, to } of reactions) {
            const p = clamp((elapsed - 50) / (duration - 50), 0, 1);
            const blend = p * p * (3 - 2 * p);
            v.expression = from + (to - from) * blend;
            v.evolve = Math.sin(Math.PI * p);
            // Pop on impact, recoil slightly, then settle at the cell size.
            v.s = p < 0.4 ? 1 + 0.16 * Ease.out(p / 0.4)
              : p < 0.8 ? 1.16 - 0.21 * ((p - 0.4) / 0.4)
                : 0.95 + 0.05 * Ease.out((p - 0.8) / 0.2);
          }
          for (const clear of clears) {
            const { b, v, delay, flashEnd } = clear;
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
                if (clear.god && !celebrated) {
                  celebrated = true;
                  celebrateGodClear();
                  sfx('combo', { volume: 0.5 });
                }
                if (first) {
                  const mult = event.award?.mult || 1;
                  sfx('clear', { volume: 0.62, rate: 0.86 });
                  if (mult > 1) sfx('combo', { volume: 0.38, rate: 0.82 });
                }
              }
            }
          }
        }, Ease.lin) || !current()) return false;
        adopt(event.state);
        if (!await finishTotemScores(present, scores, effects, current) || !current()) return false;
        if (event.award?.pts) stackScore(present, event.award, effects);
        return true;
      }
      case 'totem-collect': {
        interruptSquash();
        const collected = event.blocks;
        // Hold contact for a readable arrival cue, then slide full-sized tiles
        // beneath the floor mask before allowing any subsequent board motion.
        adopt({ ...event.state, blocks: [...event.state.blocks, ...collected] });
        for (const b of collected) {
          const v = viewOf(b);
          v.vy = b.row;
          v.s = 1;
          v.clearing = true;
          v.collecting = true;
        }
        const scores = collectionScores(collected, event.award);
        sfx('clear', { volume: 0.62, rate: 0.9 });
        if (!await tween(340, p => {
          // Compress against the floor, stretch on rebound, then settle.
          const squash = p < 0.28 ? 0.24 * Ease.out(p / 0.28)
            : p < 0.65 ? 0.24 - 0.33 * Ease.out((p - 0.28) / 0.37)
              : -0.09 * (1 - Ease.out((p - 0.65) / 0.35));
          for (const b of collected) {
            viewOf(b).sq = p === 1 ? 0 : squash / Math.sqrt(b.height ?? 1);
          }
        }, Ease.lin) || !current()) return false;
        const distance = Math.max(1, ...collected.map(b => ROWS - b.row));
        const duration = 620 + (distance - 1) * 215;
        const steps = Math.ceil(duration / 155);
        if (!await tween(duration, p => {
          for (const fx of scores) fx.flight = clamp((p * duration - (duration - 560)) / 560, 0, 1) ** 4;
          // Smooth each chunk from rest to rest, giving the descent a rhythmic
          // pull without frozen frames or position jumps between beats.
          const phase = p * steps;
          const chunk = Math.floor(phase), local = phase - chunk;
          const blend = local * local * (3 - 2 * local);
          const beat = (chunk + blend) / steps;
          const slide = 0.5 * beat + 0.5 * Ease.in(beat);
          for (const b of collected) {
            const v = viewOf(b);
            v.vy = b.row + (ROWS - b.row) * slide;
          }
        }, Ease.lin) || !current()) return false;
        adopt(event.state);
        return finishTotemScores(present, scores, effects, current);
      }
      case 'totem-drop':
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

  function pickup(block) {
    viewOf(block).slot = 1;
  }

  // Cubic ease-in keeps the hover size, then accelerates into the cell.
  function slotIn(v) {
    const from = v.slot;
    if (from <= 0) return;
    return tween(200, p => { v.slot = from * (1 - p); }, Ease.inCubic);
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
      slotIn(v);
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
    return true;
  }

  return { reset, play, pickup, snapBack, update, viewOf, present, effects,
    get state() { return state; }, get busy() { return busy; } };
}
