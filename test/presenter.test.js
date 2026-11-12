import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { classic } from '../js/modes.js';
import { createState, createTurnScore, awardRows } from '../js/sim.js';
import { createPresenter } from '../js/presenter.js';
import { createDrag, followDrag, visualDragCol } from '../js/drag.js';
import { insertShapedRow } from '../js/shaped-board.js';
import { clearRows as clearTotemRows, computeGravity as totemGravity, settleBoard, insertRow } from '../js/board.js';
import { spawnBuildingTotem } from '../js/totem-spawn.js';
import { spawnOpeningTotem, resolveTurn } from '../js/turn.js';
import { W, BX, CELL, totemPaint, ADULT_LOOKS, juniorSlot } from '../js/theme.js';
import { BUILDING_LINES_BASE, BUILDING_LINES_STEP, linesToReachLevel } from '../js/play-mode.js';

const buildingLinesTo = level => linesToReachLevel(level, BUILDING_LINES_BASE, BUILDING_LINES_STEP);

function setup({ loss = false } = {}) {
  const initial = { ...createState(), nextId: 20, nextRow: [{ col: 0, len: 1, color: 0 }],
    blocks: loss
      ? [...Array.from({ length: 10 }, (_, row) => ({ id: row + 1, row, col: 0, len: 1, color: 0 })),
        { id: 11, row: 9, col: 4, len: 1, color: 1 }]
      : [{ id: 1, row: 9, col: 0, len: 7, color: 0 },
        { id: 2, row: 8, col: 6, len: 1, color: 1 }]
  };
  const engine = createEngine({ random: () => 0.5,
    modes: [{ ...classic, reset(state) { Object.assign(state, structuredClone(initial)); } }] });
  const presenter = createPresenter();
  presenter.reset(engine.snapshot());
  const result = engine.dispatch(loss ? { type: 'slide', id: 11, col: 5 } : { type: 'slide', id: 2, col: 7 });
  return { engine, presenter, result };
}

async function advance(presenter, ms) {
  presenter.update(ms);
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function drain(presenter, step = 50) {
  const pending = () => presenter.busy || presenter.effects.hasTweens()
    || presenter.present.scoreFx || presenter.present.scoreScale !== 1
    || presenter.present.levelScale !== 1;
  for (let i = 0; i < 1000 && pending(); i++) await advance(presenter, step);
  assert.equal(presenter.busy, false, 'playback must terminate');
  assert.equal(pending(), false, 'score text must finish');
}

test('pickup holds hover scale and slot-in eases toward rest', async () => {
  const { presenter } = setup();
  const b = presenter.state.blocks[1], v = presenter.viewOf(b);
  presenter.pickup(b);
  assert.equal(v.slot, 1);
  const done = presenter.snapBack(b);
  presenter.update(16);
  assert.ok(v.slot > 0.9, 'release eases gently out of the held size');
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(v.slot, 0);
});

test('drag follow catches up within one frame and is refresh-rate independent', () => {
  const positions = [];
  for (const frames of [1, 6, 12]) {
    const { presenter } = setup();
    const b = presenter.state.blocks[1], v = presenter.viewOf(b);
    const drag = presenter.present.drag = { ...createDrag(b.col, 0, 7), blockId: b.id };
    followDrag(drag, -1);
    assert.equal(v.vx, b.col, 'pointer events do not teleport the tile');
    for (let i = 0; i < frames; i++) presenter.update(12 / frames);
    const dest = visualDragCol(drag);
    assert.ok(v.vx > dest && v.vx < b.col);
    assert.ok(v.vx - dest < (b.col - dest) * 0.05, 'at least 95% caught up within 12ms');
    positions.push(v.vx);
  }
  for (const x of positions) assert.ok(Math.abs(x - positions[0]) < 1e-10);
});

test('drag brakes on reversal, respects walls, and freezes with the visual clock', () => {
  const { presenter, engine } = setup();
  const b = presenter.state.blocks[1], v = presenter.viewOf(b);
  const drag = presenter.present.drag = { ...createDrag(b.col, 0, 7), blockId: b.id };
  followDrag(drag, -4);
  presenter.update(16);
  const turning = v.vx;
  assert.ok(v.dragVelocity < 0);
  followDrag(drag, 4);
  presenter.update(16);
  assert.ok(v.vx > turning, 'reversing responds on the very next frame');
  assert.ok(v.dragVelocity > 0);
  presenter.present.menu = 'pause';
  const pose = { ...v };
  presenter.update(1000);
  assert.deepEqual(v, pose);
  presenter.present.menu = null;
  for (const dx of [100, -100, 100]) {
    followDrag(drag, dx);
    for (let i = 0; i < 60; i++) {
      presenter.update(16);
      assert.ok(v.vx >= 0 && v.vx <= 7, 'spring cannot cross a wall');
    }
    assert.equal(v.vx, dx > 0 ? 7 : 0);
    assert.equal(v.dragVelocity, 0);
  }
  presenter.reset(engine.snapshot());
  assert.equal(presenter.present.drag, null);
  assert.equal(presenter.viewOf(b).dragVelocity, 0);
});

test('releasing a moving drag preserves its position and bounds its momentum', async () => {
  for (const velocity of [-25, 8, 100]) {
    const { presenter } = setup();
    const b = presenter.state.blocks[1], v = presenter.viewOf(b);
    v.vx = 5.6;
    v.dragVelocity = velocity;
    presenter.pickup(b);
    const final = structuredClone(presenter.state);
    final.blocks[1].col = 7;
    const done = presenter.play({ accepted: true, events: [
      { type: 'slide', id: b.id, from: b.col, to: 7, state: final },
      { type: 'turn-complete', state: final }
    ] });
    assert.equal(v.vx, 5.6);
    let previous = v.vx;
    for (let i = 0; i < 300 && presenter.busy; i++) {
      await advance(presenter, 1);
      assert.ok(v.vx >= previous && v.vx <= 7, 'release approaches its slot monotonically');
      if (i === 0 && velocity === 8)
        assert.ok(Math.abs((v.vx - previous) * 1000 - velocity) < 0.2, 'release retains forward speed');
      previous = v.vx;
    }
    assert.equal(await done, true);
    assert.equal(v.vx, 7);
    assert.equal(v.dragVelocity, 0);
  }
});

test('slide restores pickup pop after adopt then eases slot', async () => {
  const { presenter, result } = setup();
  const b = presenter.state.blocks[1], v = presenter.viewOf(b);
  presenter.pickup(b);
  const done = presenter.play(result);
  presenter.update(16);
  assert.ok(v.slot > 0.9, 'adopt must not leave the sliding block at rest scale');
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(v.slot, 0);
});

test('release snaps from the preview, seats on the grid, then unlocks input', async () => {
  for (const commit of [false, true]) {
    const cues = [];
    const presenter = createPresenter({ sfx: name => cues.push(name) });
    const initial = { ...createState(), blocks: [{ id: 1, row: 9, col: 3, len: 2, color: 0 }] };
    presenter.reset(initial);
    const b = presenter.state.blocks[0], v = presenter.viewOf(b);
    presenter.pickup(b);
    v.vx = 3.65;
    const final = structuredClone(initial);
    final.blocks[0].col = commit ? 4 : 3;
    const done = commit ? presenter.play({ accepted: true, events: [
      { type: 'slide', id: 1, from: 3, to: 4, state: final },
      { type: 'turn-complete', state: final }
    ] }) : presenter.snapBack(b);
    assert.equal(v.vx, 3.65, 'release does not teleport the block');
    for (let i = 0; i < 10; i++) {
      await advance(presenter, 10);
      assert.ok(v.vx >= 3 && v.vx <= 4, 'snap never crosses a neighboring cell');
      assert.equal(presenter.busy, true);
    }
    await advance(presenter, 40);
    assert.equal(v.vx, commit ? 4 : 3);
    assert.equal(v.slot, 0);
    assert.ok(v.sq > 0, 'contact visibly compresses the block');
    assert.equal(presenter.busy, true, 'contact settles before another gesture');
    assert.deepEqual(cues, ['fall']);
    await advance(presenter, 70);
    assert.ok(v.sq < 0, 'compression releases into a small rebound');
    assert.equal(v.vx, commit ? 4 : 3, 'rebound does not disturb the landing column');
    await drain(presenter, 16);
    assert.equal(await done, true);
    assert.equal(v.sq, 0);
    assert.equal(v.vx, commit ? 4 : 3);
    assert.equal(presenter.effects.hasTweens(), false, 'no slot tween can overwrite a new pickup');
    presenter.pickup(presenter.state.blocks[0]);
    await advance(presenter, 250);
    assert.equal(v.slot, 1);
  }
});

test('snap-back pauses and reset cancels its contact cue and stale writes', async () => {
  const { presenter, engine } = setup();
  const b = presenter.state.blocks[1], v = presenter.viewOf(b);
  presenter.pickup(b);
  v.vx += 0.35;
  const done = presenter.snapBack(b);
  await advance(presenter, 40);
  presenter.present.menu = 'pause';
  const pose = { ...v };
  await advance(presenter, 1000);
  assert.deepEqual(v, pose);
  presenter.reset(engine.snapshot());
  await advance(presenter, 1000);
  assert.equal(await done, false);
  assert.equal(presenter.busy, false);
  assert.equal(presenter.viewOf(b).vx, b.col);
  assert.equal(presenter.viewOf(b).slot, 0);
  assert.equal(presenter.viewOf(b).sq, 0);
});

test('slide and clear playback fires seating and clear foley', async () => {
  const cues = [];
  const initial = { ...createState(), nextId: 20, nextRow: [{ col: 0, len: 1, color: 0 }],
    blocks: [{ id: 1, row: 9, col: 0, len: 7, color: 0 }, { id: 2, row: 8, col: 6, len: 1, color: 1 }] };
  const engine = createEngine({ random: () => 0.5,
    modes: [{ ...classic, reset(state) { Object.assign(state, structuredClone(initial)); } }] });
  const presenter = createPresenter({ sfx: name => cues.push(name) });
  presenter.reset(engine.snapshot());
  const result = engine.dispatch({ type: 'slide', id: 2, col: 7 });
  const done = presenter.play(result);
  await drain(presenter);
  assert.equal(await done, true);
  assert.ok(cues.includes('fall'));
  assert.ok(cues.includes('clear'));
});

test('input unlocks once the board has settled, while the score text is still playing', async () => {
  const { presenter, result } = setup();
  const done = presenter.play(result);
  for (let i = 0; i < 1000 && presenter.busy; i++) await advance(presenter, 16);
  assert.equal(presenter.busy, false);
  assert.ok(presenter.present.scoreFx, 'score text is still on screen');
  assert.equal(presenter.present.displayScore, 0);
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(presenter.present.displayScore, 80);
});

test('score completion cannot replace the board during a new drag', async () => {
  const { presenter, result } = setup();
  const done = presenter.play(result);
  while (presenter.busy) await advance(presenter, 16);
  assert.deepEqual(presenter.state, result.state, 'final snapshot must be adopted before input unlocks');
  const shown = presenter.state;
  const b = shown.blocks[0];
  presenter.present.drag = { blockId: b.id };
  presenter.viewOf(b).vx = b.col + 0.4;
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(presenter.state, shown, 'score-only work must not replace block objects');
  assert.equal(presenter.viewOf(b).vx, b.col + 0.4);
});

test('a new slide and rise survive the previous turn score completion', async () => {
  const { engine, presenter, result } = setup();
  const first = presenter.play(result);
  while (presenter.busy) await advance(presenter, 16);
  const b = engine.snapshot().blocks.find(b => {
    const [min, max] = engine.moveRange(b.id);
    return min !== max;
  });
  assert.ok(b);
  const [min, max] = engine.moveRange(b.id);
  const next = engine.dispatch({ type: 'slide', id: b.id, col: b.col === min ? max : min });
  assert.equal(next.accepted, true);
  assert.ok(next.events.some(e => e.type === 'rise'));
  const second = presenter.play(next);
  await drain(presenter, 16);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(presenter.state, engine.snapshot());
  assert.equal(presenter.present.displayScore, next.state.score, 'each award is banked once');
  for (const block of presenter.state.blocks) {
    const v = presenter.viewOf(block);
    assert.equal(v.vx, block.col);
    assert.equal(v.vy, block.row);
    assert.equal(v.s, 1);
    assert.equal(v.clearing, false);
  }
});

test('late score work cannot roll back an in-progress rise', async () => {
  const { presenter, result } = setup();
  const first = presenter.play(result);
  while (presenter.busy) await advance(presenter, 16);
  // Finish the flight, leaving the score impact/rebound running with input open.
  while (presenter.present.scoreFx) await advance(presenter, 16);
  const final = structuredClone(result.state);
  for (const b of final.blocks) b.row--;
  final.blocks.push({ id: final.nextId++, row: 9, col: 4, len: 1, color: 2 });
  const next = { accepted: true, state: final, events: [
    { type: 'rise', state: final }, { type: 'turn-complete', state: final }
  ] };
  const second = presenter.play(next);
  const incoming = final.blocks.at(-1);
  assert.equal(presenter.viewOf(incoming).vy, 10, 'incoming block begins below the board');
  for (let i = 0; i < 30; i++) {
    await advance(presenter, 16);
    assert.deepEqual(presenter.state.blocks, final.blocks, 'old score work cannot remove the new row');
  }
  await drain(presenter);
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(presenter.viewOf(incoming).vy, 9);
});

test('rapid consecutive turns reconcile every visible block before the next gesture', async () => {
  for (const modeId of ['classic', 'shaped']) for (const playMode of ['standard', 'tetris']) {
    let seed = 731;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const engine = createEngine({ modeId, random, playMode });
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(engine.snapshot());
    const pending = [];
    for (let turn = 0; turn < 12; turn++) {
      const before = engine.snapshot();
      if (before.phase === 'over') break;
      const b = before.blocks.find(b => {
        const [min, max] = engine.moveRange(b.id);
        return min < max;
      });
      if (!b) break;
      const [min, max] = engine.moveRange(b.id);
      const col = b.col === min ? max : min;
      // Simulate releasing a fractional drag position into a legal slide.
      const from = b.col + (col - b.col) * 0.65;
      presenter.viewOf(b).vx = from;
      const result = engine.dispatch({ type: 'slide', id: b.id, col });
      pending.push(presenter.play(result));
      assert.equal(presenter.viewOf(b).vx, from, 'slide starts at the dragged visual position');
      for (let frame = 0; frame < 2000 && presenter.busy; frame++) await advance(presenter, 16);
      assert.equal(presenter.busy, false);
      assert.deepEqual(presenter.state, engine.snapshot(), `${modeId} turn ${turn}`);
      for (const block of presenter.state.blocks) {
        const v = presenter.viewOf(block);
        assert.equal(v.vx, block.col);
        assert.equal(v.vy, block.row);
        assert.equal(v.s, 1);
        assert.equal(v.clearing, false);
      }
    }
    await drain(presenter);
    assert.ok((await Promise.all(pending)).every(Boolean));
    assert.deepEqual(presenter.state, engine.snapshot());
    assert.equal(presenter.present.displayScore, engine.snapshot().score);
  }
});

test('slow and fast playback finish at the same independently completed logical state', async () => {
  for (const step of [16, 250]) {
    const { engine, presenter, result } = setup();
    const final = engine.snapshot();
    const savedEvents = structuredClone(result.events);
    const done = presenter.play(result);
    assert.equal(presenter.state.score, 0);
    assert.equal(final.score, 80);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, final);
    assert.equal(presenter.present.displayScore, final.score);
    assert.deepEqual(engine.snapshot(), final);
    assert.deepEqual(result.events, savedEvents);
    for (const b of presenter.state.blocks) {
      assert.equal(presenter.viewOf(b).vx, b.col);
      assert.equal(presenter.viewOf(b).vy, b.row);
    }
  }
});

