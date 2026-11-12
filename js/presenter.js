// Plays detached engine events. This module never imports or invokes game rules.
import { COLS } from './board.js';
import { cellsOf, facesOf } from './block-geometry.js';
import { visualDragCol } from './drag.js';
import { W, CELL, PAD, BX, BH, COLORS, totemPaint, ADULT_LOOKS } from './theme.js';
import { Ease, createEffects } from './fx.js';
import { createScorePresentation, stackScore, bankScore } from './score-fx.js';
import { playSfx } from './audio.js';
import { createMonster, celebrateMonster, updateMonster } from './monster.js';
import { createLevelPresentation } from './level-fx.js';
import { createCollectionPresentation } from './collection-fx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Near-immediate follow: ~95% caught up in 12ms, within one 60Hz frame.
const DRAG_RESPONSE = 400;

export function createPresenter({ boardY = () => 0, collectionY = () => 0, effects = createEffects(), sfx = playSfx,
  appearanceRandom = Math.random } = {}) {
  const views = new Map();
  const present = {
    ...createScorePresentation(), shake: 0, overlayA: 0, drag: null, menu: null,
    hoverKey: null, hoverAmt: {}, landingDust: [], godClearFx: null, levelUpFx: null,
    displayProgress: 0, displayLevel: 1, levelScale: 1, powerButton: false, flyingTotems: [],
    juniorCollection: ADULT_LOOKS.map(() => 0), juniorScales: ADULT_LOOKS.map(() => 1),
    monster: createMonster()
  };
  const { tween, wait } = effects;
  let state, busy = false, generation = 0, lock = 0, motion = 0;
  const level = createLevelPresentation(present, effects);
  const collection = createCollectionPresentation(present, effects, { boardY, collectionY, sfx });

  // Landing feedback keeps writing after its fall returns. A later slide, drop,
  // clear, or rise must invalidate that write or blocks flatten mid-motion.
  function interruptSquash() {
    motion++;
    for (const v of views.values()) { v.sq = 0; v.land = 0; }
  }

  function viewOf(block) {
    if (!views.has(block.id)) views.set(block.id, {
      vx: block.col, vy: block.row, dragVelocity: 0, flash: 0, s: 1, sq: 0, land: 0, slot: 0,
      danger: 0, clearing: false, collecting: false, spawning: false, expression: block.smile ?? 1, evolve: 0,
      // Building identity is authoritative because its collected form is a tool.
      adultVariant: block.adultVariant ?? (block.kind === 'totem'
        ? Math.floor(appearanceRandom() * ADULT_LOOKS.length) : 0)
    });
    return views.get(block.id);
  }

  function adopt(snapshot) {
    state = structuredClone(snapshot);
    const keep = new Set(state.blocks.map(b => b.id));
    // A snapshot is a geometry boundary. Only an explicit animation may offset
    // it; cached views must never retain a removed block's scale or old position.
    for (const b of state.blocks) Object.assign(viewOf(b), {
      vx: b.col, vy: b.row, dragVelocity: 0, s: 1, flash: 0, slot: 0, clearing: false, collecting: false,
      expression: b.smile ?? 1, evolve: 0
    });
    for (const id of views.keys()) if (!keep.has(id)) views.delete(id);
  }

  function reset(snapshot) {
    generation++;
    lock++;
    motion++;
    effects.clear();
    level.reset();
    views.clear();
    adopt(snapshot);
    const powerButton = present.powerButton;
    Object.assign(present, createScorePresentation(), {
      displayScore: state.score, shake: 0, overlayA: state.phase === 'over' ? 1 : 0,
      drag: null, menu: null, hoverKey: null, hoverAmt: {}, landingDust: [], godClearFx: null,
      levelUpFx: null, flyingTotems: [],
      juniorCollection: [...(state.juniorCollection ?? ADULT_LOOKS.map(() => 0))],
      juniorScales: ADULT_LOOKS.map(() => 1),
      displayProgress: state.levelProgress ?? 0,
      displayLevel: state.level ?? 1,
      levelScale: 1, powerButton, monster: createMonster(state.phase === 'over')
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
          ? totemPaint(b.smile, viewOf(b).adultVariant).fill
          : power > 1 && b.kind === 'totem' ? (k % 3 === 0 ? '#ffe3a8' : '#e9ba78') : COLORS[b.color],
        life: 0.55 + Math.random() * 0.35 + (power - 1) * 0.12, rot: Math.random() * 6
      });
    }
  }

  const fallMs = d => 0.75 * (110 + 95 * Math.sqrt(d));
  const TOTEM_STAGGER_MS = 42;

  function celebrateGodClear() {
    const colors = ['#ffdb79', '#fff3cc', '#91d6bd', '#d7a6ff', '#ff9ba8'];
    const fx = { elapsed: 0, scale: 0, confetti: [] };
    for (const side of [-1, 1]) for (let i = 0; i < 28; i++) {
      fx.confetti.push({
        x: side < 0 ? -32 : W + 32,
        y: BH * 0.62 + (Math.random() - 0.5) * 50,
        vx: -side * (180 + Math.random() * 420), vy: -420 - Math.random() * 420,
        size: 7 + Math.random() * 8, rot: Math.random() * Math.PI,
        spin: side * (5 + Math.random() * 8), color: colors[i % colors.length]
      });
    }
    present.godClearFx = fx;
    // One visual clock owns the pop, hold and accelerating scale-only exit.
    // The celebration can finish over subsequent board motion.
    tween(1800, p => {
      fx.elapsed = p * 1800;
      fx.scale = fx.elapsed < 300 ? Ease.outBack(fx.elapsed / 300)
        : fx.elapsed < 1350 ? 1
          : fx.elapsed < 1450 ? 1 + 0.08 * Ease.out((fx.elapsed - 1350) / 100)
            : 1.08 * (1 - Ease.inCubic((fx.elapsed - 1450) / 350));
      if (p === 1 && present.godClearFx === fx) present.godClearFx = null;
    }, Ease.lin);
  }

  async function activatePower(event, current) {
    const totems = state.blocks.filter(b => b.kind === 'totem').map(b => ({
      v: viewOf(b), from: b.smile ?? 1,
      to: event.state.blocks.find(next => next.id === b.id)?.smile ?? 3
    }));
    // Food has vanished. Grow together, then let the adult looks read before departure.
    return await tween(1050, p => {
      const t = clamp(p * 1050 / 650, 0, 1);
      const blend = t * t * (3 - 2 * t);
      for (const { v, from, to } of totems) {
        v.expression = from + (to - from) * blend;
        v.evolve = Math.sin(Math.PI * t);
        v.s = 1 + 0.16 * Math.sin(Math.PI * t);
      }
    }, Ease.lin) && current();
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

  function landed(b, d, { sound = true } = {}) {
    const v = viewOf(b);
    if (sound) sfx('fall', b.kind === 'totem'
      ? { volume: 0.72, rate: 0.88 + Math.random() * 0.16 }
      : { volume: 0.84, rate: 0.92 + Math.random() * 0.1 });
    const amp = Math.min(0.24, 0.12 + 0.035 * d) / Math.sqrt(b.height ?? 1);
    const stamp = motion;
    v.sq = amp;
    landingDust(b);
    v.land = 1;
    tween(225, p => {
      if (stamp !== motion) return;
      v.sq = amp * Ease.damped(p);
      v.land = 1 - p;
    }, Ease.lin);
  }

  async function fall(moves, current, released = false) {
    const items = moves.map(move => {
      const b = state.blocks.find(block => block.id === move.id);
      const v = viewOf(b);
      // Pin the pre-fall row before the first paint of the landing snapshot.
      v.vy = move.from;
      v.spawning = state.playMode === 'totem-building' && b.kind === 'totem' && move.from < 0;
      return { move, b, v, d: move.to - move.from };
    });
    let totemWave = 0, tileLanded = false;
    const bottom = Math.max(...moves.map(move => move.from));
    const results = await Promise.all(items.map(async ({ move, b, v, d }) => {
      const delay = released ? (bottom - move.from) * TOTEM_STAGGER_MS
        : b?.kind === 'totem' ? totemWave++ * TOTEM_STAGGER_MS : 0;
      if (!released && delay && (!await wait(delay) || !current())) return false;
      const duration = fallMs(d), total = duration + (released ? delay : 0);
      if (!await tween(total, t => {
        const p = released ? clamp((t * total - delay) / duration, 0, 1) : t;
        v.vy = move.from + d * Ease.in(p);
        if (p === 1) v.spawning = false;
      }, Ease.lin) || !current())
        return false;
      if (d <= 0) return true;
      // Show contact immediately, then let the compression rebound before the
      // next event can interrupt it. The soft tail can outlive the turn.
      landed(b, d, { sound: b.kind === 'totem' || !tileLanded });
      if (b.kind !== 'totem') tileLanded = true;
      return await wait(90) && current();
    }));
    return results.every(Boolean);
  }

  async function collect(event, current, flights) {
    interruptSquash();
    const mode2 = state.buildingMode === 2;
    const items = event.blocks.map(block => {
      const v = viewOf(block);
      v.clearing = true;
      v.collecting = true;
      return { block: structuredClone(block), view: v };
    });
    if (!await collection.contact(items, current) || !current()) return false;
    flights.push(collection.launch(items, mode2, current));
    adopt(event.state);
    return true;
  }

  async function animate(event, run, holdForSpawn, released = false) {
    const current = () => run === generation;
    switch (event.type) {
      case 'junior-use': {
        present.juniorCollection[event.variant]--;
        if (event.splitBlocks) {
          interruptSquash();
          adopt(event.state);
          sfx('clear');
          const pieces = event.splitBlocks.map(b => viewOf(b));
          return await tween(220, p => {
            for (const v of pieces) v.s = 1 + 0.1 * Math.sin(Math.PI * p);
          }, Ease.lin) && current();
        }
        // Reuse tile departure and growth feedback without awarding tool-removal points.
        return animate({ ...event, type: 'clear', reactionIds: event.blockIds }, run, holdForSpawn);
      }
      case 'slide': {
        interruptSquash();
        const held = viewOf(state.blocks.find(b => b.id === event.id));
        const from = held.vx, velocity = held.dragVelocity;
        adopt(event.state);
        const moved = state.blocks.find(b => b.id === event.id);
        const v = viewOf(moved);
        v.vx = from;
        v.dragVelocity = velocity;
        pickup(moved);
        return snapTo(v, event.to);
      }
      case 'gravity': {
        interruptSquash();
        adopt(event.state);
        return fall(event.moves, current, released);
      }
      case 'clear': {
        celebrateMonster(present.monster, effects.now());
        // Keep the pre-clear snapshot visible until the departing blocks vanish.
        // Feeding Frenzy eats the food first, then reveals the grown-up creatures.
        interruptSquash();
        if (event.godClear) {
          sfx('god-clear');
          celebrateGodClear();
        }
        const progress = level.advance(event.state, holdForSpawn);
        // Capture the old expression before any display snapshot can replace it.
        // Capped faces still acknowledge a clear with the same small pulse.
        const reactions = state.playMode === 'totem-building' && !event.godClear ? state.blocks
          .filter(b => b.kind === 'totem'
            && (event.reactionIds ? event.reactionIds.includes(b.id)
              : cellsOf(b).some(cell => event.rows.includes(b.row + cell.row))))
          .flatMap(b => {
            const after = event.state.blocks.find(next => next.id === b.id);
            return after ? [{ b, from: b.smile ?? 1, to: after.smile ?? 1 }] : [];
          }) : [];
        if (event.displayBlocks) {
          const stages = new Map(state.blocks.map(b => [b.id, b.smile ?? 1]));
          adopt({ ...state, blocks: event.displayBlocks.map(b => event.godClear && b.kind === 'totem'
            ? { ...b, smile: stages.get(b.id) ?? 1 } : b) });
        }
        for (const reaction of reactions) {
          reaction.v = viewOf(reaction.b);
          reaction.v.expression = reaction.from;
        }
        const rowOrder = event.rows.slice().sort((a, b) => b - a);
        const waveTop = Math.min(...event.blocks.map(b => b.row));
        const clears = event.blocks.map(b => ({ b, v: viewOf(b), burst: false,
          delay: event.godClear
            ? (b.row - waveTop) * 55
            : Math.abs(b.col + b.len / 2 - COLS / 2) / (COLS / 2) * 52.5
             + Math.min(3, rowOrder.indexOf(b.row)) * 18 }));
        for (const { v } of clears) v.clearing = true;
        const totemish = b => b.kind === 'totem' || b.face === 'smile';
        if (clears.some(c => !totemish(c.b))) sfx('clear');
        if (clears.some(c => totemish(c.b)) || reactions.length) sfx('totem-clear');
        const shrink = event.godClear ? 150 : 112.5;
        const normalFlashEnd = 240 + Math.max(0, ...clears.map(c => c.delay)) - shrink;
        for (const clear of clears) clear.flashEnd = event.godClear ? clear.delay + 180 : normalFlashEnd;
        const duration = Math.max(240, ...clears.map(c => c.flashEnd + shrink));
        if (!await tween(duration, t => {
          const elapsed = t * duration;
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
                clear.burst = true;
                burstBlock(b);
              }
            }
          }
        }, Ease.lin) || !current()) return false;
        if (event.godClear) {
          const removed = new Set(event.blocks.map(b => b.id));
          adopt({ ...state, blocks: state.blocks.filter(b => !removed.has(b.id)) });
          if (!await activatePower(event, current)) return false;
        }
        adopt(event.state);
        if (!await progress || !current()) return false;
        if (event.godClear && (!await wait(120) || !current())) return false;
        if (event.award?.pts) {
          const { left, right } = state.shape?.rows[0] ?? { left: 0, right: COLS };
          stackScore(present, event.award, effects, {
            x: BX + (left + right) * CELL / 2, y: boardY() + CELL / 2 + 12
          });
        }
        return true;
      }
      case 'totem-drop': {
        interruptSquash();
        sfx('totem-spawn');
        adopt(event.state);
        const b = state.blocks.find(b => b.id === event.id);
        if (b && state.playMode === 'totem-building') {
          // Keep this flag through batched drop snapshots until the arrival lands.
          viewOf(b).spawning = true;
          celebrateMonster(present.monster, effects.now());
          level.release();
        }
        return true;
      }
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
        if (!await tween(shaped ? 240 : 210, p => {
          for (const { v, row } of moving) v.vy = row + 1 - p;
        }, Ease.out) || !current()) return false;
        // One cut per batch, synchronized with the chips and guarded by playback cancellation.
        if (event.trimmed?.length) sfx('trim');
        for (const fragment of event.trimmed ?? []) burstBlock(fragment);
        adopt(event.state);
        return true;
      }
      case 'game-over': {
        interruptSquash();
        present.monster.dead = true;
        if (!await bankScore(present, effects, current) || !current()) return false;
        sfx('fail');
        const top = state.blocks.filter(b => event.blockIds.includes(b.id));
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
    const flights = [];
    busy = true;
    try {
      for (let i = 0; i < result.events.length; i++) {
        const event = result.events[i];
        if (run !== generation) return false;
        if (event.type === 'turn-complete') {
          // Commit geometry before accepting another gesture. Score feedback can
          // outlive this turn, but must never adopt a snapshot after input unlocks.
          adopt(event.state);
          if (lock === mine) busy = false;
          const finished = await Promise.all([bankScore(present, effects, () => run === generation), ...flights]);
          return finished.every(Boolean) && run === generation;
        }
        if (event.type === 'totem-collect') {
          if (!await collect(event, () => run === generation, flights)) return false;
        } else if (!await animate(event, run, event.type === 'clear'
          && event.state.playMode === 'totem-building'
          && result.events.slice(i + 1).some(next => next.type === 'totem-drop'),
          result.events[i - 1]?.type === 'totem-collect')) return false;
      }
      return run === generation;
    } finally {
      if (lock === mine) busy = false;
    }
  }

  function pickup(block) {
    viewOf(block).slot = 1;
  }

  function snapTo(v, col) {
    const from = v.vx, lift = v.slot;
    const distance = col - from;
    const travelMs = 100 + 45 * Math.sqrt(Math.min(4, Math.abs(distance)));
    const settleMs = 90, duration = travelMs + settleMs;
    // Carry forward motion into a monotone Hermite curve. Cap the tangent so a
    // quick release cannot fling a tile through its chosen slot or a neighbor.
    const tangent = distance && v.dragVelocity
      ? clamp(v.dragVelocity * travelMs / 1000 / distance, 0, 3) : 3;
    v.dragVelocity = 0;
    const feedback = lift > 0 || Math.abs(col - from) > 0.001;
    let contacted = false;
    // Position never overshoots into neighbors. A brief compression gives the
    // snap a firm contact beat, and completes before gravity or input resumes.
    return tween(duration, p => {
      const elapsed = p * duration;
      const travel = Math.min(1, elapsed / travelMs);
      const eased = travel * travel * (3 - 2 * travel)
        + tangent * travel * (1 - travel) ** 2;
      v.vx = travel === 1 ? col : from + distance * eased;
      v.slot = lift * (1 - travel * travel * (3 - 2 * travel));
      if (travel === 1) {
        if (!contacted && feedback) sfx('fall', { volume: 0.4, rate: 1.06 });
        contacted = true;
        const settle = p === 1 ? 1 : clamp((elapsed - travelMs) / settleMs, 0, 1);
        v.sq = feedback && settle < 1
          ? 0.085 * Math.sin(settle * Math.PI * 2) * (1 - settle) ** 2 : 0;
      }
    }, Ease.lin);
  }

  async function snapBack(block) {
    if (busy) return false;
    block = state.blocks.find(b => b.id === block.id);
    if (!block) return false;
    interruptSquash();
    const run = generation;
    const mine = ++lock;
    const v = viewOf(block);
    if (v.vx === block.col && v.slot === 0) return true;
    busy = true;
    try {
      return await snapTo(v, block.col);
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
    const drag = present.drag;
    if (drag?.active && state) {
      const b = state.blocks.find(block => block.id === drag.blockId);
      if (b) {
        const v = viewOf(b);
        const dest = visualDragCol(drag);
        const dt = Math.max(0, ms) / 1000;
        const offset = v.vx - dest;
        // Brake immediately on reversal instead of making the pointer fight
        // leftover momentum. The exact spring solution is stable at any FPS.
        if (v.dragVelocity * offset > 0) v.dragVelocity = 0;
        const decay = Math.exp(-DRAG_RESPONSE * dt);
        const impulse = v.dragVelocity + DRAG_RESPONSE * offset;
        const next = dest + (offset + impulse * dt) * decay;
        v.vx = clamp(next, drag.min, drag.max);
        v.dragVelocity = (v.dragVelocity - DRAG_RESPONSE * impulse * dt) * decay;
        if (v.vx !== next || (Math.abs(dest - v.vx) < 0.001 && Math.abs(v.dragVelocity) < 0.02)) {
          v.vx = clamp(dest, drag.min, drag.max);
          v.dragVelocity = 0;
        }
      }
    }
    effects.update(ms);
    if (state) updateMonster(present.monster, state, viewOf, boardY(), effects.now(), ms);
    return true;
  }

  return { reset, play, pickup, snapBack, update, viewOf, present, effects,
    get state() { return state; }, get busy() { return busy; } };
}
