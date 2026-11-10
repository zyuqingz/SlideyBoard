import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { classic } from '../js/modes.js';
import { COLS, ROWS, buildGrid, fullRows, slideRange, touchingTop } from '../js/board.js';
import { createState, createTurnScore, awardRows, rise, setupClassic } from '../js/sim.js';
import { computeGravity } from '../js/board.js';

function seeded(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

function fixture(blocks, extra = {}) {
  return { ...createState(), blocks, nextId: Math.max(...blocks.map(b => b.id), 0) + 1,
    nextRow: [{ col: 0, len: 1, color: 0 }], ...extra };
}

function fixtureEngine(state) {
  return createEngine({ random: seeded(19), modes: [{ ...classic,
    reset(target) { Object.assign(target, structuredClone(state)); }
  }] });
}

const block = (id, row, col, len = 1) => ({ id, row, col, len, color: id % 5 });

test('reset owns fresh state and reproduces a seeded opening after a played turn', () => {
  let random = seeded(7);
  const engine = createEngine({ modeId: 'classic', best: 400, random: () => random() });
  const b = engine.snapshot().blocks.find(b => {
    const [min, max] = engine.moveRange(b.id);
    return min !== max;
  });
  const [min, max] = engine.moveRange(b.id);
  engine.dispatch({ type: 'slide', id: b.id, col: b.col === min ? max : min });
  const best = engine.snapshot().best;
  random = seeded(9);
  assert.deepEqual(engine.reset(), createEngine({ modeId: 'classic', best, random: seeded(9) }).snapshot());
});

test('mode resets isolate best scores and options and reject invalid setup without erasing state', () => {
  const engine = createEngine({ modeId: 'classic', best: 12345, random: seeded(42) });
  assert.equal(engine.reset('shaped').best, 0);
  const config = { best: 700, modeOptions: { shapeId: 'diamond' } };
  assert.equal(engine.reset('shaped', config).bestAtStart, 700);
  config.modeOptions.shapeId = 'corridor';
  assert.equal(engine.reset().shape.id, 'diamond');
  assert.throws(() => engine.reset('totem'), /Unknown game mode/);
  assert.equal(engine.reset('classic').best, 12345);
  const shaped = engine.reset('shaped');
  assert.equal(shaped.best, 700);
  assert.equal(shaped.shape.id, 'diamond');
  assert.throws(() => engine.reset('shaped', { modeOptions: { shapeId: 'missing' } }), /Unknown shape/);
  assert.deepEqual(engine.snapshot(), shaped);
});

test('engine validates commands without changing state or consuming randomness', () => {
  let calls = 0;
  const engine = createEngine({ random: () => { calls++; return 0.5; } });
  const before = engine.snapshot(), count = calls, b = before.blocks[0];
  for (const command of [null, { type: 'bogus' }, { type: 'slide', id: -1, col: 0 },
    ...[NaN, Infinity, -1, COLS, 0.5, b.col].map(col => ({ type: 'slide', id: b.id, col }))]) {
    assert.equal(engine.dispatch(command).accepted, false);
    assert.deepEqual(engine.snapshot(), before);
  }
  assert.equal(calls, count);
  const collision = fixtureEngine(fixture([block(1, 9, 0), block(2, 9, 2)]));
  assert.equal(collision.dispatch({ type: 'slide', id: 1, col: 3 }).accepted, false);
});

test('one command resolves cascades, combo, level change and rise without a renderer', () => {
  const engine = createEngine({ random: () => 0.2, modes: [{ ...classic,
    reset(target) { Object.assign(target, structuredClone(fixture([
      block(1, 9, 0, 7), block(2, 8, 6), block(3, 8, 0, 4),
      block(4, 7, 0, 8), block(5, 6, 4, 4)
    ], { lines: 9 }))); }
  }] });
  const result = engine.dispatch({ type: 'slide', id: 2, col: 7 });
  assert.equal(result.accepted, true);
  assert.equal(result instanceof Promise, false);
  assert.deepEqual(result.events.map(e => e.type),
    ['slide', 'gravity', 'clear', 'gravity', 'clear', 'rise', 'rise', 'rise', 'turn-complete']);
  assert.equal(result.state.score, 80 + 160 + 480);
  assert.equal(result.state.lines, 12);
  assert.equal(result.state.level, 2);
  assert.deepEqual(result.events.filter(e => e.type === 'clear').map(e => e.award.mult), [2, 3]);
  assert.equal(result.events.find(e => e.type === 'clear').blocks.length, 3);
  assert.equal(result.events.find(e => e.type === 'rise').state.blocks.length, 1);
  assert.deepEqual(engine.snapshot(), result.state);
});

test('top-row loss is resolved before rise; later commands are rejected', () => {
  const tower = Array.from({ length: ROWS }, (_, r) => block(r + 1, r, 0));
  const engine = fixtureEngine(fixture([...tower, block(11, 9, 4)]));
  const result = engine.dispatch({ type: 'slide', id: 11, col: 5 });
  assert.deepEqual(result.events.map(e => e.type), ['slide', 'game-over', 'turn-complete']);
  assert.equal(result.state.phase, 'over');
  assert.equal(engine.dispatch({ type: 'slide', id: 11, col: 6 }).reason, 'game-over');
  assert.equal(engine.moveRange(11), null);
});

test('a top block can be rescued by clearing; rise reaching the top allows the next slide', () => {
  const tower = Array.from({ length: ROWS - 1 }, (_, i) => block(i + 1, i + 1, 0));
  const engine = fixtureEngine(fixture([...tower, block(10, 9, 4)]));
  const result = engine.dispatch({ type: 'slide', id: 10, col: 5 });
  assert.equal(result.state.phase, 'play');
  assert.ok(touchingTop(result.state));
  const rescue = fixtureEngine(fixture([
    ...Array.from({ length: ROWS - 1 }, (_, r) => block(r + 1, r, 0)),
    block(10, 9, 0, 7), block(11, 8, 6)
  ]));
  const saved = rescue.dispatch({ type: 'slide', id: 11, col: 7 });
  assert.equal(saved.state.phase, 'play');
  assert.ok(saved.events.some(e => e.type === 'clear'));
});

test('one remaining tile row spawns one row, with or without a totem', () => {
  const oneRow = createEngine({ random: () => 0.2, modes: [{ ...classic,
    reset(target) { Object.assign(target, structuredClone(fixture([
      block(1, 9, 0, 3)
    ], { nextRow: [{ col: 0, len: 2, color: 1 }] }))); }
  }] });
  const thinned = oneRow.dispatch({ type: 'slide', id: 1, col: 1 });
  assert.equal(thinned.accepted, true);
  assert.equal(thinned.state.phase, 'play');
  assert.equal(thinned.events.filter(e => e.type === 'rise').length, 1);

  const withTotem = createEngine({ random: () => 0.2, playMode: 'tetris', modes: [{ ...classic,
    reset(target) { Object.assign(target, structuredClone(fixture([
      { id: 1, row: 7, col: 0, len: 1, height: 3, kind: 'totem', color: 4 },
      block(2, 9, 4, 3)
    ], { playMode: 'tetris', totemsEnabled: true,
      nextRow: [{ col: 2, len: 2, color: 1 }] }))); }
  }] });
  const ignored = withTotem.dispatch({ type: 'slide', id: 2, col: 5 });
  assert.equal(ignored.accepted, true);
  assert.equal(ignored.events.filter(e => e.type === 'rise').length, 1);
});

test('clearing the board spawns three rows so play can continue', () => {
  const engine = createEngine({ random: () => 0.2, modes: [{ ...classic,
    reset(target) { Object.assign(target, structuredClone(fixture([
      block(1, 9, 0, 7), block(2, 8, 6)
    ], { nextRow: [{ col: 0, len: 3, color: 1 }] }))); }
  }] });
  const result = engine.dispatch({ type: 'slide', id: 2, col: 7 });
  assert.equal(result.accepted, true);
  assert.equal(result.state.phase, 'play');
  assert.equal(result.events.filter(e => e.type === 'rise').length, 3);
  const occupied = new Set(result.state.blocks.map(b => b.row));
  assert.equal(occupied.size, 3);
  assert.ok(result.state.blocks.length > 0);
  assert.ok(engine.moveRange(result.state.blocks[0].id));
});

test('snapshots and events cannot mutate engine state or each other', () => {
  const engine = fixtureEngine(fixture([block(1, 8, 0)]));
  const initial = engine.snapshot();
  initial.blocks[0].col = 8;
  assert.equal(engine.snapshot().blocks[0].col, 0);
  const result = engine.dispatch({ type: 'slide', id: 1, col: 1 });
  const actual = engine.snapshot();
  result.events[0].state.blocks[0].col = 7;
  result.events[0].state.nextRow[0].col = 7;
  result.state.blocks.length = 0;
  assert.deepEqual(engine.snapshot(), actual);
  assert.notEqual(result.events[1].state.blocks[0].col, 7);
  assert.doesNotThrow(() => JSON.stringify(result.events));
});

test('the default mode is Shaped and Classic is last in the menu', () => {
  const engine = createEngine({ random: () => 0.5 });
  assert.equal(engine.snapshot().mode, 'shaped');
  assert.deepEqual(engine.modes.map(m => m.id), ['shaped', 'classic']);
});

test('Tetris locks the map to Classic', () => {
  const engine = createEngine({ random: () => 0.5, modeId: 'shaped', playMode: 'tetris' });
  assert.equal(engine.snapshot().mode, 'classic');
  assert.equal(engine.snapshot().playMode, 'tetris');
  assert.equal(engine.reset('shaped').mode, 'classic');
  const standard = engine.reset('shaped', { playMode: 'standard' });
  assert.equal(standard.playMode, 'standard');
  assert.equal(standard.mode, 'shaped');
});

test('a new mode owns its turn policy and is discoverable without renderer changes', () => {
  const practice = { ...classic, id: 'practice', label: 'PRACTICE',
    reset(state) { Object.assign(state, fixture([block(1, 9, 0)])); },
    resolveTurn() {} // no rise or loss in this test mode
  };
  const engine = createEngine({ modes: [classic, practice], modeId: 'practice' });
  assert.deepEqual(engine.modes.map(m => m.id), ['classic', 'practice']);
  const result = engine.dispatch({ type: 'slide', id: 1, col: 1 });
  assert.deepEqual(result.events.map(e => e.type), ['slide', 'turn-complete']);
  assert.equal(result.state.blocks.length, 1);
  assert.equal(result.state.mode, 'practice');
  assert.throws(() => engine.reset('missing'), /Unknown game mode/);
  assert.equal(engine.snapshot().mode, 'practice');
});

// Independent copy of the pre-refactor logical sequence, without its awaits.
function legacyTurn(state, command, random) {
  state.blocks.find(b => b.id === command.id).col = command.col;
  state.hasMoved = true;
  const turn = createTurnScore();
  function settle() {
    for (;;) {
      computeGravity(state);
      const rows = fullRows(state);
      if (!rows.length) return;
      state.blocks = state.blocks.filter(b => !rows.includes(b.row));
      awardRows(state, rows, turn);
    }
  }
  settle();
  if (touchingTop(state)) {
    state.newBest = state.score > state.bestAtStart && state.score > 0;
    state.phase = 'over';
  } else {
    const incoming = state.blocks.length ? 1 : 3;
    for (let i = 0; i < incoming; i++) { rise(state, random); settle(); }
    if (state.phase === 'play' && !state.blocks.some(b => b.kind !== 'totem')) {
      const extra = state.blocks.length ? 1 : 3;
      for (let i = 0; i < extra; i++) { rise(state, random); settle(); }
    }
  }
}

test('seeded multi-turn games match the previous Classic rules exactly', () => {
  for (const seed of [3, 17, 42]) {
    const random = seeded(seed);
    const engine = createEngine({ modeId: 'classic', random: seeded(seed), best: 500 });
    const expected = createState(500);
    setupClassic(expected, random);
    expected.mode = 'classic';
    for (let turn = 0; turn < 40 && expected.phase === 'play'; turn++) {
      const choices = [];
      for (const b of expected.blocks) {
        const [min, max] = slideRange(expected, b);
        for (let col = min; col <= max; col++) if (col !== b.col)
          choices.push({ type: 'slide', id: b.id, col });
      }
      if (!choices.length) break;
      const command = choices[(turn * 7) % choices.length];
      legacyTurn(expected, command, random);
      const result = engine.dispatch(command);
      const { gameOverReason, ...actual } = result.state;
      if (expected.phase === 'over') assert.equal(gameOverReason, 'top-out');
      assert.deepEqual(actual, expected, `seed ${seed}, turn ${turn}`);
      assert.equal(fullRows(result.state).length, 0);
      const grid = buildGrid(result.state);
      assert.equal(grid.flat().filter(Boolean).length, result.state.blocks.reduce((n, b) => n + b.len, 0));
    }
  }
});
