import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { classic } from '../js/modes.js';
import { createState } from '../js/sim.js';
import { createPresenter } from '../js/presenter.js';
import { insertShapedRow } from '../js/shaped-board.js';
import { clearRows as clearTotemRows, computeGravity as totemGravity } from '../js/board.js';
import { spawnTotemLayer } from '../js/totem-spawn.js';

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
    || presenter.present.scoreFx || presenter.present.scoreScale !== 1;
  for (let i = 0; i < 1000 && pending(); i++) await advance(presenter, step);
  assert.equal(presenter.busy, false, 'playback must terminate');
  assert.equal(pending(), false, 'score text must finish');
}

test('slide and clear playback emit matching sfx cues', async () => {
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
  assert.ok(cues.includes('slide'));
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

function trimmingSetup() {
  const initial = { ...createState(), mode: 'shaped', nextId: 4,
    shape: { id: 'fixture', label: 'FIXTURE', rows: Array.from({ length: 10 }, (_, row) =>
      row === 8 ? { left: 2, right: 7 } : { left: 0, right: 8 }) },
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
  const presenter = createPresenter();
  presenter.reset(initial);
  return { initial, final, result, presenter };
}

test('shaped rise animates original spans, removes chips, and snaps survivor columns without mutating events', async () => {
  for (const step of [16, 250]) {
    const { presenter, result, final } = trimmingSetup();
    const saved = structuredClone(result);
    const done = presenter.play(result);
    assert.equal(presenter.state.blocks.find(b => b.id === 2).col, 1);
    assert.ok(presenter.state.blocks.some(b => b.id === 1));
    await drain(presenter, step);
    assert.equal(await done, true);
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

test('shaped trimming freezes on pause and cannot resume stale work after reset', async () => {
  for (const elapsed of [0, 120, 240]) {
    const { presenter, result, initial } = trimmingSetup();
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

function stackingSetup() {
  const initial = { ...createState(0, 'easy', 'totem-building'), blocks: [
    { id: 1, row: 7, col: 4, len: 1, height: 3, kind: 'totem', color: 4 }
  ] };
  const final = structuredClone(initial);
  const { ids } = spawnTotemLayer(final, () => 0);
  const result = { accepted: true, state: final, events: [
    { type: 'totem-stack', ids, state: final }, { type: 'turn-complete', state: final }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  return { initial, final, result, presenter };
}

test('stacked caps fall from above while the existing pole stays fixed, then merge on landing', async () => {
  for (const step of [16, 250, 1000]) {
    const { initial, final, result, presenter } = stackingSetup();
    const saved = structuredClone(result);
    const done = presenter.play(result);
    const cap = presenter.state.blocks.find(b => b.id !== 1);
    assert.equal(presenter.viewOf(cap).vy, -1);
    assert.deepEqual(presenter.state.blocks.find(b => b.id === 1), initial.blocks[0]);
    await advance(presenter, 100);
    assert.ok(presenter.viewOf(cap).vy > -1 && presenter.viewOf(cap).vy < cap.row);
    assert.equal(presenter.viewOf(initial.blocks[0]).vy, 7);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, final);
    assert.equal(presenter.viewOf(final.blocks[0]).vy, 6);
    assert.deepEqual(result, saved);
  }
});

test('stacked cap flight freezes on pause and cannot rejoin after a reset', async () => {
  for (const elapsed of [100, 1000]) {
    const { initial, result, presenter } = stackingSetup();
    const done = presenter.play(result);
    await advance(presenter, 80);
    const cap = presenter.state.blocks.find(b => b.id !== 1);
    const before = { ...presenter.viewOf(cap) };
    presenter.present.menu = 'pause';
    await advance(presenter, 1000);
    assert.deepEqual(presenter.viewOf(cap), before);
    presenter.present.menu = null;
    presenter.update(elapsed);
    presenter.reset(initial);
    await advance(presenter, 1000);
    assert.equal(await done, false);
    assert.deepEqual(presenter.state, initial);
    assert.equal(presenter.busy, false);
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

function buildingClearSetup(rows = [7]) {
  const initial = { ...createState(0, 'easy', 'totem-building'), blocks: [
    { id: 1, row: 5, col: 7, len: 1, height: 5, kind: 'totem', color: 4 },
    ...rows.map(row => ({ id: row + 2, row, col: 0, len: 7, color: 0 }))
  ] };
  const final = structuredClone(initial);
  const geometry = clearTotemRows(final, rows);
  const cleared = structuredClone(final);
  const moves = totemGravity(final);
  const result = { accepted: true, state: final, events: [
    { type: 'clear', ...geometry, award: { pts: rows.length * 80, mult: 1 }, state: cleared },
    { type: 'gravity', moves, state: final },
    { type: 'turn-complete', state: final }
  ] };
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(initial);
  return { presenter, initial, result };
}

test('building clears keep surviving faces visible and drop only sections above each gap', async () => {
  const { presenter, result } = buildingClearSetup();
  const saved = structuredClone(result);
  const done = presenter.play(result);
  const faces = presenter.state.blocks.filter(b => b.kind === 'totem');
  assert.equal(faces.length, 5, 'the entire tower remains visible at the start of a clear');
  const kept = faces.filter(b => b.row !== 7);
  const cleared = faces.find(b => b.row === 7);
  const normal = presenter.state.blocks.find(b => b.kind !== 'totem');
  await advance(presenter, 100);
  assert.ok(presenter.viewOf(cleared).flash > 0);
  for (const b of kept) {
    const v = presenter.viewOf(b);
    assert.equal(v.flash, 0);
    assert.equal(v.s, 1);
    assert.equal(v.vy, b.row);
  }
  await advance(presenter, 220);
  assert.equal(presenter.viewOf(cleared).s, presenter.viewOf(normal).s,
    'totem tiles use the normal blocks’ shared shrink window');
  assert.ok(presenter.viewOf(cleared).s < 1);
  await advance(presenter, 80);
  assert.equal(presenter.state.blocks.length, 4, 'only surviving tower faces remain during collapse');
  for (const b of kept) assert.equal(presenter.viewOf(b).vy, b.row, 'no jump before falling');
  await advance(presenter, 100);
  for (const b of kept) {
    const v = presenter.viewOf(b);
    assert.equal(v.s, 1);
    if (b.row < 7) assert.ok(v.vy > b.row && v.vy < b.row + 1);
    else assert.equal(v.vy, b.row, 'faces below the gap stay fixed');
  }
  await drain(presenter);
  assert.equal(await done, true);
  assert.deepEqual(presenter.state, result.state);
  assert.deepEqual(result, saved);
});

test('building clear playback reconciles top, bottom, multiple, and full clears at any speed', async () => {
  for (const rows of [[5], [9], [6, 8], [5, 6, 7, 8, 9]]) {
    for (const step of [16, 250, 1000]) {
      const { presenter, result } = buildingClearSetup(rows);
      const done = presenter.play(result);
      const faces = presenter.state.blocks.filter(b => b.kind === 'totem');
      assert.equal(faces.length, 5);
      for (const b of faces) assert.equal(presenter.viewOf(b).clearing, rows.includes(b.row));
      await drain(presenter, step);
      assert.equal(await done, true);
      assert.deepEqual(presenter.state, result.state);
      for (const b of presenter.state.blocks) {
        assert.equal(presenter.viewOf(b).vy, b.row);
        assert.equal(presenter.viewOf(b).s, 1);
      }
    }
  }
});

test('building collapse pauses and cannot restore the shortened tower after reset', async () => {
  const { presenter, initial, result } = buildingClearSetup();
  const done = presenter.play(result);
  await advance(presenter, 400);
  await advance(presenter, 80);
  const face = presenter.state.blocks.find(b => b.row === 5);
  const before = { ...presenter.viewOf(face) };
  presenter.present.menu = 'pause';
  await advance(presenter, 1000);
  assert.deepEqual(presenter.viewOf(face), before);
  presenter.present.menu = null;
  presenter.update(1000);
  presenter.reset(initial);
  await advance(presenter, 1000);
  assert.equal(await done, false);
  assert.deepEqual(presenter.state, initial);
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

test('only in-row Totem cells flash; off-row faces detach and burst independently', async () => {
  const { presenter, result } = detachedTotemSetup();
  const saved = structuredClone(result);
  const done = presenter.play(result);
  const pieces = presenter.state.blocks.filter(b => b.kind === 'totem');
  assert.equal(pieces.length, 4);
  for (const b of pieces) assert.equal(presenter.viewOf(b).clearing, b.row === 9);
  const offRow = pieces.filter(b => b.row !== 9);
  await advance(presenter, 100);
  for (const b of offRow) {
    assert.equal(presenter.viewOf(b).flash, 0);
    assert.equal(presenter.viewOf(b).s, 1);
    assert.equal(presenter.viewOf(b).vy, b.row);
  }
  assert.ok(pieces.filter(b => b.row === 9).every(b => presenter.viewOf(b).flash > 0));
  await advance(presenter, 170);
  for (const b of offRow) {
    const v = presenter.viewOf(b);
    assert.equal(v.flash, 0);
    assert.equal(v.s, 1);
    assert.equal(v.detached, true);
    assert.notEqual(v.vx, b.col);
    assert.notEqual(v.vy, b.row);
    assert.notEqual(v.rotation, 0);
  }
  let bursts = 0;
  const spawn = presenter.effects.spawnParticle;
  presenter.effects.spawnParticle = fields => { bursts++; spawn(fields); };
  await advance(presenter, 400);
  assert.ok(bursts > offRow.length * 3, 'detached faces use a denser burst than ordinary blocks');
  for (const b of offRow) {
    assert.equal(presenter.viewOf(b).s, 0);
    assert.ok(presenter.viewOf(b).vy > b.row, 'gravity brings the tumbling face below its launch position');
  }
  await drain(presenter);
  assert.equal(await done, true);
  assert.deepEqual(presenter.state.blocks, []);
  assert.deepEqual(result, saved);
});

test('detached Totem playback pauses, cancels cleanly, and matches at fast speeds', async () => {
  for (const step of [16, 250, 1000]) {
    const { presenter, result } = detachedTotemSetup();
    const done = presenter.play(result);
    await drain(presenter, step);
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, result.state);
  }
  const { presenter, initial, result } = detachedTotemSetup();
  const done = presenter.play(result);
  await advance(presenter, 270);
  const debris = presenter.state.blocks.find(b => b.kind === 'totem' && b.row === 7);
  const before = { ...presenter.viewOf(debris) };
  presenter.present.menu = 'pause';
  await advance(presenter, 1000);
  assert.deepEqual(presenter.viewOf(debris), before);
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
