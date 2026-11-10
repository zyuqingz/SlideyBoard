import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { createState } from '../js/sim.js';
import { classic } from '../js/modes.js';
import { shaped } from '../js/shaped-mode.js';
import { buildGrid as totemGrid, computeGravity as totemGravity, slideRange as totemSlideRange,
  fullRows as totemFullRows, clearRows as clearTotemRows, chooseTotemRows,
  settleBoard, copyBoard } from '../js/board.js';
import { cellsOf } from '../js/block-geometry.js';
import { spawnTotem } from '../js/totem-spawn.js';
import { SHAPES } from '../js/shapes.js';
import { insertShapedRow } from '../js/shaped-board.js';
import { generateNextRow } from '../js/spawn.js';
import { generateShapedNextRow } from '../js/shaped-spawn.js';

const block = (id, row, col, len = 1) => ({ id, row, col, len, color: 0 });
const pole = (id, row, col, height) => ({ ...block(id, row, col), kind: 'totem', height });
const piece = (id, row, col, rows) => ({ ...block(id, row, col, rows[0].length),
  kind: 'totem', height: rows.length,
  cells: rows.flatMap((line, r) => [...line].flatMap((cell, c) => cell === '#' ? [{ row: r, col: c }] : [])) });
function seeded(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
function fixture(blocks) {
  return { ...createState(), totemsEnabled: true, blocks, nextId: 100, nextRow: [{ col: 0, len: 1, color: 0 }] };
}
function engineFor(state) {
  return createEngine({ modeId: 'classic', random: seeded(123), modes: [{ ...classic,
    reset(target) { Object.assign(target, structuredClone(state)); }
  }] });
}
function valid(state) {
  const cells = new Set(), ids = new Set();
  for (const b of state.blocks) {
    assert.ok(!ids.has(b.id)); ids.add(b.id);
    assert.ok(b.col >= 0 && b.col + b.len <= 9);
    assert.ok(b.row + (b.height ?? 1) <= 10);
    if (b.kind === 'totem') {
      assert.ok(b.height >= 2 && b.height <= 3);
      if (b.cells) assert.equal(b.cells.length, 4);
    }
    for (const cell of cellsOf(b)) {
        const r = b.row + cell.row, c = b.col + cell.col;
        if (state.shape && r >= 0 && !b.activateOnRise) {
          const { left, right } = state.shape.rows[r];
          assert.ok(c >= left && c < right, `outside shape at ${r}:${c}`);
        }
        const key = `${r}:${c}`;
        assert.ok(!cells.has(key), `overlap at ${key}`); cells.add(key);
    }
  }
}

function firstMove(engine) {
  for (const block of engine.snapshot().blocks) {
    const [min, max] = engine.moveRange(block.id);
    if (min !== max) return { type: 'slide', id: block.id, col: min === block.col ? max : min };
  }
  return null;
}

test('Totems default off, persist across modes/restarts, and can be disabled without changing difficulty', () => {
  const engine = createEngine({ random: seeded(71), difficulty: 'normal' });
  assert.equal(engine.snapshot().totemsEnabled, false);
  assert.deepEqual(engine.modes.map(mode => mode.id), ['shaped', 'classic']);
  assert.equal(engine.reset(undefined, { totemsEnabled: true }).totemsEnabled, true);
  for (const modeId of ['classic', 'shaped']) {
    assert.equal(engine.reset(modeId).totemsEnabled, true);
    assert.equal(engine.reset().totemsEnabled, true);
    assert.equal(engine.snapshot().difficulty, 'normal');
  }
  const disabled = engine.reset(undefined, { totemsEnabled: false });
  assert.equal(disabled.totemsEnabled, false);
  assert.equal(disabled.difficulty, 'normal');
  assert.ok(disabled.blocks.every(b => b.kind !== 'totem'));
  for (const modeId of ['classic', 'shaped']) {
    engine.reset(modeId);
    for (let i = 0; i < 10 && engine.snapshot().phase === 'play'; i++) {
      const command = firstMove(engine);
      if (!command) break;
      const result = engine.dispatch(command);
      assert.ok(result.accepted);
      assert.ok(result.events.every(event => event.type !== 'totem-drop'));
      assert.ok(result.state.blocks.every(b => b.kind !== 'totem'));
    }
  }
});

test('Shaped Totems stay whole and activate when a rise meets a narrowing', () => {
  const shape = structuredClone(SHAPES.find(shape => shape.id === 'corridor'));
  const state = { ...fixture([pole(1, 6, 3, 3)]), shape };
  assert.deepEqual(totemSlideRange(state, state.blocks[0]), [3, 5]);
  const motion = insertShapedRow(state, [{ col: 0, len: 2, color: 0 }]);
  assert.deepEqual(motion.trimmed, []);
  const remaining = state.blocks.find(b => b.id === 1);
  assert.equal(remaining.row, 5);
  assert.equal(remaining.height, 3);
  assert.equal(remaining.activateOnRise, true);
  assert.equal(state.score, 0);
  assert.equal(state.lines, 0);
  valid(state);
  const events = [];
  settleBoard(state, (type, data) => events.push({ type, ...data }));
  assert.equal(events[0].type, 'totem-activate');
  assert.ok(!state.blocks.some(b => b.id === 1));
  valid(state);
});

test('Shaped Totem blasts use playable row widths for score', () => {
  const shape = structuredClone(SHAPES.find(shape => shape.id === 'funnel'));
  const state = { ...fixture([pole(1, 1, 4, 2),
    ...Array.from({ length: 7 }, (_, i) => block(i + 2, i + 3, 4)), block(30, 9, 7)]), shape };
  const engine = createEngine({ modes: [{ ...shaped,
    reset(target) { Object.assign(target, structuredClone(state)); }
  }], random: seeded(123) });
  const result = engine.dispatch({ type: 'slide', id: 30, col: 8 });
  const index = result.events.findIndex(event => event.type === 'totem-activate');
  assert.ok(index > 0);
  assert.equal(result.events[index - 1].type, 'shaped-rise');
  const clear = result.events[index + 1];
  assert.equal(clear.type, 'clear');
  assert.equal(clear.rows.length, 2);
  assert.equal(clear.award.pts, clear.rows.reduce((sum, row, i) => {
    const { left, right } = shape.rows[row];
    return sum + (right - left) * 10 * (i + 1);
  }, 0));
  valid(result.state);
});

test('Totem preview search uses detached cell geometry and keeps the displayed row committed', () => {
  for (const modeId of ['classic', 'shaped']) {
    const engine = createEngine({ modeId, totemsEnabled: true, random: seeded(12),
      modeOptions: { shapeId: 'funnel' } });
    let state;
    for (let i = 0; i < 10; i++) {
      engine.dispatch(firstMove(engine));
      state = engine.snapshot();
      if (state.blocks.some(b => b.kind === 'totem')) break;
    }
    assert.ok(state.blocks.some(b => b.kind === 'totem'));
    const before = structuredClone(state);
    const generate = modeId === 'shaped' ? generateShapedNextRow : generateNextRow;
    assert.deepEqual(generate(state, seeded(22)), generate(state, seeded(22)));
    assert.deepEqual(state, before);
    const result = engine.dispatch(firstMove(engine));
    const rise = result.events.find(event => ['rise', 'shaped-rise'].includes(event.type));
    assert.ok(rise);
    const incoming = rise.state.blocks.filter(b => b.row === 9)
      .map(({ col, len, color }) => ({ col, len, color }));
    assert.deepEqual(incoming, before.nextRow);
  }
});

test('Shaped drops follow a playable entry path even beside a high stack', () => {
  const shape = structuredClone(SHAPES.find(shape => shape.id === 'corridor'));
  const state = { ...fixture([block(1, 7, 2)]), shape };
  const totem = spawnTotem(state, () => 0);
  assert.ok(totem);
  totemGravity(state);
  valid(state);
});

test('a vertical totem occupies every cell, falls rigidly, and slides only through full-height gaps', () => {
  const state = fixture([pole(1, 1, 4, 3), block(2, 9, 4), block(3, 7, 2), block(4, 8, 6)]);
  totemGravity(state);
  assert.equal(state.blocks[0].row, 6);
  assert.equal(totemGrid(state).flat().filter(b => b?.id === 1).length, 3);
  state.blocks[2].row = 7;
  state.blocks[3].row = 8;
  assert.deepEqual(totemSlideRange(state, state.blocks[0]), [3, 5]);
  assert.deepEqual(totemSlideRange(state, state.blocks[2]), [0, 3], 'ordinary blocks collide with lower totem cells');
  valid(state);
});

test('irregular collision uses occupied cells, including notches and overhang support', () => {
  const totem = piece(1, 7, 3, ['#.', '#.', '##']);
  const state = fixture([totem, block(2, 8, 4)]);
  assert.equal(totemGrid(state)[7][4], null, 'bounding-box notch is empty');
  assert.equal(totemGrid(state)[8][4].id, 2, 'ordinary blocks can occupy a notch');
  assert.deepEqual(totemSlideRange(state, totem), [0, 3], 'the upper arm cannot slide into a neighbour');
  assert.deepEqual(totemSlideRange(state, state.blocks[1]), [4, 8]);
  assert.deepEqual(totemGravity(state), [], 'the notched block rests on the lower arm');
  valid(state);

  const overhang = fixture([piece(1, 0, 3, ['##', '#.', '#.']), block(2, 1, 4)]);
  totemGravity(overhang);
  assert.equal(overhang.blocks[1].row, 9);
  assert.equal(overhang.blocks[0].row, 7, 'revisit the Totem after its overhang support falls');
  assert.deepEqual(totemGravity(overhang), []);
  valid(overhang);
});

test('irregular Totems are consumed but only full rows clear and score', () => {
  for (const rows of [['#..', '###'], ['#.', '#.', '##']]) {
    const height = rows.length, col = 9 - rows[0].length;
    const totem = piece(1, 10 - height, col, rows);
    const state = fixture([totem, block(2, 9, 0, col)]);
    assert.deepEqual(totemFullRows(state), [9]);
    const events = [];
    assert.equal(settleBoard(state, (type, data) => events.push({ type, ...data })), 1);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].rows, [9]);
    assert.equal(events[0].blocks.filter(b => b.kind === 'totem').length, rows[0].length);
    assert.equal(events[0].detached.length, 4 - rows[0].length);
    assert.ok(events[0].blocks.every(b => b.row === 9));
    assert.ok(events[0].detached.every(b => b.row !== 9));
    assert.deepEqual(state.blocks, []);

    const initial = fixture([piece(1, 10 - height, col, rows), block(2, 9, 0, col - 1),
      block(3, 8, col - 2)]);
    // The singleton slides into the last gap and falls, triggering one batch.
    const result = engineFor(initial).dispatch({ type: 'slide', id: 3, col: col - 1 });
    const clear = result.events.find(e => e.type === 'clear');
    assert.equal(clear.rows.length, 1);
    assert.equal(clear.state.lines, 1);
    assert.equal(clear.award.pts, 90);
  }
});