test('menus freeze playback and resume it without changing gameplay', async () => {
  const { engine, presenter, result } = setup();
  const done = presenter.play(result);
  await advance(presenter, 30);
  presenter.present.menu = 'pause';
  const time = presenter.effects.now();
  const before = structuredClone(presenter.viewOf(presenter.state.blocks[1]));
  const logical = engine.snapshot();
  await advance(presenter, 10000);
  assert.equal(presenter.effects.now(), time);
  assert.deepEqual(presenter.viewOf(presenter.state.blocks[1]), before);
  assert.deepEqual(engine.snapshot(), logical);
  presenter.present.menu = null;
  await drain(presenter);
  assert.equal(await done, true);
});

test('restart cancels every playback stage and stale continuations cannot change a fresh game', async () => {
  for (const loss of [false, true]) {
    for (const elapsed of [0, 100, 300, 600, 950, 1300, 1800]) {
      const { engine, presenter, result } = setup({ loss });
      const done = presenter.play(result);
      for (let t = 0; t < elapsed; t += 25) await advance(presenter, 25);
      const fresh = engine.reset();
      presenter.reset(fresh);
      const next = engine.dispatch(loss ? { type: 'slide', id: 11, col: 6 } : { type: 'slide', id: 2, col: 7 });
      const nextDone = presenter.play(next);
      await drain(presenter);
      await done; // Cancellation must settle the old promise too.
      assert.equal(await nextDone, true);
      assert.deepEqual(presenter.state, engine.snapshot());
      assert.equal(presenter.present.displayScore, next.state.score);
      assert.equal(presenter.present.overlayA, loss ? 1 : 0);
    }
  }
});

test('separate presenters have independent effects and cancellation', async () => {
  const a = setup(), b = setup();
  const aDone = a.presenter.play(a.result), bDone = b.presenter.play(b.result);
  a.presenter.reset(a.engine.reset());
  assert.equal(await aDone, false);
  await drain(b.presenter);
  assert.equal(await bDone, true);
  assert.equal(b.presenter.present.displayScore, 80);
  assert.equal(a.presenter.present.displayScore, 0);
});

test('restart between tween completion and its microtask cannot revive old work', async () => {
  for (let stage = 0; stage < 12; stage++) {
    const { engine, presenter, result } = setup();
    const done = presenter.play(result);
    for (let i = 0; i < stage; i++) await advance(presenter, 1000);
    presenter.update(1000); // Resolve a tween, but do not yield to its continuation.
    const fresh = engine.reset();
    presenter.reset(fresh);
    await advance(presenter, 1000);
    await done;
    assert.deepEqual(presenter.state, fresh);
    assert.equal(presenter.present.displayScore, 0);
    assert.equal(presenter.present.scoreFx, null);
    assert.equal(presenter.busy, false);
  }
});

function trimmingSetup({ sfx = () => {}, narrow = true } = {}) {
  const initial = { ...createState(), mode: 'shaped', nextId: 4,
    shape: { id: 'fixture', label: 'FIXTURE', rows: Array.from({ length: 10 }, (_, row) =>
      narrow && row === 8 ? { left: 2, right: 7 } : { left: 0, right: 8 }) },
    blocks: [{ id: 1, row: 9, col: 0, len: 1, color: 0 },
      { id: 2, row: 9, col: 1, len: 3, color: 1 },
      { id: 3, row: 9, col: 5, len: 3, color: 2 }],
    nextRow: [{ col: 2, len: 1, color: 3 }] };
  const final = structuredClone(initial);
  const motion = insertShapedRow(final, final.nextRow);
  const result = { accepted: true, state: structuredClone(final), events: [
    { type: 'shaped-rise', ...motion, state: structuredClone(final) },
    { type: 'turn-complete', state: structuredClone(final) }
  ] };
  const presenter = createPresenter({ sfx });
  presenter.reset(initial);
  return { initial, final, result, presenter };
}

test('shaped rise animates original spans, removes chips, and snaps survivor columns without mutating events', async () => {
  for (const step of [16, 250]) {
    const cues = [];
    const { presenter, result, final } = trimmingSetup({ sfx: name => cues.push(name) });
    const saved = structuredClone(result);
    const done = presenter.play(result);
    assert.deepEqual(cues, []);
    assert.equal(presenter.state.blocks.find(b => b.id === 2).col, 1);
    assert.ok(presenter.state.blocks.some(b => b.id === 1));
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(cues, ['trim'], 'multiple discarded spans share one cut cue');
    assert.deepEqual(presenter.state, final);
    assert.ok(!presenter.state.blocks.some(b => b.id === 1));
    for (const b of presenter.state.blocks) {
      assert.equal(presenter.viewOf(b).vx, b.col);
      assert.equal(presenter.viewOf(b).vy, b.row);
    }
    assert.deepEqual(result, saved);
    assert.equal(presenter.present.displayScore, 0);
  }
});

test('a staggered clear keeps every departing block visible until the shared shrink', async () => {
  const initial = { ...createState(), nextId: 30, nextRow: [{ col: 0, len: 1, color: 0 }],
    blocks: [
      { id: 1, row: 9, col: 0, len: 7, color: 0 },
      { id: 2, row: 8, col: 0, len: 1, color: 1 },
      { id: 3, row: 6, col: 1, len: 3, color: 2 }
    ] };
  const engine = createEngine({ random: () => 0.2,
    modes: [{ ...classic, reset(state) { Object.assign(state, structuredClone(initial)); } }] });
  const presenter = createPresenter();
  presenter.reset(engine.snapshot());
  const result = engine.dispatch({ type: 'slide', id: 2, col: 7 });
  const done = presenter.play(result);
  let sawShrink = false;
  for (let i = 0; i < 400 && presenter.busy; i++) {
    presenter.update(16);
    for (let n = 0; n < 12; n++) await Promise.resolve();
    const clearing = presenter.state.blocks.filter(b => presenter.viewOf(b).clearing);
    if (clearing.length < 2) continue;
    const scales = clearing.map(b => presenter.viewOf(b).s);
    if (scales.some(s => s < 1)) {
      sawShrink = true;
      assert.ok(scales.every(s => s < 1.05), 'one block vanished while another was still popping');
    }
    if (scales.some(s => s === 0)) assert.ok(scales.every(s => s < 0.05));
  }
  assert.equal(sawShrink, true);
  await drain(presenter);
  assert.equal(await done, true);
});

