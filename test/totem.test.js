import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { createState, rise, awardTotemCollect } from '../js/sim.js';
import { resolveTurn } from '../js/turn.js';
import { classic } from '../js/modes.js';
import { shaped } from '../js/shaped-mode.js';
import { buildGrid as totemGrid, computeGravity as totemGravity, slideRange as totemSlideRange,
  fullRows as totemFullRows, clearRows as clearTotemRows,
  settleBoard, copyBoard } from '../js/board.js';
import { cellsOf } from '../js/block-geometry.js';
import { spawnTotem, spawnBuildingTotem, spawnOpeningTotem } from '../js/totem-spawn.js';
import { SHAPES } from '../js/shapes.js';
import { insertShapedRow } from '../js/shaped-board.js';
import { generateNextRow } from '../js/spawn.js';
import { generateShapedNextRow } from '../js/shaped-spawn.js';
import { tetrisDropInterval, buildingTotemsForLevelUp } from '../js/play-mode.js';

const block = (id, row, col, len = 1) => ({ id, row, col, len, color: 0 });
const pole = (id, row, col, height) => ({ ...block(id, row, col), kind: 'totem', height });
const piece = (id, row, col, rows) => ({ ...block(id, row, col, rows[0].length),
  kind: 'totem', height: rows.length,
  cells: rows.flatMap((line, r) => [...line].flatMap((cell, c) => cell === '#' ? [{ row: r, col: c }] : [])) });