test('spawn rejects placements that would complete a row, without mutating a rejected board', () => {
  // Three-wide test outline: L/T pieces would fill a row even on an empty board.
  const state = { ...fixture([]), shape: { rows: Array.from({ length: 10 }, () => ({ left: 3, right: 6 })) } };
  const b = spawnTotem(state, () => 0);
  assert.ok(b, 'a safe zigzag is still available');
  totemGravity(state);
  assert.deepEqual(totemFullRows(state), []);
  assert.ok([0, 1].every(row => b.cells.filter(cell => cell.row === row).length === 2));

  const blocked = fixture([block(1, 1, 0, 9)]);
  const before = structuredClone(blocked);
  assert.equal(spawnTotem(blocked, () => 0), null);
  assert.deepEqual(blocked, before);
});

test('detached board copies and engine snapshots cannot mutate Totem cell geometry', () => {
  const state = fixture([piece(1, 7, 3, ['#.', '#.', '##'])]);
  const copy = copyBoard(state);
  copy.blocks[0].cells[0].col = 8;
  assert.equal(state.blocks[0].cells[0].col, 0);
  const engine = engineFor(state), snapshot = engine.snapshot();
  snapshot.blocks[0].cells[0].row = 8;
  assert.equal(engine.snapshot().blocks[0].cells[0].row, 0);
});