test('board trim sound waits for the cut, pauses, and stays silent on untrimmed rises', async () => {
  for (const narrow of [true, false]) {
    const cues = [];
    const { presenter, result } = trimmingSetup({ narrow, sfx: name => cues.push(name) });
    const done = presenter.play(result);
    await advance(presenter, 120);
    assert.deepEqual(cues, []);
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(cues, []);
    presenter.present.menu = null;
    await advance(presenter, 120);
    assert.deepEqual(cues, narrow ? ['trim'] : []);
    await drain(presenter);
    assert.equal(await done, true);
    assert.deepEqual(cues, narrow ? ['trim'] : []);
  }
});

test('shaped trimming freezes on pause and cannot resume stale work after reset', async () => {
  for (const elapsed of [0, 120, 240]) {
    const cues = [];
    const { presenter, result, initial } = trimmingSetup({ sfx: name => cues.push(name) });
    const done = presenter.play(result);
    presenter.present.menu = 'pause';
    const time = presenter.effects.now();
    await advance(presenter, 1000);
    assert.equal(presenter.effects.now(), time);
    presenter.present.menu = null;
    presenter.update(elapsed); // Include reset between tween resolution and continuation.
    presenter.reset(initial);
    await advance(presenter, 1000);
    assert.equal(await done, false);
    assert.deepEqual(cues, [], 'reset cancels the pending trim sound');
    assert.deepEqual(presenter.state, initial);
    assert.equal(presenter.busy, false);
    let chips = 0;
    presenter.effects.eachParticle(() => chips++);
    assert.equal(chips, 0);
  }
});

function totemSetup() {
  const initial = { ...createState(0, 'easy', 'tetris'), mode: 'classic', nextId: 30,
    nextRow: [{ col: 0, len: 1, color: 0 }],
    blocks: [{ id: 1, row: 1, col: 0, len: 1, color: 4, kind: 'totem', height: 3 },
      ...Array.from({ length: 6 }, (_, i) => ({ id: i + 2, row: i + 4, col: 0, len: 1, color: 0 })),
      { id: 20, row: 9, col: 4, len: 1, color: 1 }] };
  const engine = createEngine({ modeId: 'classic', random: () => 0.5,
    modes: [{ ...classic, reset(state) { Object.assign(state, structuredClone(initial)); } }] });
  const presenter = createPresenter();
  presenter.reset(engine.snapshot());
  const result = engine.dispatch({ type: 'slide', id: 20, col: 5 });
  return { initial: engine.snapshot(), presenter, result };
}

function dropSetup() {
  const initial = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    // Force the stacking fallback so playback still covers independent tiles
    // landing in one column even though normal Building drops now spread out.
    shape: { rows: Array.from({ length: 10 }, (_, row) => ({ left: 0, right: row === 0 ? 1 : 8 })) }, blocks: [
    { id: 1, row: 8, col: 0, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 },
    { id: 20, row: 9, col: 0, len: 2, color: 0 }
  ] };
  const final = structuredClone(initial);
  const block = spawnBuildingTotem(final, () => 0);
  const dropped = structuredClone(final);
  const moves = totemGravity(final);
  const result = { accepted: true, state: final, events: [
    { type: 'totem-drop', id: block.id, state: dropped },
    { type: 'gravity', moves, state: final }, { type: 'turn-complete', state: final }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  return { initial, final, result, presenter };
}

test('landing rebounds before a following rise and cancels cleanly on restart', async () => {
  const initial = { ...createState(), blocks: [
    { id: 1, row: 5, col: 2, len: 2, color: 0 }
  ] };
  const landed = structuredClone(initial);
  landed.blocks[0].row = 9;
  const risen = structuredClone(landed);
  risen.blocks[0].row = 8;
  const result = { accepted: true, events: [
    { type: 'gravity', moves: [{ id: 1, from: 5, to: 9 }], state: landed },
    { type: 'rise', state: risen }, { type: 'turn-complete', state: risen }
  ] };
  for (const restart of [false, true]) {
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(initial);
    const done = presenter.play(result);
    const v = presenter.viewOf(initial.blocks[0]);
    await advance(presenter, 225);
    assert.equal(v.vy, 9);
    assert.ok(v.sq > 0 && v.land > 0, 'contact is visible before the next frame');
    const dust = presenter.present.landingDust[0];
    assert.ok(dust, 'landing emits an independent dust burst');
    const dustPose = structuredClone(dust);
    presenter.present.menu = 'pause';
    const pose = { ...v };
    await advance(presenter, 1000);
    assert.deepEqual(v, pose, 'pause freezes the landing reaction');
    assert.deepEqual(dust, dustPose, 'pause also freezes the dust');
    presenter.present.menu = null;
    await advance(presenter, 60);
    assert.ok(v.sq < 0, 'compression rebounds before rise can interrupt');
    assert.equal(presenter.state.blocks[0].row, 9);
    if (restart) {
      presenter.reset(initial);
      assert.equal(presenter.present.landingDust.length, 0, 'restart removes lingering dust');
    } else {
      await advance(presenter, 40);
      assert.equal(v.land, 0, 'rise interrupts the impact highlight');
      assert.ok(presenter.present.landingDust.includes(dust), 'dust survives the following rise');
      assert.ok(dust.progress > 0 && dust.progress < 1, 'dust continues its own fade');
      assert.deepEqual(dust.particles, dustPose.particles, 'dust stays at the original impact location');
    }
    await drain(presenter, 16);
    assert.equal(await done, !restart);
    assert.deepEqual(presenter.state, restart ? initial : risen);
    const finalView = presenter.viewOf(presenter.state.blocks[0]);
    assert.equal(finalView.sq, 0, 'no stale squash writes survive');
    assert.equal(finalView.land, 0, 'no stale impact highlight survives');
    assert.equal(presenter.present.landingDust.length, 0, 'dust is removed after its fade finishes');
  }
});

test('opening totems fall from above the board at level start', async () => {
  const engine = createEngine({ playMode: 'totem-building', random: () => 0,
    modes: [{ ...classic, reset(state, random, options, emit) {
      state.blocks = [8, 9].map((row, i) => ({ id: i + 1, row, col: 0, len: 2, color: 0 }));
      state.nextId = 3;
      spawnOpeningTotem(state, random, emit);
    } }] });
  const opening = engine.opening();
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(opening.events[0].state);
  const done = presenter.play(opening);
  await advance(presenter, 16);
  const v = presenter.viewOf(presenter.state.blocks.find(b => b.kind === 'totem'));
  assert.ok(v.vy < 7, 'the opening face starts its fall above the landing row');
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(v.vy, 7);
  assert.equal(presenter.busy, false);
  assert.deepEqual(presenter.state, engine.snapshot());
});

test('opening clears and collections animate once, pause, and cancel on reset', async () => {
  for (const step of [16, 250, 1000]) {
    const engine = createEngine({ modeId: 'classic', playMode: 'totem-building',
      random: () => 0, modes: [{ ...classic, reset(state, random, options, emit) {
        state.shape = { rows: Array.from({ length: 10 }, (_, row) => ({ left: 0, right: row === 0 ? 1 : 8 })) };
        state.blocks = [{ id: 1, row: 9, col: 1, len: 7, color: 0 }];
        state.nextId = 2;
        spawnOpeningTotem(state, random, emit);
      } }] });
    const opening = engine.opening(), saved = structuredClone(opening);
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(opening.events[0].state);
    const done = presenter.play(opening);
    for (let i = 0; i < 500 && !presenter.present.flyingTotems.length; i++) await advance(presenter, 16);
    assert.ok(presenter.present.flyingTotems.length, 'opening reaches collection feedback');
    presenter.present.menu = 'pause';
    const frozen = structuredClone(presenter.present.flyingTotems);
    await advance(presenter, 1000);
    assert.deepEqual(presenter.present.flyingTotems, frozen);
    presenter.present.menu = null;
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, engine.snapshot());
    assert.equal(presenter.present.displayScore, 0, 'opening collection awards no bonus');
    assert.deepEqual(opening, saved);

    presenter.reset(opening.events[0].state);
    const cancelled = presenter.play(opening);
    await advance(presenter, 16);
    presenter.reset(engine.snapshot());
    await drain(presenter, step);
    assert.equal(await cancelled, false);
    assert.deepEqual(presenter.state, engine.snapshot());
    assert.equal(presenter.present.displayScore, 0);
  }
});

test('real Classic and Shaped openings finish at the engine snapshot', async () => {
  for (const [modeId, shapeId, seed] of [['classic', undefined, 1], ['shaped', 'diamond', 76]]) {
    let rng = seed;
    const random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
    const engine = createEngine({ modeId, playMode: 'totem-building', modeOptions: { shapeId }, random });
    const opening = engine.opening();
    assert.ok(opening.events.some(e => e.type === 'totem-drop'));
    assert.ok(opening.events.some(e => e.type === 'gravity'));
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(opening.events[0].state);
    const done = presenter.play(opening);
    await drain(presenter, 16);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, engine.snapshot());
    assert.equal(presenter.present.displayScore, engine.snapshot().score);
    for (const b of presenter.state.blocks) {
      assert.equal(presenter.viewOf(b).vx, b.col);
      assert.equal(presenter.viewOf(b).vy, b.row);
    }
    engine.reset(undefined, { playMode: 'standard' });
    assert.deepEqual(engine.opening(), { accepted: false, events: [] }, 'reset discards the previous opening');
  }
});