function seeded(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
function fixture(blocks) {
  return { ...createState(0, 'easy', 'tetris'), blocks, nextId: 100, nextRow: [{ col: 0, len: 1, color: 0 }] };
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
    assert.ok(b.col >= 0 && b.col + b.len <= 8);
    assert.ok(b.row + (b.height ?? 1) <= 10);
    if (b.kind === 'totem') {
      assert.ok(b.height >= 1 && b.height <= 3);
      if (b.cells) assert.ok(b.cells.length >= 1 && b.cells.length <= 4);
    }
    for (const cell of cellsOf(b)) {
        const r = b.row + cell.row, c = b.col + cell.col;
        if (state.shape && r >= 0) {
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

test('a live tetromino with no ordinary tiles rises one row, not three', () => {
  const initial = fixture([piece(1, 7, 0, ['##', '##'])]);
  const [min, max] = totemSlideRange(initial, initial.blocks[0]);
  assert.ok(min !== max);
  const result = engineFor(initial).dispatch({ type: 'slide', id: 1, col: min === 0 ? max : min });
  assert.equal(result.events.filter(e => e.type === 'rise').length, 1);
});

test('Tetris waits five turns between drops at level 1', () => {
  const engine = createEngine({ modeId: 'classic', playMode: 'tetris', random: seeded(3) });
  assert.equal(engine.snapshot().tetrisDropIn, 5);
  let drops = 0;
  for (let i = 0; i < 5; i++) {
    const command = firstMove(engine);
    assert.ok(command);
    const result = engine.dispatch(command);
    drops += result.events.filter(e => e.type === 'totem-drop').length;
    if (i < 4) {
      assert.equal(drops, 0);
      assert.equal(engine.snapshot().tetrisDropIn, 4 - i);
    }
  }
  assert.equal(drops, 1);
  assert.equal(engine.snapshot().tetrisDropIn, 5);
});

test('Tetris later levels wait four turns between drops', () => {
  assert.equal(tetrisDropInterval(1), 5);
  assert.equal(tetrisDropInterval(2), 4);
  assert.equal(tetrisDropInterval(9), 4);
  const initial = { ...fixture([block(1, 8, 0, 3), block(2, 8, 4, 3)]),
    level: 4, lines: 30, tetrisDropIn: 4 };
  const engine = engineFor(initial);
  let drops = 0;
  for (let i = 0; i < 4; i++) {
    const command = firstMove(engine);
    assert.ok(command);
    drops += engine.dispatch(command).events.filter(e => e.type === 'totem-drop').length;
    if (i < 3) assert.equal(drops, 0);
  }
  assert.equal(drops, 1);
  assert.equal(engine.snapshot().tetrisDropIn, 4);
});

test('Totems default off, persist across maps/restarts, and can be disabled without changing difficulty', () => {
  const engine = createEngine({ random: seeded(71), difficulty: 'normal' });
  assert.equal(engine.snapshot().totemsEnabled, false);
  assert.equal(engine.snapshot().playMode, 'standard');
  assert.deepEqual(engine.modes.map(mode => mode.id), ['shaped', 'classic']);
  assert.equal(engine.reset(undefined, { playMode: 'tetris' }).totemsEnabled, true);
  assert.equal(engine.snapshot().playMode, 'tetris');
  assert.equal(engine.snapshot().mode, 'classic');
  assert.equal(engine.reset('shaped').mode, 'classic');
  assert.equal(engine.reset('shaped').playMode, 'tetris');
  assert.equal(engine.reset('classic').totemsEnabled, true);
  assert.equal(engine.reset().totemsEnabled, true);
  assert.equal(engine.snapshot().difficulty, 'normal');
  const disabled = engine.reset(undefined, { playMode: 'standard' });
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

test('Shaped Totems chip at a narrowing without scoring and keep surviving cells in place', () => {
  const shape = structuredClone(SHAPES.find(shape => shape.id === 'corridor'));
  const state = { ...fixture([pole(1, 6, 2, 3)]), shape };
  assert.deepEqual(totemSlideRange(state, state.blocks[0]), [2, 4]);
  const motion = insertShapedRow(state, [{ col: 0, len: 2, color: 0 }]);
  assert.deepEqual(motion.trimmed, [pole(1, 5, 2, 1)]);
  assert.equal(motion.blocks.find(b => b.id === 1).height, 3, 'rise retains pre-trim geometry');
  const remaining = state.blocks.find(b => b.id === 1);
  assert.equal(remaining.row, 6);
  assert.equal(remaining.height, 2);
  assert.deepEqual(remaining.cells, [{ row: 0, col: 0 }, { row: 1, col: 0 }]);
  assert.equal(state.score, 0);
  assert.equal(state.lines, 0);
  valid(state);
  const events = [];
  settleBoard(state, (type, data) => events.push({ type, ...data }));
  assert.ok(!events.some(e => e.type === 'totem-activate'));
  assert.ok(state.blocks.some(b => b.id === 1));
  valid(state);
});

test('Shaped trimming handles both edges, whole Totems, and Building poles without regrowth', () => {
  for (const playMode of ['tetris', 'totem-building']) {
    const shape = { rows: Array.from({ length: 10 }, () => ({ left: 0, right: 8 })) };
    shape.rows[7] = { left: 2, right: 6 };
    shape.rows[8] = { left: 2, right: 6 };
    const state = { ...fixture([piece(1, 8, 1, ['###', '#..']),
      pole(2, 9, 7, 1), piece(3, 8, 5, ['##', '.#'])]), shape, playMode };
    const motion = insertShapedRow(state, []);
    assert.deepEqual(motion.trimmed.map(b => [b.row, b.col]), [[7, 1], [8, 1], [8, 7], [7, 6], [8, 6]]);
    assert.deepEqual(state.blocks.map(b => [b.id, b.row, b.col, b.len, b.height]),
      [[1, 7, 2, 2, 1], [3, 7, 5, 1, 1]]);
    assert.equal(state.score, 0);
    valid(state);
    insertShapedRow(state, []);
    assert.deepEqual(state.blocks.map(b => cellsOf(b).length), [2, 1]);
    valid(state);
  }
});

test('Totem preview search uses detached cell geometry and keeps the displayed row committed', () => {
  for (const modeId of ['classic']) {
    const engine = createEngine({ modeId, playMode: 'tetris', random: seeded(12),
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
  assert.deepEqual(totemSlideRange(state, state.blocks[1]), [4, 7]);
  assert.deepEqual(totemGravity(state), [], 'the notched block rests on the lower arm');
  valid(state);

  const overhang = fixture([piece(1, 0, 3, ['##', '#.', '#.']), block(2, 1, 4)]);
  totemGravity(overhang);
  assert.equal(overhang.blocks[1].row, 9);
  assert.equal(overhang.blocks[0].row, 7, 'revisit the Totem after its overhang support falls');
  assert.deepEqual(totemGravity(overhang), []);
  valid(overhang);
});

test('irregular Totems keep leftover connected groups as smiling shards', () => {
  for (const rows of [['#..', '###'], ['#.', '#.', '##']]) {
    const height = rows.length, col = 8 - rows[0].length;
    const totem = piece(1, 10 - height, col, rows);
    const state = fixture([totem, block(2, 9, 0, col)]);
    assert.deepEqual(totemFullRows(state), [9]);
    const events = [];
    assert.equal(settleBoard(state, (type, data) => events.push({ type, ...data })), 1);
    const clears = events.filter(e => e.type === 'clear');
    assert.equal(clears.length, 1);
    assert.deepEqual(clears[0].rows, [9]);
    assert.equal(clears[0].blocks.filter(b => b.kind === 'totem').length, rows[0].length);
    assert.ok(clears[0].blocks.every(b => b.row === 9));
    const leftovers = state.blocks.filter(b => b.face === 'smile');
    const leftoverCells = leftovers.reduce((n, b) => n + (b.cells?.length ?? b.len), 0);
    assert.equal(leftoverCells, 4 - rows[0].length);
    assert.equal(leftovers.length, 1);
    assert.ok(leftovers.every(b => b.kind === undefined && b.face === 'smile'));

    const initial = fixture([piece(1, 10 - height, col, rows), block(2, 9, 0, col - 1),
      block(3, 8, col - 2)]);
    // The singleton slides into the last gap and falls, triggering one batch.
    const result = engineFor(initial).dispatch({ type: 'slide', id: 3, col: col - 1 });
    const clear = result.events.find(e => e.type === 'clear');
    assert.equal(clear.rows.length, 1);
    assert.equal(clear.state.lines, 1);
    assert.equal(clear.award.pts, 80);
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

  const blocked = fixture([block(1, 1, 0, 8)]);
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
    const state = fixture([pole(1, 7, 7, 3), ...[7, 8, 9].map(r => block(r, r, 0, 7))]);
    assert.deepEqual(totemFullRows(state), [7, 8, 9]);
    const before = structuredClone(state.blocks[0]);
    const geometry = clearTotemRows(state, rows);
    assert.ok(!state.blocks.some(b => b.id === 1));
    assert.deepEqual(geometry.rows, rows);
    assert.equal(geometry.blocks.filter(b => b.kind === 'totem').length, rows.length);
    const leftoverRows = [7, 8, 9].filter(row => !rows.includes(row));
    const leftovers = state.blocks.filter(b => b.face === 'smile');
    const leftoverCells = leftovers.flatMap(b =>
      (b.cells ?? [{ row: 0 }]).map(cell => b.row + cell.row)).sort();
    assert.deepEqual(leftoverCells, leftoverRows);
    const groups = leftoverRows.reduce((n, row, i) =>
      n + (i === 0 || row !== leftoverRows[i - 1] + 1 ? 1 : 0), 0);
    assert.equal(leftovers.length, leftoverRows.length ? groups : 0);
    assert.equal(geometry.displayBlocks.filter(b => b.kind === 'totem').length, rows.length);
    assert.equal(before.height, 3);
    valid(state);
    totemGravity(state);
    valid(state);
  }
});

test('off-row Totem leftovers become independent tiles and do not trigger another Totem', () => {
  const untouched = piece(3, 6, 0, ['#.', '#.', '##']);
  const state = fixture([piece(1, 7, 6, ['.#', '.#', '##']), block(2, 8, 3, 3), untouched]);
  const before = structuredClone(state);
  const clear = clearTotemRows(state, [9]);
  assert.deepEqual(clear.rows, [9]);
  const leftovers = state.blocks.filter(b => b.face === 'smile');
  assert.equal(leftovers.length, 1);
  assert.deepEqual(leftovers[0].cells, [{ row: 0, col: 0 }, { row: 1, col: 0 }]);
  assert.deepEqual([leftovers[0].row, leftovers[0].col], [7, 7]);
  assert.equal(leftovers[0].kind, undefined);
  assert.ok(state.blocks.some(b => b.id === untouched.id));
  assert.ok(!state.blocks.some(b => b.id === 1));
  const leftoverIds = leftovers.map(b => b.id);
  clear.displayBlocks[0].row = 0;
  assert.deepEqual(state.blocks.filter(b => leftoverIds.includes(b.id)).map(b => [b.row, b.col]),
    [[7, 7]]);
  assert.equal(before.blocks[0].id, 1);
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
  const crowded = fixture([block(1, 1, 0, 8)]);
  assert.equal(spawnTotem(crowded, () => 0.9), null, 'defer instead of overlapping or spawning at the ceiling');
});

test('drops use random safe columns across uneven stacks, including lower columns', () => {
  const columns = new Set();
  let lowerDrop = false;
  for (const height of [2, 3]) {
    for (const choice of [0, 0.3, 0.7, 0.999]) {
      const state = fixture([
        ...Array.from({ length: 5 }, (_, i) => block(i + 1, i + 5, 3, 2)),
        block(10, 9, 0, 2), block(11, 9, 6)
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

test('a Totem at the top does not blast rows in Totem or Totem Building', () => {
  for (const playMode of ['tetris', 'totem-building']) {
    const state = { ...fixture([pole(1, 1, 0, 2),
      ...Array.from({ length: 7 }, (_, i) => block(i + 2, i + 3, 0)),
      block(30, 9, 4)]), playMode };
    state.nextRow = [{ col: 0, len: 1, color: 0 }];
    const result = engineFor(state).dispatch({ type: 'slide', id: 30, col: 5 });
    assert.ok(!result.events.some(e => e.type === 'totem-activate'));
    const totem = result.state.blocks.find(b => b.id === 1);
    assert.ok(totem);
    assert.equal(totem.row, 0);
  }
});

test('ordinary blocks retain the rescue turn at the top, then top out if still supported', () => {
  const state = fixture([...Array.from({ length: 10 }, (_, r) => block(r + 1, r, 0)), block(20, 9, 4)]);
  const result = engineFor(state).dispatch({ type: 'slide', id: 20, col: 5 });
  assert.equal(result.state.phase, 'over');
  assert.equal(result.state.gameOverReason, 'top-out');
  assert.ok(!result.events.some(e => e.type === 'rise' || e.type === 'totem-drop'));
});

test('optional Totems are deterministic on classic for both difficulties', () => {
  let drops = 0;
  for (const difficulty of ['easy', 'normal']) {
    const seed = 123;
    const config = { modeId: 'classic', playMode: 'tetris', difficulty };
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
      assert.ok(!result.events.some(e => e.type === 'totem-activate'));
    }
    assert.ok(!a.reset('classic').blocks.some(b => b.kind === 'totem'));
    assert.equal(a.reset('shaped').mode, 'classic');
    assert.equal(a.reset('classic').shape, undefined);
    assert.ok(shapeDrops > 0, `classic ${difficulty} spawns a Totem`);
  }
  assert.ok(drops > 0);
});

test('building level-ups spawn one extra totem per new level, capped at 5', () => {
  assert.equal(buildingTotemsForLevelUp(1, 1), 0);
  assert.equal(buildingTotemsForLevelUp(1, 2), 2);
  assert.equal(buildingTotemsForLevelUp(2, 3), 3);
  assert.equal(buildingTotemsForLevelUp(4, 5), 5);
  assert.equal(buildingTotemsForLevelUp(5, 6), 5);
  assert.equal(buildingTotemsForLevelUp(1, 3), 2 + 3);
  assert.equal(buildingTotemsForLevelUp(4, 6), 5 + 5);
});

test('Totem Building opening totem is already on the board', () => {
  const engine = createEngine({ modeId: 'classic', playMode: 'totem-building', random: seeded(123) });
  const totems = engine.snapshot().blocks.filter(b => b.kind === 'totem');
  assert.equal(totems.length, 1);
  assert.ok(totems[0].row >= 1);
});

test('Totem Building drops a new totem on level-up and never stacks', () => {
  const ready = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    nextRow: [{ col: 0, len: 2, color: 0 }],
    lines: 4, level: 1,
    blocks: [
      { id: 1, row: 9, col: 0, len: 7, color: 0 },
      { id: 2, row: 8, col: 6, len: 1, color: 1 }
    ] };
  const drop = engineFor(ready).dispatch({ type: 'slide', id: 2, col: 7 });
  assert.ok(drop.events.some(e => e.type === 'totem-drop'));
  assert.ok(!drop.events.some(e => e.type === 'totem-stack'));
  assert.equal(drop.state.level, 2);
  assert.equal(drop.events.filter(e => e.type === 'totem-drop').length, 2);

  const idle = { ...fixture([
    { ...pole(1, 8, 3, 1), smile: 1 },
    block(2, 9, 3),
    block(3, 9, 0, 2)
  ]), playMode: 'totem-building', level: 1, lines: 0 };
  const stay = engineFor(idle).dispatch({ type: 'slide', id: 3, col: 5 });
  assert.ok(!stay.events.some(e => e.type === 'totem-stack' || e.type === 'totem-drop'));
  assert.equal(stay.state.blocks.filter(b => b.kind === 'totem').length, 1);

  const atTop = { ...fixture([
    pole(1, 0, 4, 1),
    ...Array.from({ length: 9 }, (_, i) => block(i + 2, i + 1, 4)),
    block(30, 9, 0)
  ]), playMode: 'totem-building' };
  const top = engineFor(atTop).dispatch({ type: 'slide', id: 30, col: 1 });
  assert.ok(!top.events.some(e => e.type === 'totem-activate'));
  assert.equal(top.state.gameOverReason, 'top-out');
});

test('Totem Building waits when no free column remains', () => {
  const blocked = { ...createState(0, 'easy', 'totem-building'),
    blocks: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, row: 5, col: i, len: 1, height: 1,
      kind: 'totem', color: 4, smile: 1 })) };
  const result = spawnBuildingTotem(blocked, () => 0);
  assert.equal(result.type, 'blocked');
});

test('blocked Building level-up drops survive turns and retry when support becomes available', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 10, lines: 4,
    nextRow: [{ col: 0, len: 2, color: 0 }], blocks: [
      block(1, 9, 0, 8),
      ...[6, 7, 8].map((row, i) => block(i + 2, row, 0, 2)),
      ...[0, 1].map((col, i) => ({ ...pole(i + 5, 5, col, 1), smile: 1 }))
    ] };
  const events = [];
  const turn = () => resolveTurn(state, () => 0.5,
    (type, data) => events.push({ type, ...structuredClone(data) }), () => rise(state, () => 0.5));
  turn();
  assert.equal(state.level, 2);
  assert.equal(state.pendingTotemSpawns, 2);
  assert.equal(state.totemSpawnBlocked, true);
  assert.equal(events.filter(e => e.type === 'totem-drop').length, 0);

  // Slide one of the existing totems off the only supported columns.
  state.blocks.find(b => b.id === 5).col = 2;
  turn();
  const drops = events.filter(e => e.type === 'totem-drop').length;
  assert.ok(drops > 0);
  assert.equal(drops + state.pendingTotemSpawns, 2, 'queued drops are neither lost nor duplicated');
  assert.equal(state.totemSpawnBlocked, state.pendingTotemSpawns > 0);
  valid(state);
});

test('a blocked opening Building totem is retried on a later turn', () => {
  const initial = createState(0, 'easy', 'totem-building');
  spawnOpeningTotem(initial, () => { assert.fail('blocked opening does not consume RNG'); });
  assert.equal(initial.pendingTotemSpawns, 1);
  assert.equal(initial.totemSpawnBlocked, true);
  initial.blocks = [block(1, 9, 0, 2)];
  initial.nextId = 2;
  initial.nextRow = [{ col: 0, len: 2, color: 0 }];
  const result = engineFor(initial).dispatch({ type: 'slide', id: 1, col: 1 });
  assert.equal(result.events.filter(e => e.type === 'totem-drop').length, 1);
  assert.equal(result.state.pendingTotemSpawns, 0);
  assert.equal(result.state.totemSpawnBlocked, false);
});

test('nested Building board copies preserve live collection and clear rules without mutation', () => {
  const scenarios = [
    [pole(1, 9, 7, 1), block(2, 9, 0, 2)],
    [pole(1, 8, 7, 1), block(2, 8, 0, 7), block(3, 9, 6, 2)]
  ];
  for (const blocks of scenarios) for (const shape of [null, SHAPES.find(s => s.id === 'funnel')]) {
    const state = { ...createState(0, 'easy', 'totem-building'), nextId: 10, blocks,
      ...(shape ? { shape: structuredClone(shape) } : {}) };
    const saved = structuredClone(state);
    const live = structuredClone(state), preview = copyBoard(copyBoard(state));
    const liveEvents = [], previewEvents = [];
    settleBoard(live, (type, data) => liveEvents.push({ type, ...structuredClone(data) }));
    settleBoard(preview, (type, data) => previewEvents.push({ type, ...structuredClone(data) }));
    assert.deepEqual(preview.blocks, live.blocks);
    assert.deepEqual(previewEvents, liveEvents);
    assert.deepEqual(state, saved);
  }
});

test('Totem Building drops onto the highest supported blocks instead of empty or lower columns', () => {
  for (const random of [() => 0, () => 0.49, () => 0.999]) {
    const state = { ...fixture([
      block(1, 7, 2, 2), block(2, 8, 2, 2), block(3, 9, 2, 2),
      block(4, 9, 5, 2)
    ]), playMode: 'totem-building' };
    const { type, block: incoming } = spawnBuildingTotem(state, random);
    assert.equal(type, 'drop');
    assert.ok([2, 3].includes(incoming.col));
    assert.equal(incoming.row, -1, 'the drop still animates from above the board');
    totemGravity(state);
    assert.equal(incoming.row, 6);
    assert.equal(totemGrid(state)[7][incoming.col].kind, undefined);
    assert.deepEqual(totemFullRows(state), []);
    valid(state);
  }
});

test('Totem Building defers without consuming an ID or RNG when no supported landing exists', () => {
  for (const blocks of [[], [pole(1, 8, 3, 1), block(2, 9, 3)]]) {
    const state = { ...fixture(blocks), playMode: 'totem-building' };
    const before = structuredClone(state);
    const result = spawnBuildingTotem(state, () => { assert.fail('blocked drops do not sample RNG'); });
    assert.equal(result.type, 'blocked');
    assert.deepEqual(state, before);
  }
});

test('Totem Building respects shaped entry paths and still lands on a block', () => {
  for (const shape of SHAPES) {
    const state = { ...fixture([
      block(1, 7, 3, 2), block(2, 8, 3, 2), block(3, 9, 3, 2)
    ]), playMode: 'totem-building', shape: structuredClone(shape) };
    const { type, block: incoming } = spawnBuildingTotem(state, () => 0);
    assert.equal(type, 'drop', shape.id);
    totemGravity(state);
    assert.equal(incoming.row, 6, shape.id);
    assert.ok(totemGrid(state)[incoming.row + 1][incoming.col]);
    valid(state);
  }
});

test('Totem Building keeps totems through a clear and smiles them', () => {
  const state = { ...fixture([
    { id: 1, row: 8, col: 7, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 },
    block(2, 8, 0, 7)
  ]), playMode: 'totem-building' };
  const geometry = clearTotemRows(state, [8]);
  const remaining = state.blocks.find(b => b.id === 1);
  assert.ok(remaining);
  assert.equal(remaining.smile, 2);
  assert.equal(remaining.row, 8);
  assert.equal(geometry.blocks.filter(b => b.kind === 'totem').length, 0);
});

test('Totem Building incoming rows never include singleton tiles', () => {
  const engine = createEngine({ modeId: 'classic', playMode: 'totem-building', random: seeded(9) });
  for (let i = 0; i < 12; i++) {
    const state = engine.snapshot();
    assert.ok(state.nextRow.every(b => b.len >= 2));
    assert.ok(state.blocks.filter(b => b.kind !== 'totem').every(b => b.len >= 2));
    const move = state.blocks.find(b => {
      const [min, max] = engine.moveRange(b.id) ?? [b.col, b.col];
      return min !== max;
    });
    if (!move || state.phase !== 'play') break;
    const [min, max] = engine.moveRange(move.id);
    engine.dispatch({ type: 'slide', id: move.id, col: min === move.col ? max : min });
  }
});

test('Totem Building collects individual totems that reach the floor', () => {
  const board = { ...fixture([
    { id: 1, row: 7, col: 7, len: 1, height: 1, kind: 'totem', color: 4, smile: 2 },
    block(2, 8, 0, 2)
  ]), playMode: 'totem-building', level: 1, score: 0 };
  const events = [];
  settleBoard(board, (type, data) => events.push({ type, ...data }));
  assert.ok(events.some(e => e.type === 'totem-collect'));
  assert.ok(!events.some(e => e.type === 'clear'));
  assert.ok(!board.blocks.some(b => b.kind === 'totem'));
  assert.equal(board.score, 0);
});

test('all-totem rows clear at max smile above the floor, including shaped spans', () => {
  for (const shaped of [false, true]) {
    const left = shaped ? 2 : 0, right = shaped ? 6 : 8;
    const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
      ...(shaped ? { shape: { rows: Array.from({ length: 10 }, () => ({ left, right })) } } : {}),
      blocks: [
        ...Array.from({ length: right - left }, (_, i) => ({ ...pole(i + 1, 7, left + i, 1), smile: i % 3 + 1 })),
        ...[8, 9].map(row => block(row * 10, row, left, right - left))
      ] };
    assert.deepEqual(totemFullRows(state), [7, 8, 9]);
    const before = structuredClone(state);
    const live = structuredClone(state), preview = copyBoard(copyBoard(state));
    const events = [];
    settleBoard(live, (type, data) => events.push({ type, ...structuredClone(data) }));
    settleBoard(preview);
    const clear = events.find(e => e.type === 'clear');
    assert.ok(clear);
    assert.equal(clear.collected.length, right - left);
    assert.ok(clear.collected.every(b => b.smile === 3));
    assert.ok(clear.blocks.filter(b => b.kind === 'totem').every(b => b.smile === 3));
    assert.ok(!live.blocks.some(b => b.kind === 'totem'));
    assert.ok(!events.some(e => e.type === 'totem-collect'), 'cash-out is part of the row clear');
    assert.deepEqual(preview.blocks, live.blocks);
    assert.deepEqual(state, before);
  }
});

test('collection awards carry only their own points and retain per-totem values', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), level: 2 };
  const first = awardTotemCollect(state, [{ id: 1, smile: 1 }, { id: 2, smile: 3 }]);
  const second = awardTotemCollect(state, [{ id: 3, smile: 2 }]);
  assert.deepEqual(first.totems, [{ id: 1, pts: 100, mult: 1 }, { id: 2, pts: 300, mult: 1 }]);
  assert.equal(first.pts, 400);
  assert.equal(second.pts, 200);
  assert.equal(state.score, 600);
  assert.equal(state.best, 600);
});

test('live all-totem row cash-out scores every max-level totem exactly once', () => {
  const initial = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    nextRow: [{ col: 0, len: 2, color: 0 }], blocks: [
      ...Array.from({ length: 7 }, (_, col) => ({ ...pole(col + 1, 8, col, 1), smile: 1 })),
      { ...pole(8, 7, 6, 1), smile: 1 }, block(20, 9, 0, 8)
    ] };
  const result = engineFor(initial).dispatch({ type: 'slide', id: 8, col: 7 });
  const clear = result.events.find(e => e.collectionAward);
  assert.ok(clear);
  assert.equal(clear.collectionAward.pts, 1200);
  assert.deepEqual(clear.collectionAward.totems.map(a => a.pts), Array(8).fill(150));
  assert.equal(result.state.score, 1200);
});

test('Totem Building clears a completed bottom row before collecting the totem', () => {
  const board = { ...fixture([
    { id: 1, row: 7, col: 7, len: 1, height: 1, kind: 'totem', color: 4, smile: 1 },
    block(2, 9, 0, 7)
  ]), playMode: 'totem-building', level: 1 };
  const events = [];
  settleBoard(board, (type, data) => events.push({ type, ...data }));
  const types = events.map(e => e.type);
  assert.ok(types.includes('clear'));
  assert.ok(types.includes('totem-collect'));
  assert.ok(types.indexOf('clear') < types.indexOf('totem-collect'));
  const collect = events.find(e => e.type === 'totem-collect');
  assert.equal(collect.blocks[0].smile, 2);
  assert.ok(!board.blocks.some(b => b.kind === 'totem'));
  assert.ok(!board.blocks.some(b => b.id === 2));
});

test('Totem Building refills three rows from one leftover row and four from an empty board', () => {
  const thin = { ...createState(0, 'easy', 'totem-building'), nextId: 10,
    nextRow: [{ col: 0, len: 2, color: 1 }],
    blocks: [block(1, 9, 0, 3)] };
  const thinResult = engineFor(thin).dispatch({ type: 'slide', id: 1, col: 1 });
  assert.equal(thinResult.events.filter(e => e.type === 'rise').length, 3);

  const empty = { ...createState(0, 'easy', 'totem-building'), nextId: 10,
    nextRow: [{ col: 0, len: 3, color: 1 }],
    blocks: [block(1, 9, 0, 7), block(2, 8, 6)] };
  const emptyResult = engineFor(empty).dispatch({ type: 'slide', id: 2, col: 7 });
  assert.ok(emptyResult.events.some(e => e.type === 'clear'));
  assert.equal(emptyResult.events.filter(e => e.type === 'rise').length, 4);
});

test('Building refills stop at the ceiling and allow a rescue slide on either map', () => {
  for (const mode of [classic, shaped]) {
    const engine = createEngine({ playMode: 'totem-building', random: () => 0.5,
      modes: [{ ...mode, reset(state) {
        if (mode.id === 'shaped') state.shape = structuredClone(SHAPES.find(s => s.id === 'funnel'));
        state.blocks = [block(1, 9, 3, 2),
          ...Array.from({ length: 8 }, (_, i) => ({ ...pole(i + 2, 8 - i, 3, 1), smile: 1 }))];
        state.nextId = 10;
        state.nextRow = [{ col: 3, len: 2, color: 1 }];
      } }] });
    const result = engine.dispatch({ type: 'slide', id: 1, col: 2 });
    assert.equal(result.events.filter(e => e.type === 'rise' || e.type === 'shaped-rise').length, 1);
    assert.equal(result.state.phase, 'play');
    assert.equal(Math.min(...result.state.blocks.map(b => b.row)), 0);
    for (const event of result.events) valid(event.state);
    const rescued = engine.dispatch({ type: 'slide', id: 9, col: 4 });
    assert.equal(rescued.accepted, true);
    assert.notEqual(rescued.state.gameOverReason, 'top-out');
    valid(rescued.state);
  }
});

test('a cleared Diamond Building board refills with usable previews instead of ending empty', () => {
  const engine = createEngine({ playMode: 'totem-building', random: () => 0.5,
    modes: [{ ...shaped, reset(state, random) {
      state.shape = structuredClone(SHAPES.find(s => s.id === 'diamond'));
      state.blocks = [block(1, 9, 2, 2), block(2, 8, 3, 2)];
      state.nextId = 3;
      state.nextRow = generateShapedNextRow(state, random);
    } }] });
  const result = engine.dispatch({ type: 'slide', id: 2, col: 4 });
  assert.ok(result.events.some(e => e.type === 'clear'));
  assert.equal(result.events.filter(e => e.type === 'shaped-rise').length, 4);
  assert.equal(result.state.phase, 'play');
  assert.ok(result.state.blocks.length);
  for (const event of result.events) {
    assert.ok(event.state.nextRow.length);
    valid(event.state);
  }
});