test('touching any Totem row removes its cells without extending the clear to neighbouring rows', () => {
  for (const rows of [[7], [8], [9], [7, 9], [7, 8, 9]]) {
    const state = fixture([pole(1, 7, 8, 3), ...[7, 8, 9].map(r => block(r, r, 0, 8))]);
    assert.deepEqual(totemFullRows(state), [7, 8, 9]);
    const before = structuredClone(state.blocks[0]);
    const geometry = clearTotemRows(state, rows);
    assert.ok(!state.blocks.some(b => b.id === 1));
    assert.deepEqual(geometry.rows, rows);
    assert.equal(geometry.blocks.filter(b => b.kind === 'totem').length, rows.length);
    assert.equal(geometry.detached.length, 3 - rows.length);
    assert.deepEqual(state.blocks.map(b => b.row), [7, 8, 9].filter(row => !rows.includes(row)));
    assert.equal(geometry.displayBlocks.filter(b => b.kind === 'totem').length, 3);
    assert.equal(before.height, 3);
    valid(state);
    totemGravity(state);
    valid(state);
  }
});

test('off-row Totem debris does not clear neighbouring blocks or trigger another Totem', () => {
  const untouched = piece(3, 6, 0, ['#.', '#.', '##']);
  const state = fixture([piece(1, 7, 7, ['.#', '.#', '##']), block(2, 8, 3, 4), untouched]);
  const before = structuredClone(state);
  const clear = clearTotemRows(state, [9]);
  assert.deepEqual(clear.rows, [9]);
  assert.deepEqual(state.blocks, before.blocks.slice(1));
  assert.deepEqual(clear.detached.map(b => [b.row, b.col]), [[7, 8], [8, 8]]);
  clear.displayBlocks[0].row = 0;
  assert.deepEqual(state.blocks, before.blocks.slice(1));
});