test('multiple totems stagger their falls', async () => {
  const initial = { ...createState(0, 'easy', 'totem-building'), nextId: 100, blocks: [
    { id: 1, row: 7, col: 2, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 },
    { id: 2, row: 8, col: 5, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  const done = presenter.play({ accepted: true, events: [
    { type: 'gravity', moves: initial.blocks.map(b => ({ id: b.id, from: -1, to: b.row })), state: initial },
    { type: 'turn-complete', state: initial }
  ] });
  await advance(presenter, 0);
  await advance(presenter, 16);
  const first = presenter.viewOf(presenter.state.blocks.find(b => b.id === 1));
  const second = presenter.viewOf(presenter.state.blocks.find(b => b.id === 2));
  assert.ok(first.vy > second.vy, 'the lead totem falls before the rest');
  assert.equal(second.vy, -1, 'later totems wait before they start falling');
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(first.vy, 7);
  assert.equal(second.vy, 8);
});

test('a new building totem lands vertically above another as an independent tile', async () => {
  for (const step of [16, 250, 1000]) {
    const { initial, final, result, presenter } = dropSetup();
    const saved = structuredClone(result);
    const done = presenter.play(result);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, final);
    assert.equal(final.blocks.filter(b => b.kind === 'totem').length, 2);
    const totems = final.blocks.filter(b => b.kind === 'totem');
    assert.equal(totems[0].col, totems[1].col);
    assert.equal(totems[1].row, totems[0].row - 1);
    for (const b of totems) assert.equal(presenter.viewOf(b).vy, b.row);
    assert.deepEqual(result, saved);
    assert.deepEqual(initial.blocks[0].height, 1);
  }
});

test('totem rise playback reaches the authoritative state at any speed', async () => {
  for (const step of [16, 250]) {
    const { presenter, result } = totemSetup();
    assert.ok(!result.events.some(e => e.type === 'totem-activate'));
    assert.ok(result.events.some(e => e.type === 'rise'));
    const saved = structuredClone(result);
    const done = presenter.play(result);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, result.state);
    assert.equal(presenter.present.displayScore, result.state.score);
    for (const b of presenter.state.blocks) {
      assert.equal(presenter.viewOf(b).vy, b.row);
      assert.equal(presenter.viewOf(b).vx, b.col);
      assert.equal(presenter.viewOf(b).clearing, false);
    }
    assert.deepEqual(result, saved);
  }
});

function buildingClearSetup(rows = [7], smile = 1) {
  const initial = { ...createState(0, 'easy', 'totem-building'), blocks: [
    { id: 1, row: 7, col: 7, len: 1, height: 1, kind: 'totem', color: 4, smile },
    ...rows.map(row => ({ id: row + 2, row, col: 0, len: 7, color: 0 }))
  ] };
  const final = structuredClone(initial);
  const geometry = clearTotemRows(final, rows);
  const cleared = structuredClone(final);
  const moves = totemGravity(final);
  const result = { accepted: true, state: final, events: [
    { type: 'clear', ...geometry, award: { pts: 0, mult: 1 }, state: cleared },
    ...(moves.length ? [{ type: 'gravity', moves, state: final }] : []),
    { type: 'turn-complete', state: final }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  return { presenter, initial, result };
}

test('building clears leave the totem in place and do not score', async () => {
  const { presenter, result } = buildingClearSetup();
  const saved = structuredClone(result);
  const done = presenter.play(result);
  await drain(presenter);
  assert.equal(await done, true);
  const totem = presenter.state.blocks.find(b => b.kind === 'totem');
  assert.ok(totem);
  assert.equal(totem.smile, 2);
  assert.equal(presenter.present.displayScore, 0);
  assert.deepEqual(result, saved);
});

test('building faces morph and pulse during the clear before gravity starts, including at the cap', async () => {
  for (const stage of [1, 2, 3]) {
    const { presenter, initial, result } = buildingClearSetup([7], stage);
    const saved = structuredClone(result);
    const done = presenter.play(result);
    const v = presenter.viewOf(initial.blocks[0]);
    assert.equal(v.expression, stage, 'the old expression is the starting pose');
    await advance(presenter, 125);
    const target = Math.min(3, stage + 1);
    if (stage < 3) assert.ok(v.expression > stage && v.expression < target);
    else assert.equal(v.expression, 3);
    assert.ok(v.evolve > 0 && v.s > 1, 'even the final stage acknowledges a clear');
    assert.equal(v.vy, 7, 'reaction completes before the totem falls');
    assert.equal(v.clearing, false, 'the totem must not shrink away with the row');
    await advance(presenter, 65);
    assert.ok(v.s < 1 && v.s >= 0.95, 'the impact recoils slightly before settling');
    await drain(presenter);
    assert.equal(await done, true);
    assert.equal(v.expression, target);
    assert.equal(v.evolve, 0);
    assert.equal(v.s, 1);
    assert.deepEqual(presenter.state, result.state);
    assert.deepEqual(result, saved);
  }
});

test('junior colors stay fixed and random adult looks persist through growth and departure', async () => {
  for (let variant = 0; variant < ADULT_LOOKS.length; variant++) {
    assert.deepEqual(totemPaint(1, variant), totemPaint(2, variant));
    assert.deepEqual(totemPaint(1, variant), totemPaint(1.5, variant));
    const { initial, result } = buildingClearSetup([7], 2);
    let rolls = 0;
    const presenter = createPresenter({ sfx: () => {}, appearanceRandom: () => {
      rolls++;
      return (variant + 0.5) / ADULT_LOOKS.length;
    } });
    presenter.reset(initial);
    const done = presenter.play(result);
    await drain(presenter);
    assert.equal(await done, true);
    const grown = presenter.state.blocks.find(b => b.kind === 'totem');
    assert.equal(presenter.viewOf(grown).adultVariant, variant);
    assert.equal(presenter.viewOf(grown).expression, 3);
    const final = { ...structuredClone(presenter.state), blocks: [] };
    const departed = presenter.play({ accepted: true, events: [
      { type: 'totem-collect', blocks: [grown], state: final },
      { type: 'turn-complete', state: final }
    ] });
    await advance(presenter, 340);
    assert.equal(presenter.present.flyingTotems[0].view.adultVariant, variant);
    assert.equal(rolls, 1, 'snapshot adoption and takeoff never reroll the adult');
    await drain(presenter);
    assert.equal(await departed, true);
  }
});

test('junior collection counts matching looks once on arrival and resets with the game', async () => {
  const variants = [0, 2, 2, 3];
  let rolls = 0;
  const presenter = createPresenter({ sfx: () => {},
    appearanceRandom: () => (variants[rolls++] + 0.5) / ADULT_LOOKS.length });
  const initial = { ...createState(0, 'easy', 'totem-building', 2),
    blocks: variants.map((variant, i) => ({ id: i + 1, row: 9, col: i, len: 1,
      height: 1, kind: 'totem', color: 4, smile: 3 })) };
  presenter.reset(initial);
  const final = { ...structuredClone(initial), blocks: [] };
  const result = { accepted: true, events: [
    { type: 'totem-collect', blocks: initial.blocks, state: final },
    { type: 'turn-complete', state: final }
  ] };
  const saved = structuredClone(result);
  const done = presenter.play(result);
  await advance(presenter, 150);
  assert.deepEqual(presenter.present.juniorCollection, [0, 0, 0, 0]);
  presenter.present.menu = 'pause';
  await advance(presenter, 1000);
  assert.deepEqual(presenter.present.juniorCollection, [0, 0, 0, 0]);
  presenter.present.menu = null;
  await advance(presenter, 190);
  assert.deepEqual(presenter.present.juniorCollection, [0, 0, 0, 0], 'takeoff does not unlock the slot');
  await advance(presenter, 620);
  assert.deepEqual(presenter.present.juniorCollection, [1, 0, 2, 1]);
  await advance(presenter, 70);
  assert.deepEqual(presenter.present.juniorScales, [1.22, 1, 1.22, 1.22]);
  await drain(presenter);
  assert.equal(await done, true);
  assert.deepEqual(presenter.present.juniorCollection, [1, 0, 2, 1]);
  assert.deepEqual(presenter.present.juniorScales, [1, 1, 1, 1]);
  assert.equal(rolls, variants.length, 'collection uses the existing sprite identities');
  assert.deepEqual(result, saved, 'cosmetic collection does not mutate engine events');

  presenter.reset(final);
  assert.deepEqual(presenter.present.juniorCollection, [0, 0, 0, 0]);
  rolls = 0;
  presenter.reset(initial);
  const cancelled = presenter.play(result);
  await advance(presenter, 150);
  presenter.reset(final);
  await drain(presenter);
  assert.equal(await cancelled, false);
  assert.deepEqual(presenter.present.juniorCollection, [0, 0, 0, 0], 'cancelled takeoff cannot add stale counts');
});

test('building clear reactions leave untouched totems at rest', async () => {
  const { presenter, initial, result } = buildingClearSetup();
  const untouched = { id: 50, row: 5, col: 3, len: 1, height: 1, kind: 'totem', color: 4, smile: 2 };
  initial.blocks.push(untouched);
  for (const event of result.events) event.state.blocks.push(structuredClone(untouched));
  presenter.reset(initial);
  const done = presenter.play(result);
  await advance(presenter, 200);
  const v = presenter.viewOf(untouched);
  assert.equal(v.expression, 2);
  assert.equal(v.evolve, 0);
  assert.equal(v.s, 1);
  await drain(presenter);
  assert.equal(await done, true);
});

test('building clear playback keeps the totem through every speed', async () => {
  for (const rows of [[7], [7, 8]]) {
    for (const step of [16, 250, 1000]) {
      const { presenter, result } = buildingClearSetup(rows);
      const done = presenter.play(result);
      await drain(presenter, step);
      assert.equal(await done, true);
      assert.ok(presenter.state.blocks.some(b => b.kind === 'totem'));
      for (const b of presenter.state.blocks) {
        assert.equal(presenter.viewOf(b).vy, b.row);
        assert.equal(presenter.viewOf(b).s, 1);
      }
    }
  }
});

test('building clear pause then reset restores the pre-clear totem', async () => {
  const { presenter, initial, result } = buildingClearSetup();
  const done = presenter.play(result);
  await advance(presenter, 200);
  const before = { ...presenter.viewOf(initial.blocks[0]) };
  assert.ok(before.expression > 1 && before.expression < 2);
  presenter.present.menu = 'pause';
  await advance(presenter, 1000);
  assert.deepEqual(presenter.viewOf(initial.blocks[0]), before);
  presenter.present.menu = null;
  presenter.reset(initial);
  await advance(presenter, 1000);
  assert.equal(await done, false);
  assert.deepEqual(presenter.state, initial);
  assert.equal(presenter.viewOf(initial.blocks[0]).expression, 1);
  assert.equal(presenter.viewOf(initial.blocks[0]).evolve, 0);
});

test('totem-building row clear eases the level bar', async () => {
  const tile = { id: 1, row: 9, col: 0, len: 8, color: 0 };
  const initial = { ...createState(0, 'easy', 'totem-building'),
    lines: 0, level: 1, levelProgress: 0, blocks: [tile] };
  const after = { ...structuredClone(initial), blocks: [],
    lines: 1, level: 1, levelProgress: 1 / BUILDING_LINES_BASE };
  const result = { accepted: true, state: after, events: [
    { type: 'clear', rows: [9], blocks: [tile], displayBlocks: [],
      award: { pts: 0, mult: 1 }, state: after },
    { type: 'turn-complete', state: after }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  assert.equal(presenter.present.displayProgress, 0);
  assert.equal(presenter.present.levelScale, 1);
  const done = presenter.play(result);
  await advance(presenter, 80);
  assert.ok(presenter.present.levelScale > 1, 'bar highlights when progress increases');
  assert.ok(presenter.present.displayProgress > 0 && presenter.present.displayProgress < 1 / BUILDING_LINES_BASE,
    'bar eases toward the new fill');
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(presenter.present.displayProgress, 1 / BUILDING_LINES_BASE);
  assert.equal(presenter.present.levelScale, 1);
});

test('Mode 2 collection leaves score and level progress unchanged through takeoff and arrival', async () => {
  const totem = { id: 1, row: 5, col: 3, len: 1, height: 1, kind: 'totem', smile: 3, color: 0 };
  const initial = { ...createState(0, 'easy', 'totem-building', 2),
    blocks: [totem], score: 700, levelProgress: 0.35 };
  const after = structuredClone(initial);
  after.blocks = [];
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  const done = presenter.play({ accepted: true, events: [
    { type: 'totem-collect', blocks: [totem], state: after },
    { type: 'turn-complete', state: after }
  ] });
  await advance(presenter, 340);
  assert.equal(presenter.present.displayProgress, after.levelProgress);
  assert.equal(presenter.present.flyingTotems.length, 1);
  assert.equal(presenter.present.displayLevel, initial.level);
  assert.equal(presenter.present.levelScale, 1);
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(presenter.present.displayScore, after.score);
  assert.equal(presenter.present.displayProgress, initial.levelProgress);
  assert.equal(presenter.present.scoreFx, null);
  assert.equal(presenter.present.juniorCollection.reduce((sum, count) => sum + count, 0), 1);
});

test('level completion fills before drops, then cascades keep HUD progress in sync', async () => {
  for (const step of [16, 250, 1000]) {
    const tile = { id: 1, row: 9, col: 0, len: 8, color: 0 };
    const initial = { ...createState(0, 'easy', 'totem-building'),
      lines: 4, level: 1, levelProgress: 0.8, blocks: [tile] };
    const cleared = { ...structuredClone(initial), blocks: [], lines: 5, level: 2, levelProgress: 0 };
    const cascade = { ...structuredClone(cleared), lines: 6, levelProgress: 0.2 };
    const totem = { id: 2, row: -1, col: 3, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 };
    const dropped = { ...structuredClone(cascade), blocks: [totem] };
    const landed = { ...structuredClone(dropped), blocks: [{ ...totem, row: 8 }] };
    const final = { ...structuredClone(landed), lines: 7, levelProgress: 0.4 };
    const result = { accepted: true, events: [
      { type: 'clear', rows: [9], blocks: [tile], state: cleared },
      { type: 'rise', state: cleared },
      { type: 'clear', rows: [9], blocks: [], state: cascade },
      { type: 'totem-drop', id: 2, state: dropped },
      { type: 'gravity', moves: [{ id: 2, from: -1, to: 8 }], state: landed },
      { type: 'clear', rows: [9], blocks: [], state: final },
      { type: 'turn-complete', state: final }
    ] };
    const saved = structuredClone(result);
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(initial);
    const done = presenter.play(result);
    await advance(presenter, 220);
    assert.equal(presenter.present.displayProgress, 1, 'bar visibly reaches full before resetting');
    assert.equal(presenter.present.displayLevel, 2);
    assert.ok(presenter.present.levelUpFx);
    assert.ok(!presenter.state.blocks.some(b => b.id === totem.id), 'drop waits for the full-bar beat');
    presenter.present.menu = 'pause';
    const frozen = structuredClone(presenter.present);
    await advance(presenter, 1000);
    assert.deepEqual(presenter.present, frozen);
    presenter.present.menu = null;
    await advance(presenter, 180);
    assert.equal(presenter.present.displayProgress, 1, 'bar remains full during the refill');
    assert.ok(!presenter.state.blocks.some(b => b.id === totem.id));
    await advance(presenter, 210);
    await advance(presenter, 120);
    assert.equal(presenter.present.displayProgress, 1, 'extra clears preserve the full bar until spawn');
    await advance(presenter, 120);
    assert.equal(presenter.state.blocks.find(b => b.id === totem.id).col, 3,
      'Junior appears in the authoritative spawn column');
    assert.equal(presenter.viewOf(totem).vy, -1, 'face begins behind the bar');
    assert.equal(presenter.present.displayProgress, 1, 'unfill begins with the drop, never earlier');
    await advance(presenter, 90);
    assert.ok(presenter.present.displayProgress > 0.2 && presenter.present.displayProgress < 1);
    presenter.present.menu = 'pause';
    const unfill = presenter.present.displayProgress;
    await advance(presenter, 1000);
    assert.equal(presenter.present.displayProgress, unfill, 'spawn unfill shares the pause clock');
    presenter.present.menu = null;
    await advance(presenter, 90);
    assert.equal(presenter.present.displayProgress, 0.2, 'unfill retains progress earned before spawning');
    await advance(presenter, 400);
    assert.ok(presenter.present.levelUpFx, 'level-up text remains visible beyond its old lifetime');
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.equal(presenter.present.displayProgress, 0.4);
    assert.equal(presenter.present.displayLevel, 2);
    assert.equal(presenter.present.levelUpFx, null);
    assert.deepEqual(presenter.state, final);
    assert.deepEqual(result, saved);

    for (const elapsed of [220, 400, 850, 940]) {
      presenter.reset(initial);
      const cancelled = presenter.play(result);
      for (let time = 0; time < elapsed; time += 10) await advance(presenter, 10);
      presenter.reset(initial);
      await drain(presenter, step);
      assert.equal(await cancelled, false);
      assert.equal(presenter.present.levelUpFx, null);
      assert.equal(presenter.present.displayLevel, 1);
      assert.equal(presenter.present.displayProgress, 0.8);
    }
  }
});

test('a real Building level-up drop arrives in its column and supports pause and reset', async () => {
  const initial = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    lines: buildingLinesTo(5) - 1, level: 4, levelProgress: (BUILDING_LINES_BASE + 3 * BUILDING_LINES_STEP - 1) / (BUILDING_LINES_BASE + 3 * BUILDING_LINES_STEP),
    blocks: [{ id: 1, row: 9, col: 0, len: 8, color: 0 }] };
  const state = structuredClone(initial), events = [];
  resolveTurn(state, () => 0,
    (type, data) => events.push(structuredClone({ type, ...data, state })),
    () => insertRow(state, [{ col: 0, len: 4, color: 0 }]));
  events.push({ type: 'turn-complete', state: structuredClone(state) });
  const columns = events.filter(e => e.type === 'totem-drop')
    .map(e => e.state.blocks.find(b => b.id === e.id).col);
  assert.equal(columns.length, 1, 'fixture earns one junior from filling the bar');
  const presenter = createPresenter({ sfx: () => {} });
  const arrivals = () => presenter.state.blocks.filter(b => presenter.viewOf(b).spawning);
  for (const reset of [false, true]) {
    presenter.reset(initial);
    const done = presenter.play({ accepted: true, events });
    for (let i = 0; i < 500 && !arrivals().length; i++) await advance(presenter, 16);
    assert.deepEqual(arrivals().map(b => b.col), columns);
    await advance(presenter, 100);
    const positions = () => arrivals().map(b => presenter.viewOf(b).vy);
    const frozen = positions();
    assert.ok(frozen.some(row => row > -1), 'the junior has begun falling into the board');
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(positions(), frozen);
    if (reset) presenter.reset(initial);
    else presenter.present.menu = null;
    await drain(presenter, 16);
    assert.equal(await done, !reset);
    assert.deepEqual(arrivals(), []);
    assert.deepEqual(presenter.state, reset ? initial : state);
  }
});

function collectSetup() {
  const totem = { id: 1, row: 9, col: 4, len: 1, height: 1, kind: 'totem', color: 4, smile: 2 };
  const tile = { id: 2, row: 8, col: 0, len: 2, color: 0 };
  const initial = { ...createState(0, 'easy', 'totem-building'), blocks: [totem, tile] };
  const after = { ...structuredClone(initial), blocks: [tile] };
  const risen = { ...structuredClone(after), blocks: [{ ...tile, row: 7 }] };
  const result = { accepted: true, state: risen, events: [
    { type: 'totem-collect', blocks: [totem], state: after },
    { type: 'rise', state: risen },
    { type: 'turn-complete', state: risen }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  return { presenter, initial, result, totem };
}

function stackedCollectSetup({ sfx = () => {} } = {}) {
  const initial = { ...createState(0, 'easy', 'totem-building'), blocks: [
    ...[9, 8, 7].map((row, i) => ({ id: i + 1, row, col: 4, len: 1,
      height: 1, kind: 'totem', color: 4, smile: i + 1 })),
    { id: 4, row: 6, col: 4, len: 2, color: 0 }
  ] };
  const state = structuredClone(initial), events = [];
  for (let id = 1; id <= 3; id++) {
    const blocks = state.blocks.filter(b => b.id === id);
    state.blocks = state.blocks.filter(b => b.id !== id);
    events.push({ type: 'totem-collect', blocks, state: structuredClone(state) });
    const moves = totemGravity(state);
    events.push({ type: 'gravity', moves, state: structuredClone(state) });
  }
  events.push({ type: 'turn-complete', state: structuredClone(state) });
  const result = { accepted: true, events, state };
  const presenter = createPresenter({ sfx });
  presenter.reset(initial);
  return { presenter, initial, result };
}

test('collection-chain followers play contact feedback once and cancel pending landings', async () => {
  for (const step of [16, 250, 1000]) {
    const cues = [];
    const { presenter, initial, result } = stackedCollectSetup({ sfx: name => cues.push(name) });
    const done = presenter.play(result);
    await advance(presenter, 340);
    await advance(presenter, 150);
    assert.deepEqual(cues, ['totem-clear'], 'contact waits until a follower lands');
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(cues, ['totem-clear']);
    presenter.present.menu = null;
    await advance(presenter, 4);
    assert.deepEqual(cues, ['totem-clear', 'fall']);
    assert.equal(presenter.present.landingDust.length, 1);
    assert.equal(presenter.viewOf(initial.blocks[1]).land, 1);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.equal(cues.filter(name => name === 'fall').length, 6,
      'each totem and each ordinary-tile gravity batch gets one contact cue');
    assert.equal(cues.filter(name => name === 'totem-submit').length, 0);
    assert.equal(cues.filter(name => name === 'totem-clear').length, 3);
  }

  const cues = [];
  const { presenter, initial, result } = stackedCollectSetup({ sfx: name => cues.push(name) });
  const done = presenter.play(result);
  await advance(presenter, 340);
  await advance(presenter, 150);
  presenter.reset(initial);
  await advance(presenter, 2000);
  assert.equal(await done, false);
  assert.deepEqual(cues, ['totem-clear'], 'reset cancels pending contact cues');
  assert.deepEqual(presenter.present.landingDust, []);
});

test('burst cue waits for the rebound and pending cues pause and cancel with playback', async () => {
  for (const cancel of [false, true]) {
    const cues = [];
    const { presenter, initial, result } = stackedCollectSetup({ sfx: name => cues.push(name) });
    const done = presenter.play(result);
    await advance(presenter, 339);
    assert.deepEqual(cues, [], 'compression has no premature burst cue');
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(cues, []);
    if (cancel) {
      presenter.reset(initial);
      await advance(presenter, 2000);
      assert.equal(await done, false);
      assert.deepEqual(cues, []);
    } else {
      presenter.present.menu = null;
      await advance(presenter, 2);
      assert.deepEqual(cues, ['totem-clear']);
      await drain(presenter);
      assert.equal(await done, true);
      assert.equal(cues.filter(name => name === 'totem-clear').length, 3);
    }
  }
});

test('every stacked totem repeats arrival feedback then flies away intact', async () => {
  const { presenter, initial, result } = stackedCollectSetup();
  const saved = structuredClone(result);
  const done = presenter.play(result);
  const cycles = [];
  for (let index = 0; index < 3; index++) {
    const b = presenter.state.blocks.find(b => b.id === index + 1);
    const v = presenter.viewOf(b);
    assert.equal(v.vy, 9, 'next totem reaches the floor before its feedback');
    await advance(presenter, 80);
    assert.equal(v.vy, 9);
    assert.ok(v.sq > 0.2, 'every totem compresses on arrival');
    const compression = v.sq;
    await advance(presenter, 180);
    assert.equal(v.vy, 9);
    assert.ok(v.sq < 0, 'every totem rebounds before bursting');
    const rebound = v.sq;
    await advance(presenter, 80);
    assert.equal(v.sq, 0);
    assert.equal(v.s, 1, 'face stays intact at launch');
    const flying = presenter.present.flyingTotems.find(item => item.block.id === b.id);
    assert.ok(flying.view.flight);
    assert.ok(!presenter.state.blocks.some(tile => tile.id === b.id));
    await advance(presenter, 80);
    assert.ok(flying.view.flight.y < 0, 'whole tile lifts above the floor');
    assert.ok(presenter.viewOf(presenter.state.blocks[0]).vy > initial.blocks[index + 1].row + index,
      'the queue releases the upper stack during the flight');
    cycles.push({ compression, rebound });
    if (index < 2) {
      for (let i = 0; i < 500 && !presenter.viewOf(presenter.state.blocks[0]).collecting; i++)
        await advance(presenter, 1);
      assert.ok(presenter.viewOf(presenter.state.blocks[0]).collecting);
    }
  }
  for (const cycle of cycles.slice(1)) for (const key of Object.keys(cycle)) {
    assert.ok(Math.abs(cycle[key] - cycles[0][key]) < 1e-9,
      `each totem repeats the same ${key} feedback`);
  }
  await drain(presenter, 16);
  assert.equal(await done, true);
  assert.equal(presenter.present.displayScore, 0);
  assert.deepEqual(presenter.state, result.state);
  assert.deepEqual(result, saved, 'playback leaves detached facts intact');
});

test('released stacks accelerate bottom-up without overlap at different frame rates', async () => {
  const poses = [];
  for (const step of [16, 250, 1000]) {
    const { presenter, initial, result } = stackedCollectSetup();
    const done = presenter.play(result);
    await advance(presenter, 340);
    const views = initial.blocks.slice(1).map(b => presenter.viewOf(b));
    for (let elapsed = 0; elapsed < 120;) {
      const dt = Math.min(step, 120 - elapsed);
      await advance(presenter, dt);
      elapsed += dt;
      for (let i = 1; i < views.length; i++) {
        assert.ok(views[i - 1].vy - views[i].vy >= 1 - 1e-9,
          'falling tiles never pass through their support');
      }
    }
    poses.push(views.map(v => v.vy));
    const drops = views.map((v, i) => v.vy - initial.blocks[i + 1].row);
    assert.ok(drops[0] > drops[1] && drops[1] > drops[2] && drops[2] > 0,
      'each higher tile trails the tile underneath instead of moving as a rigid stack');
    const before = views.map(v => v.vy);
    await advance(presenter, 10);
    const during = views.map(v => v.vy);
    await advance(presenter, 10);
    for (let i = 0; i < before.length; i++) {
      assert.ok(views[i].vy - during[i] > during[i] - before[i],
        'released tiles gain downward speed');
    }
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, result.state);
    assert.equal(presenter.present.displayScore, 0);
  }
  for (const pose of poses.slice(1)) assert.deepEqual(pose, poses[0],
    'the same visual time produces the same stack positions');
});

test('stacked collection pauses and cancels during contact, free fall, and flight', async () => {
  for (const elapsed of [260, 970, 1050, 1600]) {
    const { presenter, initial, result } = stackedCollectSetup();
    const done = presenter.play(result);
    await advance(presenter, elapsed);
    presenter.present.menu = 'pause';
    const poses = initial.blocks.map(b => ({ ...presenter.viewOf(b) }));
    const flights = structuredClone(presenter.present.flyingTotems);
    await advance(presenter, 1000);
    assert.deepEqual(initial.blocks.map(b => presenter.viewOf(b)), poses);
    assert.deepEqual(presenter.present.flyingTotems, flights);
    presenter.present.menu = null;
    const time = presenter.effects.now();
    await advance(presenter, 16);
    assert.equal(presenter.effects.now(), time + 16, 'collection clock resumes even after the face bursts');
    presenter.reset(initial);
    await advance(presenter, 2000);
    assert.equal(await done, false);
    assert.deepEqual(presenter.state, initial);
    assert.equal(presenter.present.displayScore, 0);
    assert.equal(presenter.present.scoreScale, 1);
    assert.deepEqual(presenter.present.flyingTotems, []);
    assert.equal(presenter.effects.hasTweens(), false);
  }
});

test('successive Building collections award no bonus at any playback speed', async () => {
  for (const step of [16, 250, 1000]) {
    const initial = { ...createState(0, 'easy', 'totem-building'), nextId: 10,
      nextRow: [{ col: 0, len: 2, color: 0 }], blocks: [
        { id: 1, row: 9, col: 4, len: 1, height: 1, kind: 'totem', smile: 1, color: 4 },
        { id: 2, row: 8, col: 4, len: 1, height: 1, kind: 'totem', smile: 2, color: 4 },
        { id: 3, row: 9, col: 0, len: 2, color: 0 }
      ] };
    const engine = createEngine({ random: () => 0, modes: [{ ...classic,
      reset(state) { Object.assign(state, structuredClone(initial)); }
    }] });
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(engine.snapshot());
    const result = engine.dispatch({ type: 'slide', id: 3, col: 1 });
    assert.equal(result.events.filter(e => e.type === 'totem-collect').length, 2);
    assert.equal(result.state.score, 0);
    const done = presenter.play(result);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.equal(presenter.present.displayScore, result.state.score);
    assert.deepEqual(presenter.state, result.state);
  }
});

test('collected totems curve into matching slots, shrink only after halfway, and never fade', async () => {
  const { presenter, result, totem } = collectSetup();
  const saved = structuredClone(result);
  const done = presenter.play(result);
  await advance(presenter, 80);
  const live = presenter.state.blocks.find(b => b.id === totem.id);
  assert.ok(live, 'the totem remains visible after landing');
  assert.equal(presenter.viewOf(live).vy, 9);
  assert.ok(presenter.state.blocks.some(b => b.id === 2 && b.row === 8),
    'the board must not rise while the totem is still collecting');
  let v = presenter.viewOf(live);
  assert.ok(v.sq > 0.2, 'arrival visibly compresses the body against the floor');
  assert.equal(v.flash, 0);
  assert.equal(v.evolve, 0);
  assert.equal(v.collecting, true, 'collection owns the contact feedback');
  await advance(presenter, 180);
  assert.ok(v.sq < 0, 'the compressed body rebounds into a brief stretch');
  assert.equal(v.vy, 9, 'arrival feedback has its own beat before bursting');
  await advance(presenter, 80);
  v = presenter.present.flyingTotems[0].view;
  assert.equal(v.sq, 0);
  assert.equal(v.s, 1, 'body remains intact at launch');
  const particles = [];
  presenter.effects.eachParticle(p => particles.push({ ...p }));
  assert.equal(particles.length, 0, 'collection does not break into fragments');
  const flight = structuredClone(v.flight);
  presenter.present.menu = 'pause';
  await advance(presenter, 1000);
  const frozen = [];
  presenter.effects.eachParticle(p => frozen.push({ ...p }));
  assert.deepEqual(frozen, particles, 'pause freezes the particle burst');
  assert.deepEqual(v.flight, flight, 'pause freezes whole-tile motion');
  presenter.present.menu = null;
  const slot = juniorSlot(v.adultVariant, 0);
  const dx = slot.x + slot.size / 2 - (BX + (v.vx + 0.5) * CELL);
  const dy = slot.y + slot.size / 2 - (v.vy + 0.5) * CELL;
  let previousScale = v.s;
  for (let i = 0; i < 39; i++) {
    await advance(presenter, 15.5);
    assert.equal(v.vy, 9, 'collected face never sinks');
    assert.ok(v.s > 0, 'the whole face remains drawable during flight');
    if (i === 9) {
      assert.ok(v.flight.y < 0, 'face launches upward');
      assert.ok(Math.abs(v.flight.x * dy - v.flight.y * dx) > 1,
        'face follows a curved path rather than the straight line to its slot');
      assert.ok(Math.abs(v.flight.rotation) < 0.15, 'flight keeps the sprite readable');
    }
    assert.equal(v.flight.alpha, 1, 'the sprite never fades');
    if (i < 20) assert.ok(v.s >= previousScale, 'scale does not decrease before halfway');
    else assert.ok(v.s <= previousScale, 'scale settles down only in the second half');
    previousScale = v.s;
    if (i === 38) {
      assert.ok(Math.hypot(dx - v.flight.x, dy - v.flight.y) < 5, 'flight eases into its exact slot');
    }
    assert.equal(v.sq, 0);
    assert.equal(presenter.state.blocks.find(b => b.id === 2).row, 7,
      'rise runs during flight, without waiting for score feedback');
  }
  await advance(presenter, 15.5);
  assert.equal(v.flight.x, dx);
  assert.equal(v.flight.y, dy);
  assert.equal(v.s, 1, 'arrival matches the board-size collection sprite');
  assert.equal(presenter.present.juniorCollection[v.adultVariant], 1);
  assert.equal(v.vy, 9);
  assert.equal(presenter.present.scoreFx, null, 'collection never creates a score popup');
  assert.equal(presenter.present.displayScore, 0);
  await advance(presenter, 70);
  assert.equal(presenter.present.juniorScales[v.adultVariant], 1.22, 'matching slot bounces on impact');
  assert.equal(presenter.present.displayScore, 0, 'slot impact awards no bonus');
  assert.equal(presenter.present.scoreScale, 1);
  assert.equal(presenter.busy, false, 'input unlocks while the independent flight finishes');
  await drain(presenter);
  assert.equal(await done, true);
  assert.ok(!presenter.state.blocks.some(b => b.kind === 'totem'));
  assert.equal(presenter.state.blocks.find(b => b.id === 2).row, 7);
  assert.deepEqual(result, saved);
});

test('collection flights mature before HUD contact without changing their score or identity', async () => {
  for (const [mode, stage] of [[1, 1], [1, 2], [1, 3], [2, 3]]) {
    const variant = 2;
    const presenter = createPresenter({ sfx: () => {},
      appearanceRandom: () => (variant + 0.5) / ADULT_LOOKS.length });
    const block = { id: 1, row: 9, col: 4, len: 1, height: 1,
      kind: 'totem', color: 4, smile: stage };
    const initial = { ...createState(0, 'easy', 'totem-building', mode), blocks: [block] };
    const final = { ...structuredClone(initial), blocks: [] };
    const result = { accepted: true, events: [
      { type: 'totem-collect', blocks: [block], state: final },
      { type: 'turn-complete', state: final }
    ] };
    const saved = structuredClone(result);
    presenter.reset(initial);
    const done = presenter.play(result);
    await advance(presenter, 340);
    const flying = presenter.present.flyingTotems[0], v = flying.view;
    assert.equal(v.expression, stage, 'takeoff preserves the collected appearance');
    await advance(presenter, 155);
    if (stage < 3) assert.ok(v.expression > stage && v.expression < 3, 'growth is animated');
    else assert.equal(v.expression, 3, 'adults remain mature during flight');
    presenter.present.menu = 'pause';
    const frozen = structuredClone(v);
    await advance(presenter, 1000);
    assert.deepEqual(v, frozen, 'pause freezes maturation along with the flight');
    presenter.present.menu = null;
    await advance(presenter, 310);
    assert.equal(v.expression, 3, 'the full adult look is visible before contact');
    assert.equal(v.adultVariant, variant);
    assert.deepEqual(totemPaint(v.expression, v.adultVariant), totemPaint(3, variant));
    assert.equal(presenter.present.juniorCollection[variant], 0, 'growth does not count as arrival');
    assert.ok(presenter.present.flyingTotems.includes(flying));
    assert.equal(flying.block.smile, stage, 'cosmetic growth leaves collected maturity intact');
    assert.equal(presenter.present.scoreFx, null, 'maturation creates no score popup');
    await advance(presenter, 155);
    assert.equal(v.s, 1);
    assert.equal(presenter.present.juniorCollection[variant], 1);
    await drain(presenter);
    assert.equal(await done, true);
    assert.equal(presenter.present.displayScore, final.score);
    assert.deepEqual(presenter.state, final);
    assert.deepEqual(result, saved, 'maturation never mutates engine events');
  }
});

test('simultaneous collections fill slots while the next collection continues without bonus points', async () => {
  const first = { id: 1, row: 9, col: 2, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 };
  const second = { ...first, id: 2, col: 5, smile: 3 };
  const next = { ...first, id: 3, row: 8, smile: 2 };
  const initial = { ...createState(0, 'easy', 'totem-building'), blocks: [first, second, next] };
  const after = { ...structuredClone(initial), blocks: [next] };
  const landed = { ...structuredClone(after), blocks: [{ ...next, row: 9 }] };
  const final = { ...structuredClone(landed), blocks: [] };
  const result = { accepted: true, events: [
    { type: 'totem-collect', blocks: [first, second], state: after },
    { type: 'gravity', moves: [{ id: 3, from: 8, to: 9 }], state: landed },
    { type: 'totem-collect', blocks: landed.blocks, state: final },
    { type: 'turn-complete', state: final }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  const done = presenter.play(result);
  assert.equal(presenter.present.scoreFx, null);
  await advance(presenter, 340);
  await advance(presenter, 619);
  assert.equal(presenter.present.displayScore, 0);
  assert.equal(presenter.present.flyingTotems.length, 2);
  assert.equal(presenter.present.juniorCollection.reduce((sum, count) => sum + count, 0), 0);
  await advance(presenter, 1);
  assert.equal(presenter.present.juniorCollection.reduce((sum, count) => sum + count, 0), 2);
  assert.deepEqual(presenter.present.flyingTotems, []);
  assert.equal(presenter.present.displayScore, 0);
  await advance(presenter, 90);
  assert.equal(presenter.busy, true);
  assert.equal(presenter.present.scoreScale, 1);
  await drain(presenter);
  assert.equal(await done, true);
  assert.equal(presenter.present.juniorCollection.reduce((sum, count) => sum + count, 0), 3);
  assert.equal(presenter.present.displayScore, 0);
  assert.equal(presenter.present.scoreFx, null);
});

test('detached flights survive a new turn without restoring old board state, and reset cancels them', async () => {
  for (const cancel of [false, true]) {
    const { presenter, initial, result } = collectSetup();
    const first = presenter.play(result);
    await advance(presenter, 340);
    assert.equal(presenter.present.flyingTotems.length, 1);
    const flying = presenter.present.flyingTotems[0];
    assert.ok(!presenter.state.blocks.some(b => b.id === flying.block.id));
    await advance(presenter, 210);
    assert.equal(presenter.busy, false);
    const moved = structuredClone(result.state);
    moved.blocks[0].col = 3;
    const second = presenter.play({ accepted: true, events: [
      { type: 'slide', id: 2, from: 0, to: 3, state: moved },
      { type: 'turn-complete', state: moved }
    ] });
    await advance(presenter, 60);
    assert.ok(flying.view.flight.y < 0);
    const flight = structuredClone(flying.view);
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(flying.view, flight);
    if (cancel) {
      presenter.reset(initial);
      await advance(presenter, 2000);
      assert.equal(await first, false);
      assert.equal(await second, false);
      assert.deepEqual(presenter.present.flyingTotems, []);
      assert.equal(presenter.present.displayScore, 0);
      assert.deepEqual(presenter.state, initial);
    } else {
      presenter.present.menu = null;
      await drain(presenter);
      assert.equal(await first, true);
      assert.equal(await second, true);
      assert.deepEqual(presenter.state, moved);
      assert.equal(presenter.present.displayScore, 0);
      assert.deepEqual(presenter.present.flyingTotems, []);
    }
  }
});

function godClearSetup({ shaped = false, mixed = false } = {}) {
  const initial = { ...createState(0, 'easy', 'totem-building'), blocks:
    Array.from({ length: shaped ? 5 : 8 }, (_, i) => {
      const col = i + (shaped ? 2 : 0);
      return { id: col + 1, row: 8, col, len: 1,
        height: 1, kind: 'totem', color: 4, smile: col % 3 + 1 };
    }).reverse() };
  if (shaped) initial.shape = { rows: Array.from({ length: 10 }, () => ({ left: 2, right: 7 })) };
  initial.blocks.push({ id: 21, row: 9, col: shaped ? 2 : 0, len: shaped ? 5 : 8, color: 0 });
  initial.blocks.push({ id: 22, row: 7, col: shaped ? 6 : 7, len: 1, color: 1 });
  if (mixed) initial.blocks.push({ id: 20, row: 7, col: shaped ? 2 : 0,
    len: 1, height: 1, kind: 'totem', color: 4, smile: 1 });
  const final = structuredClone(initial);
  const result = { accepted: true, events: [] };
  const turn = createTurnScore();
  settleBoard(final, (type, data) => {
    if (type === 'clear') data.award = awardRows(final, data.rows, turn);
    result.events.push(structuredClone({ type, ...data, state: final }));
  });
  result.events.push({ type: 'turn-complete', state: structuredClone(final) });
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  return { initial, final, result, presenter };
}

test('feeding frenzy clears food, then grows creatures before dropping and collecting them', async () => {
  for (const step of [16, 250, 1000]) {
    const { result, presenter } = godClearSetup();
    const saved = structuredClone(result);
    const done = presenter.play(result);
    const totems = presenter.state.blocks.filter(b => b.kind === 'totem');
    for (const b of totems) {
      const v = presenter.viewOf(b);
      assert.equal(v.expression, b.smile);
      assert.equal(v.vy, 8);
      assert.equal(v.clearing, false);
    }
    await advance(presenter, 325);
    const evolving = totems.find(b => b.smile === 1);
    assert.equal(presenter.viewOf(evolving).expression, 1, 'food clears before growth begins');
    assert.ok(totems.every(b => presenter.viewOf(b).expression === b.smile));
    await advance(presenter, 115);
    assert.ok(presenter.state.blocks.every(b => b.kind === 'totem'), 'food is gone before adulthood');
    assert.equal(presenter.viewOf(evolving).expression, 1);
    await advance(presenter, 325);
    assert.ok(presenter.viewOf(evolving).expression > 1 && presenter.viewOf(evolving).expression < 3);
    assert.ok(presenter.viewOf(evolving).evolve > 0);
    assert.ok(totems.every(b => presenter.viewOf(b).s > 1));
    await advance(presenter, 325);
    assert.ok(totems.every(b => presenter.viewOf(b).expression === 3));
    assert.ok(presenter.state.blocks.every(b => !presenter.viewOf(b).clearing), 'hold grown-up looks after the meal');
    await advance(presenter, 400);
    assert.ok(totems.every(b => presenter.viewOf(b).vy === 8 && !presenter.viewOf(b).clearing));
    assert.ok(presenter.state.blocks.every(b => b.kind === 'totem'));
    assert.equal(presenter.present.scoreFx, null);
    assert.ok(presenter.state.blocks.every(b => b.kind === 'totem'), 'meal and growth finish before gravity');
    assert.ok(totems.every(b => presenter.viewOf(b).vy === 8));
    await advance(presenter, 160);
    await advance(presenter, 100);
    assert.ok(presenter.viewOf(totems[0]).vy > 8, 'totems now fall into the cleared board');
    assert.equal(presenter.present.scoreFx, null, 'growth creates no score popup');
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.equal(presenter.present.displayScore, 0);
    assert.equal(presenter.state.blocks.length, 0);
    assert.deepEqual(result, saved);
  }
});

test('god clear wipes ordinary blocks top-to-bottom on both maps and powers up off-row totems', async () => {
  for (const shaped of [false, true]) {
    const { presenter, result, final } = godClearSetup({ shaped, mixed: true });
    const done = presenter.play(result);
    const celebration = presenter.present.godClearFx;
    assert.ok(celebration);
    assert.ok(celebration.confetti.some(p => p.vx > 0), 'left cannon fires inward');
    assert.ok(celebration.confetti.some(p => p.vx < 0), 'right cannon fires inward');
    assert.ok(celebration.confetti.every(p => p.x < 0 || p.x > W), 'cannons start off-screen');
    const totems = presenter.state.blocks.filter(b => b.kind === 'totem');
    assert.ok(totems.every(b => presenter.viewOf(b).expression === b.smile));
    const first = presenter.viewOf(presenter.state.blocks.find(b => b.id === 22));
    const last = presenter.viewOf(presenter.state.blocks.find(b => b.id === 21));
    await advance(presenter, 40);
    assert.ok(first.s > 1, 'top row begins the pop even at the right edge');
    assert.equal(last.s, 1, 'bottom row waits for the wave');
    await advance(presenter, 300);
    assert.equal(first.s, 0, 'top tile vanishes before the bottom tile');
    assert.ok(last.s > 0);
    assert.equal(presenter.busy, true, 'subsequent events wait for every tile');
    assert.ok(totems.every(b => presenter.viewOf(b).s === 1 && presenter.viewOf(b).vy === b.row),
      'creatures remain suspended at their original sizes throughout the wipe');
    assert.ok(totems.every(b => presenter.viewOf(b).expression === b.smile));
    assert.equal(presenter.present.godClearFx, celebration, 'only one celebration per batch');
    await drain(presenter);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, final);
    assert.equal(presenter.present.godClearFx, null);
  }
});

test('god clear text overshoots, holds, and scales away; pause and reset own all feedback', async () => {
  const { presenter, initial, result } = godClearSetup();
  const done = presenter.play(result);
  const fx = presenter.present.godClearFx;
  assert.equal(fx.scale, 0);
  await advance(presenter, 180);
  assert.ok(fx.scale > 1, 'entrance has a nonlinear overshoot');
  presenter.present.menu = 'pause';
  const frozen = structuredClone(fx);
  await advance(presenter, 1000);
  assert.deepEqual(fx, frozen, 'confetti and text pause with the wave');
  presenter.present.menu = null;
  await advance(presenter, 120);
  assert.equal(fx.scale, 1);
  await advance(presenter, 1050);
  assert.equal(fx.scale, 1, 'text holds at readable size');
  await advance(presenter, 100);
  assert.equal(fx.scale, 1.08, 'exit anticipates before shrinking');
  await advance(presenter, 175);
  assert.ok(fx.scale > 0 && fx.scale < 1);
  await advance(presenter, 175);
  assert.equal(fx.scale, 0);
  assert.equal(presenter.present.godClearFx, null);
  await drain(presenter);
  assert.equal(await done, true);

  presenter.reset(initial);
  const cancelled = presenter.play(result);
  await advance(presenter, 200);
  assert.ok(presenter.present.godClearFx);
  presenter.reset(initial);
  await advance(presenter, 2000);
  assert.equal(await cancelled, false);
  assert.equal(presenter.present.godClearFx, null);
  assert.deepEqual(presenter.state, initial);
  assert.equal(presenter.present.displayScore, 0);
});

test('power-mode wipe and pre-fall hold pause and cancel without releasing totems', async () => {
  for (const elapsed of [180, 440, 765, 1490]) {
    const { presenter, initial, result } = godClearSetup();
    const done = presenter.play(result);
    for (let time = 0; time < elapsed; time += 10) await advance(presenter, 10);
    const poses = presenter.state.blocks.map(b => ({ ...presenter.viewOf(b) }));
    presenter.present.menu = 'pause';
    await advance(presenter, 2000);
    assert.deepEqual(presenter.state.blocks.map(b => ({ ...presenter.viewOf(b) })), poses);
    presenter.reset(initial);
    await advance(presenter, 3000);
    assert.equal(await done, false);
    assert.deepEqual(presenter.state, initial);
    assert.equal(presenter.present.godClearFx, null);
    assert.equal(presenter.present.displayScore, 0);
  }
});

test('collection feedback and particles pause and cancel cleanly', async () => {
  for (const bursting of [false, true]) {
    const { presenter, initial, result, totem } = collectSetup();
    const done = presenter.play(result);
    await advance(presenter, bursting ? 340 : 160);
    if (bursting) await advance(presenter, 200);
    const pose = { ...presenter.viewOf(totem) };
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(presenter.viewOf(totem), pose);
    presenter.reset(initial);
    await advance(presenter, 1000);
    assert.equal(await done, false);
    assert.deepEqual(presenter.state, initial);
    assert.equal(presenter.viewOf(totem).collecting, false);
    let particles = 0;
    presenter.effects.eachParticle(() => particles++);
    assert.equal(particles, 0, 'reset removes the collection burst');
    assert.equal(presenter.present.displayScore, 0);
    assert.deepEqual(presenter.present.flyingTotems, []);
  }
});

test('collection slot impact pauses and reset cancels its rebound', async () => {
  for (const elapsed of [35, 100]) {
    const { presenter, initial, result } = collectSetup();
    const done = presenter.play(result);
    await advance(presenter, 340);
    await advance(presenter, 620);
    await advance(presenter, elapsed);
    const scales = presenter.present.juniorScales.slice();
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(presenter.present.juniorScales, scales);
    assert.equal(presenter.present.scoreScale, 1);
    assert.equal(presenter.present.displayScore, 0);
    presenter.reset(initial);
    await advance(presenter, 1000);
    assert.equal(await done, false);
    assert.equal(presenter.present.displayScore, 0);
    assert.equal(presenter.present.scoreScale, 1);
    assert.ok(presenter.present.juniorScales.every(scale => scale === 1));
    assert.ok(presenter.present.juniorCollection.every(count => count === 0));
  }
});

function detachedTotemSetup() {
  const initial = { ...createState(), blocks: [
    { id: 1, row: 7, col: 6, len: 2, height: 3, kind: 'totem', color: 4,
      cells: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }] },
    { id: 2, row: 9, col: 0, len: 6, color: 0 }] };
  const final = structuredClone(initial);
  const geometry = clearTotemRows(final, [9]);
  const cleared = structuredClone(final);
  const moves = totemGravity(final);
  const result = { accepted: true, state: final, events: [
    { type: 'clear', rows: [9], ...geometry, award: { pts: 80, mult: 1 }, state: cleared },
    { type: 'gravity', moves, state: final },
    { type: 'turn-complete', state: final }
  ] };
  const presenter = createPresenter();
  presenter.reset(initial);
  return { presenter, initial, result };
}

test('only in-row Totem cells flash; leftover cells stay as smiling tiles', async () => {
  const { presenter, result } = detachedTotemSetup();
  const saved = structuredClone(result);
  const done = presenter.play(result);
  const smiles = presenter.state.blocks.filter(b => b.face === 'smile');
  const clearing = presenter.state.blocks.filter(b => b.kind === 'totem');
  assert.equal(smiles.length, 1);
  assert.equal(smiles[0].cells.length, 2);
  assert.equal(clearing.length, 2);
  for (const b of smiles) {
    assert.equal(presenter.viewOf(b).clearing, false);
  }
  for (const b of clearing) assert.equal(presenter.viewOf(b).clearing, true);
  await advance(presenter, 100);
  for (const b of smiles) {
    assert.equal(presenter.viewOf(b).flash, 0);
    assert.equal(presenter.viewOf(b).s, 1);
    assert.equal(presenter.viewOf(b).vy, b.row);
  }
  assert.ok(clearing.every(b => presenter.viewOf(b).flash > 0));
  await drain(presenter);
  assert.equal(await done, true);
  assert.ok(presenter.state.blocks.every(b => b.kind !== 'totem'));
  assert.ok(presenter.state.blocks.some(b => b.face === 'smile'));
  assert.deepEqual(result, saved);
});

test('leftover Totem tiles pause, cancel cleanly, and match at fast speeds', async () => {
  for (const step of [16, 250, 1000]) {
    const { presenter, result } = detachedTotemSetup();
    const done = presenter.play(result);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, result.state);
  }
  const { presenter, initial, result } = detachedTotemSetup();
  const done = presenter.play(result);
  await advance(presenter, 100);
  const leftover = presenter.state.blocks.find(b => b.face === 'smile' && b.row === 7);
  const before = { ...presenter.viewOf(leftover) };
  presenter.present.menu = 'pause';
  await advance(presenter, 1000);
  assert.deepEqual(presenter.viewOf(leftover), before);
  presenter.reset(initial);
  await advance(presenter, 1000);
  assert.equal(await done, false);
  assert.deepEqual(presenter.state, initial);
  let particles = 0;
  presenter.effects.eachParticle(() => particles++);
  assert.equal(particles, 0);
});

test('totem playback pauses and reset cancels activation, clear, and incoming-drop continuations', async () => {
  for (const elapsed of [0, 150, 350, 600, 950, 1300, 1700, 2100]) {
    const { presenter, result, initial } = totemSetup();
    const done = presenter.play(result);
    presenter.present.menu = 'pause';
    const time = presenter.effects.now();
    await advance(presenter, 1000);
    assert.equal(presenter.effects.now(), time);
    presenter.present.menu = null;
    for (let t = 0; t < elapsed; t += 25) await advance(presenter, 25);
    presenter.update(100);
    presenter.reset(initial);
    await advance(presenter, 1000);
    await done;
    assert.deepEqual(presenter.state, initial);
    assert.equal(presenter.busy, false);
    assert.equal(presenter.present.scoreFx, null);
  }
});

test('foley cues fire for falls, clears, totems, god clear, submit, and failure', async () => {
  const cues = [];
  const sfx = name => cues.push(name);
  const tile = { id: 1, row: 9, col: 0, len: 7, color: 0 };
  const totem = { id: 2, row: 8, col: 7, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 };
  const presenter = createPresenter({ sfx });

  const dropped = { ...createState(0, 'easy', 'totem-building'), blocks: [{ ...totem, row: 8 }] };
  presenter.reset({ ...dropped, blocks: [{ ...totem, row: 3 }] });
  let done = presenter.play({ accepted: true, events: [
    { type: 'totem-drop', state: dropped },
    { type: 'gravity', moves: [{ id: 2, from: 3, to: 8 }], state: dropped },
    { type: 'turn-complete', state: dropped }
  ] });
  await drain(presenter);
  assert.equal(await done, true);
  assert.ok(cues.includes('totem-spawn'));
  assert.ok(cues.includes('fall'));

  cues.length = 0;
  const smiling = { ...totem, row: 9, smile: 2 };
  const beforeClear = { ...createState(0, 'easy', 'totem-building'), blocks: [tile, { ...totem, row: 9 }] };
  const afterClear = { ...createState(0, 'easy', 'totem-building'), blocks: [smiling] };
  presenter.reset(beforeClear);
  done = presenter.play({ accepted: true, events: [
    { type: 'clear', rows: [9], blocks: [tile], state: afterClear },
    { type: 'turn-complete', state: afterClear }
  ] });
  await drain(presenter);
  assert.equal(await done, true);
  assert.ok(cues.includes('clear'));
  assert.ok(cues.includes('totem-clear'));

  cues.length = 0;
  const god = godClearSetup();
  const godCues = [];
  const watching = createPresenter({ sfx: name => godCues.push(name) });
  watching.reset(structuredClone(god.initial));
  done = watching.play(structuredClone(god.result));
  await drain(watching);
  assert.equal(await done, true);
  assert.ok(godCues.includes('god-clear'));
  assert.ok(godCues.includes('clear'));
  assert.ok(godCues.indexOf('god-clear') < godCues.indexOf('clear'));

  cues.length = 0;
  const collected = collectSetup();
  const collectCues = [];
  const collectWatch = createPresenter({ sfx: name => collectCues.push(name) });
  collectWatch.reset(structuredClone(collected.initial));
  done = collectWatch.play(structuredClone(collected.result));
  await drain(collectWatch);
  assert.equal(await done, true);
  assert.ok(collectCues.includes('totem-clear'));
  assert.ok(!collectCues.includes('totem-submit'));

  cues.length = 0;
  const live = { ...createState(), blocks: [tile] };
  const over = { ...structuredClone(live), phase: 'over' };
  presenter.reset(live);
  done = presenter.play({ accepted: true, events: [
    { type: 'game-over', blockIds: [1], state: over },
    { type: 'turn-complete', state: over }
  ] });
  await drain(presenter);
  assert.equal(await done, true);
  assert.ok(cues.includes('fail'));
});
