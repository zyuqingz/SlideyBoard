import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { createState } from '../js/sim.js';
import { SHAPES, chooseShape } from '../js/shapes.js';
import { shaped } from '../js/shaped-mode.js';
import { ROWS, COLS, buildGrid, touchingTop } from '../js/board.js';
import { copyBoard, slideRange, hasMoves, computeGravity, fullRows } from '../js/board.js';
import { insertShapedRow, settleShapedBoard } from '../js/shaped-board.js';
import { generateShapedCandidate, generateShapedNextRow } from '../js/shaped-spawn.js';

function seeded(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
const block = (id, row, col, len = 1) => ({ id, row, col, len, color: id % 5 });
const uniform = (left = 2, right = 7) => ({ id: 'fixture', label: 'FIXTURE',
  rows: Array.from({ length: ROWS }, () => ({ left, right })) });
function fixture(blocks, shape = uniform(), extra = {}) {
  return { ...createState(), blocks, shape: structuredClone(shape),
    nextId: Math.max(0, ...blocks.map(b => b.id)) + 1,
    nextRow: [{ col: shape.rows[9].left, len: 1, color: 0 }], ...extra };
}
function fixtureEngine(state) {
  return createEngine({ modeId: 'shaped', random: seeded(19), modes: [{ ...shaped,
    reset(target) { Object.assign(target, structuredClone(state)); }
  }] });
}
function choices(state) {
  return state.blocks.flatMap(b => {
    const [min, max] = slideRange(state, b);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
      .filter(col => col !== b.col).map(col => ({ type: 'slide', id: b.id, col }));
  });
}
function valid(state, settled = false) {
  const ids = new Set(), cells = new Set();
  for (const b of state.blocks) {
    assert.ok(b.row >= 0 && b.row < ROWS);
    assert.ok(Number.isInteger(b.len) && b.len > 0);
    const { left, right } = state.shape.rows[b.row];
    assert.ok(b.col >= left && b.col + b.len <= right, JSON.stringify(b));
    assert.ok(!ids.has(b.id)); ids.add(b.id);
    for (let c = b.col; c < b.col + b.len; c++) {
      const key = `${b.row}:${c}`;
      assert.ok(!cells.has(key)); cells.add(key);
    }
  }
  assert.equal(buildGrid(state).flat().filter(Boolean).length, cells.size);
  if (settled) {
    assert.deepEqual(fullRows(state), []);
    assert.deepEqual(computeGravity(copyBoard(state)), []);
    if (state.phase === 'play') assert.ok(hasMoves(state));
  }
}
function validPreview(state) {
  const { left, right } = state.shape.rows[9];
  const columns = new Set();
  for (const b of state.nextRow) {
    assert.ok(b.col >= left && b.col + b.len <= right);
    assert.ok(b.len > 0 && b.len <= 4);
    for (let c = b.col; c < b.col + b.len; c++) {
      assert.ok(!columns.has(c)); columns.add(c);
    }
  }
  assert.ok(columns.size > 0 && columns.size < right - left);
}

test('all four outlines are valid, selected by RNG, and detached per run', () => {
  assert.equal(SHAPES.length, 4);
  SHAPES.forEach((shape, index) => {
    assert.equal(shape.rows.length, ROWS);
    for (const span of shape.rows) assert.ok(span.left >= 0 && span.right <= COLS && span.right - span.left >= 4);
    const chosen = chooseShape(() => (index + 0.5) / 4);
    assert.deepEqual(chosen, shape);
    chosen.rows[0].left = 99;
    assert.notEqual(shape.rows[0].left, 99);
  });
});

test('rising trims either edge or whole blocks without moving survivors sideways or scoring', () => {
  const shape = uniform(0, 8);
  shape.rows[8] = { left: 2, right: 7 };
  const state = fixture([block(1, 9, 0, 1), block(2, 9, 1, 3), block(3, 9, 5, 3)], shape);
  const motion = insertShapedRow(state, state.nextRow);
  assert.deepEqual(state.blocks.slice(0, 2), [block(2, 8, 2, 2), block(3, 8, 5, 2)]);
  assert.deepEqual(motion.trimmed, [block(1, 8, 0), block(2, 8, 1), block(3, 8, 7, 1)]);
  assert.equal(motion.blocks.find(b => b.id === 2).len, 3);
  assert.equal(state.score, 0);
  assert.equal(state.lines, 0);
  valid(state);
  insertShapedRow(state, state.nextRow);
  assert.equal(state.blocks.find(b => b.id === 2).len, 2, 'wider rows do not regrow blocks');
});

test('a block crossing both boundaries becomes one surviving piece', () => {
  const shape = uniform(0, 8);
  shape.rows[8] = { left: 2, right: 7 };
  const state = fixture([block(1, 9, 0, 8)], shape);
  const motion = insertShapedRow(state, []);
  assert.deepEqual(state.blocks, [block(1, 8, 2, 5)]);
  assert.deepEqual(motion.trimmed, [block(1, 8, 0, 2), block(1, 8, 7, 1)]);
  assert.deepEqual(fullRows(state), [8]);
  assert.deepEqual(settleShapedBoard(state), { cells: 0, lines: 0 }, 'gravity resolves before clearing');
});

test('gravity treats narrowing below as a ledge, and a slide can release the block', () => {
  const shape = uniform(0, 8);
  shape.rows[9] = { left: 2, right: 7 };
  const state = fixture([block(1, 8, 1, 3)], shape);
  assert.deepEqual(computeGravity(state), []);
  assert.equal(state.blocks[0].len, 3);
  state.blocks[0].col = 2;
  assert.deepEqual(computeGravity(state), [{ id: 1, from: 8, to: 9 }]);
  assert.deepEqual(slideRange(state, state.blocks[0]), [2, 4]);
  state.blocks.push(block(2, 9, 6));
  assert.deepEqual(slideRange(state, state.blocks[0]), [2, 3]);
});

test('short rows clear only when all playable cells are filled; scores use width and pre-bump level', () => {
  const state = fixture([block(1, 9, 2, 4), block(2, 8, 5)], uniform(), { lines: 9 });
  const engine = fixtureEngine(state);
  assert.equal(engine.dispatch({ type: 'slide', id: 2, col: 7 }).reason, 'illegal-slide');
  const result = engine.dispatch({ type: 'slide', id: 2, col: 6 });
  const first = result.events.find(e => e.type === 'clear');
  assert.deepEqual(first.rows, [9]);
  assert.deepEqual(first.award, { pts: 50, mult: 1 });
  assert.equal(first.state.level, 2);
  assert.equal(first.state.lines, 10);
  assert.equal(result.events.filter(e => e.type === 'shaped-rise').length, 3);
  valid(result.state, true);
});

test('trimmed cells earn nothing, but a supported row completed by trimming clears normally', () => {
  const shape = uniform(0, 8);
  shape.rows[8] = { left: 2, right: 7 };
  const state = fixture([block(1, 9, 1, 6), block(2, 7, 0)], shape,
    { nextRow: [{ col: 2, len: 1, color: 0 }] });
  const result = fixtureEngine(state).dispatch({ type: 'slide', id: 2, col: 1 });
  const rise = result.events.find(e => e.type === 'shaped-rise');
  assert.equal(rise.state.score, 0);
  assert.ok(rise.trimmed.length);
  const clear = result.events.find(e => e.type === 'clear');
  assert.deepEqual(clear.rows, [8]);
  assert.equal(clear.award.pts, 50);
});

test('top-out occurs after settling before rise, with one rescue move after reaching the top', () => {
  const blocks = Array.from({ length: 9 }, (_, i) => block(i + 1, i + 1, 2));
  const engine = fixtureEngine(fixture([...blocks, block(10, 9, 5)]));
  const first = engine.dispatch({ type: 'slide', id: 10, col: 6 });
  assert.ok(touchingTop(first.state));
  assert.equal(first.state.phase, 'play');
  const move = choices(first.state).find(c => c.id === 10 && c.col === 5);
  const second = engine.dispatch(move);
  assert.equal(second.state.phase, 'over');
  assert.equal(second.state.gameOverReason, 'top-out');
  assert.ok(!second.events.some(e => e.type === 'shaped-rise'));
  assert.equal(engine.dispatch(move).reason, 'game-over');

  const rescue = fixtureEngine(fixture([
    ...Array.from({ length: 9 }, (_, row) => block(row + 1, row, 2)),
    block(10, 9, 2, 4), block(11, 8, 5)
  ]));
  const saved = rescue.dispatch({ type: 'slide', id: 11, col: 6 });
  assert.equal(saved.state.phase, 'play');
  assert.ok(saved.events.some(e => e.type === 'clear'));
});

test('shape-aware candidate and preview search are bounded, deterministic, and nonmutating', () => {
  for (const shape of SHAPES) {
    const state = fixture([block(1, 9, shape.rows[9].left, 2)], shape);
    for (const value of [0, 0.5, 0.999999]) {
      state.nextRow = generateShapedCandidate(state, () => value);
      validPreview(state);
    }
    const before = structuredClone(state);
    const preview = generateShapedNextRow(state, seeded(43));
    assert.deepEqual(preview, generateShapedNextRow(state, seeded(43)));
    assert.deepEqual(state, before);
    validPreview({ ...state, nextRow: preview });
    const copy = copyBoard(state);
    copy.shape.rows[0].left = 99;
    assert.deepEqual(state, before);
  }
});

test('every shape supports deterministic multi-turn play with valid committed previews and snapshots', () => {
  for (let shapeIndex = 0; shapeIndex < SHAPES.length; shapeIndex++) {
    for (const seed of [7, 42, 219]) {
      function random() {
        const rng = seeded(seed);
        let first = true;
        return () => { if (first) { first = false; return (shapeIndex + 0.5) / 4; } return rng(); };
      }
      const a = createEngine({ modeId: 'shaped', random: random() });
      const b = createEngine({ modeId: 'shaped', random: random() });
      assert.equal(a.snapshot().shape.id, SHAPES[shapeIndex].id);
      for (let turn = 0; turn < 30 && a.snapshot().phase === 'play'; turn++) {
        const before = a.snapshot();
        valid(before, true); validPreview(before);
        const moves = choices(before);
        assert.ok(moves.length);
        const command = moves[(turn * 7) % moves.length];
        const result = a.dispatch(command);
        assert.deepEqual(result, b.dispatch(command));
        valid(result.state, true);
        assert.deepEqual(result.state.shape, before.shape);
        for (const event of result.events) valid(event.state);
        const rise = result.events.find(e => e.type === 'shaped-rise');
        if (rise) assert.deepEqual(rise.state.blocks.filter(block => block.id >= before.nextId)
          .map(({ col, len, color }) => ({ col, len, color })), before.nextRow);
        result.state.shape.rows[0].left = 99;
        assert.deepEqual(a.snapshot().shape, before.shape);
      }
    }
  }
});

test('switching from Shaped to Classic removes shape metadata and reproduces a fresh Classic opening', () => {
  let rng = seeded(11);
  const engine = createEngine({ modeId: 'shaped', random: () => rng() });
  assert.ok(engine.snapshot().shape);
  rng = seeded(98);
  const actual = engine.reset('classic');
  const classic = createEngine({ modeId: 'classic', random: seeded(98) });
  assert.deepEqual(actual, classic.snapshot());
  assert.equal(actual.shape, undefined);
  assert.equal(actual.gameOverReason, undefined);
  rng = seeded(13);
  assert.equal(engine.reset('shaped').mode, 'shaped');
});

test('reset rerolls the outline, clears loss metadata, and produces movable openings with constant RNG', () => {
  let value = 0;
  const engine = createEngine({ modeId: 'shaped', random: () => value });
  for (let i = 0; i < SHAPES.length; i++) {
    value = i / 4;
    const state = engine.reset();
    assert.equal(state.shape.id, SHAPES[i].id);
    assert.equal(state.gameOverReason, undefined);
    valid(state, true); validPreview(state);
  }
});

test('an explicit shape persists across resets and options cannot be mutated by the caller', () => {
  for (const shape of SHAPES) {
    const modeOptions = { shapeId: shape.id };
    const engine = createEngine({ modeId: 'shaped', modeOptions, random: seeded(17) });
    assert.equal(engine.snapshot().shape.id, shape.id);
    modeOptions.shapeId = 'random';
    for (let i = 0; i < 2; i++) {
      const state = engine.reset();
      assert.equal(state.shape.id, shape.id);
      valid(state, true);
      validPreview(state);
    }
    assert.equal(engine.reset('classic').shape, undefined);
    assert.equal(engine.reset('shaped').shape.id, shape.id);
  }
  assert.throws(() => createEngine({ modeId: 'shaped', modeOptions: { shapeId: 'missing' } }), /Unknown shape/);
});

test('Random shape selection preserves the default RNG stream and Classic ignores shaped options', () => {
  const random = createEngine({ modeId: 'shaped', random: seeded(31), modeOptions: { shapeId: 'random' } });
  const implicit = createEngine({ modeId: 'shaped', random: seeded(31) });
  assert.deepEqual(random.snapshot(), implicit.snapshot());
  assert.deepEqual(random.reset(), implicit.reset());
  const classic = createEngine({ modeId: 'classic', random: seeded(72), modeOptions: { shapeId: 'diamond' } });
  assert.deepEqual(classic.snapshot(), createEngine({ modeId: 'classic', random: seeded(72) }).snapshot());
});

test('preview search finds surviving preparation and response moves on each shaped opening', () => {
  for (let index = 0; index < SHAPES.length; index++) {
    const rng = seeded(67);
    let first = true;
    const state = createEngine({ modeId: 'shaped', random: () => {
      if (first) { first = false; return (index + 0.5) / 4; }
      return rng();
    } }).snapshot();
    const survives = choices(state).some(move => {
      const next = copyBoard(state);
      next.blocks.find(b => b.id === move.id).col = move.col;
      settleShapedBoard(next);
      if (touchingTop(next)) return false;
      insertShapedRow(next, state.nextRow);
      settleShapedBoard(next);
      return !next.blocks.length || choices(next).some(response => {
        const after = copyBoard(next);
        after.blocks.find(b => b.id === response.id).col = response.col;
        settleShapedBoard(after);
        return !touchingTop(after);
      });
    });
    assert.ok(survives, state.shape.id);
  }
});