test('2–3 row drops start above the board and land without overlap or automatic clears', () => {
  for (const height of [2, 3]) {
    const state = fixture([block(1, 9, 0, 2)]);
    let n = 0;
    const b = spawnTotem(state, () => n++ === 0 ? (height - 1.5) / 2 : 0.5);
    assert.equal(b.height, height);
    assert.ok(b.row + b.height <= 0);
    assert.ok(b.row + b.height <= 9);
    valid(state);
    totemGravity(state);
    assert.ok(b.row >= 1);
    assert.deepEqual(totemFullRows(state), []);
    valid(state);
    assert.equal(spawnTotem(state, () => 0), null, 'only one live totem');
  }
  const crowded = fixture([block(1, 1, 0, 9)]);
  assert.equal(spawnTotem(crowded, () => 0.9), null, 'defer instead of overlapping or spawning at the ceiling');
});

test('drops use random safe columns across uneven stacks, including lower columns', () => {
  const columns = new Set();
  let lowerDrop = false;
  for (const height of [2, 3]) {
    for (const choice of [0, 0.3, 0.7, 0.999]) {
      const state = fixture([
        ...Array.from({ length: 5 }, (_, i) => block(i + 1, i + 5, 3, 2)),
        block(10, 9, 0, 2), block(11, 9, 7)
      ]);
      let calls = 0;
      const b = spawnTotem(state, () => calls++ === 0 ? (height - 1.5) / 2 : choice);
       assert.ok(b);
       columns.add(b.col);
      totemGravity(state);
      lowerDrop ||= b.row + b.height > 5;
      assert.deepEqual(totemFullRows(state), []);
      valid(state);
    }
  }
  assert.ok(columns.size > 1);
  assert.ok(lowerDrop);
});

test('top-edge activation consumes the whole totem and removes 2–3 distinct random rows', () => {
  for (const height of [2, 3]) {
    const state = fixture([pole(1, 1, 0, height),
      ...Array.from({ length: 9 - height }, (_, i) => block(i + 2, height + 1 + i, 0)),
      block(30, 9, 4)]);
    state.nextRow = [{ col: 0, len: 1, color: 0 }];
    const result = engineFor(state).dispatch({ type: 'slide', id: 30, col: 5 });
    const activation = result.events.findIndex(e => e.type === 'totem-activate');
    assert.ok(activation > 0);
    assert.equal(result.events[activation - 1].type, 'rise');
    assert.equal(result.events[activation].block.height, height);
    assert.equal(result.events[activation].block.row, 0);
    assert.ok(!result.events[activation].state.blocks.some(b => b.id === 1));
    const clear = result.events[activation + 1];
    assert.equal(clear.type, 'clear');
    assert.equal(clear.rows.length, height);
    assert.equal(new Set(clear.rows).size, height);
    assert.equal(clear.state.lines, height);
    assert.equal(clear.state.score, 90 * height * (height + 1) / 2);
    assert.equal(result.state.phase, 'play');
    valid(result.state);
  }
});

test('blast selection is random, bounded to occupied rows, and does not mutate the board', () => {
  const state = fixture([block(1, 2, 0), block(2, 5, 0), block(3, 9, 0)]);
  const before = structuredClone(state);
  assert.deepEqual(chooseTotemRows(state, 2, () => 0), [2, 5]);
  assert.deepEqual(chooseTotemRows(state, 2, () => 0.999), [5, 9]);
  assert.deepEqual(chooseTotemRows(state, 3, () => 0.5), [2, 5, 9]);
  assert.deepEqual(state, before);
});

test('ordinary blocks retain the rescue turn at the top, then top out if still supported', () => {
  const state = fixture([...Array.from({ length: 10 }, (_, r) => block(r + 1, r, 0)), block(20, 9, 4)]);
  const result = engineFor(state).dispatch({ type: 'slide', id: 20, col: 5 });
  assert.equal(result.state.phase, 'over');
  assert.equal(result.state.gameOverReason, 'top-out');
  assert.ok(!result.events.some(e => e.type === 'rise' || e.type === 'totem-drop'));
});

test('optional Totems are deterministic in both modes, all shapes, and both difficulties', () => {
  let drops = 0, activations = 0;
  for (const shape of [null, ...SHAPES]) for (const difficulty of ['easy', 'normal']) {
    const seed = 123;
    const config = { modeId: shape ? 'shaped' : 'classic', totemsEnabled: true, difficulty,
      modeOptions: shape ? { shapeId: shape.id } : {} };
    const a = createEngine({ ...config, random: seeded(seed) });
    const b = createEngine({ ...config, random: seeded(seed) });
    let shapeDrops = 0;
    for (let turn = 0; turn < 60; turn++) {
      const state = a.snapshot();
      assert.deepEqual(state, b.snapshot());
      valid(state);
      assert.ok(state.blocks.every(b => b.row >= 0));
      assert.deepEqual(totemFullRows(state), []);
      assert.deepEqual(totemGravity(structuredClone(state)), []);
      if (state.phase === 'over') break;
      const options = state.blocks.flatMap(block => {
        const [min, max] = a.moveRange(block.id);
        return Array.from({ length: max - min + 1 }, (_, i) => min + i)
          .filter(col => col !== block.col).map(col => ({ type: 'slide', id: block.id, col }));
      });
      assert.ok(options.length, 'live boards must offer a move');
      const command = options[(seed + turn * 7) % options.length];
      const result = a.dispatch(command);
      assert.deepEqual(result, b.dispatch(command));
      for (const event of result.events) valid(event.state);
      const dropIndex = result.events.findIndex(e => e.type === 'totem-drop');
      if (dropIndex >= 0) assert.ok(result.events.slice(dropIndex + 1)
        .every(e => e.type !== 'clear' && e.type !== 'totem-activate'), 'drops never award free clears');
      drops += result.events.filter(e => e.type === 'totem-drop').length;
      shapeDrops += result.events.filter(e => e.type === 'totem-drop').length;
      activations += result.events.filter(e => e.type === 'totem-activate').length;
    }
    assert.ok(!a.reset('classic').blocks.some(b => b.kind === 'totem'));
    assert.ok(a.reset('shaped').shape);
    assert.equal(a.reset('classic').shape, undefined);
    assert.ok(shapeDrops > 0, `${shape?.id ?? 'classic'} ${difficulty} spawns a Totem`);
  }
  assert.ok(drops > 0);
  assert.ok(activations > 0);
});
