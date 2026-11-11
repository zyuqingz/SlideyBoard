import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { createState, rise, awardTotemCollect } from '../js/sim.js';
import { resolveTurn, spawnOpeningTotem } from '../js/turn.js';
import { classic } from '../js/modes.js';
import { shaped } from '../js/shaped-mode.js';
import { buildGrid as totemGrid, computeGravity as totemGravity, slideRange as totemSlideRange,
  fullRows as totemFullRows, clearRows as clearTotemRows,
  settleBoard, copyBoard, insertRow, occupiedTileRows, hasMoves } from '../js/board.js';
import { cellsOf } from '../js/block-geometry.js';
import { spawnTotem, spawnBuildingTotem } from '../js/totem-spawn.js';
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

test('building level-up bonuses use the new level, capped at 4 across the turn', () => {
  assert.equal(buildingTotemsForLevelUp(1, 1), 0);
  assert.equal(buildingTotemsForLevelUp(1, 2), 2);
  assert.equal(buildingTotemsForLevelUp(2, 3), 3);
  assert.equal(buildingTotemsForLevelUp(3, 4), 4);
  assert.equal(buildingTotemsForLevelUp(4, 5), 4);
  assert.equal(buildingTotemsForLevelUp(5, 6), 4);
  assert.equal(buildingTotemsForLevelUp(1, 3), 4);
  assert.equal(buildingTotemsForLevelUp(4, 6), 4);
  assert.equal(buildingTotemsForLevelUp(100, 1000), 4);
});

test('Totem Building opening totem is already on the board', () => {
  const engine = createEngine({ modeId: 'classic', playMode: 'totem-building', random: seeded(123) });
  const totems = engine.snapshot().blocks.filter(b => b.kind === 'totem');
  assert.equal(totems.length, 1);
  assert.ok(totems[0].row >= 1);
});

test('Building openings resolve completed rows and floor drops before the first slide', () => {
  for (const [modeId, shapeId, seed] of [
    ['classic', undefined, 1], ['shaped', 'funnel', 35],
    ['shaped', 'diamond', 5], ['shaped', 'corridor', 4]
  ]) {
    const engine = createEngine({ modeId, playMode: 'totem-building',
      modeOptions: { shapeId }, random: seeded(seed) });
    const state = engine.snapshot();
    const opening = engine.opening();
    assert.ok(opening.events.some(e => e.type === 'clear'));
    assert.deepEqual(totemFullRows(state), []);
    assert.ok(!state.blocks.some(b => b.kind === 'totem' && b.row === 9));
    assert.ok(hasMoves(state));
    assert.equal(state.hasMoved, false);
    assert.deepEqual(opening.events.at(-1).state, state);
    assert.equal(state.score, opening.events.reduce((sum, e) => sum
      + (e.collectionAward?.pts ?? (e.type === 'totem-collect' ? e.award.pts : 0)), 0));
    const saved = engine.opening();
    opening.events[0].state.blocks.length = 0;
    assert.deepEqual(engine.opening(), saved, 'opening events are detached');
    assert.deepEqual(engine.snapshot(), state);
    for (const event of saved.events) valid(event.state);
  }
});

test('Building openings remain playable with constant RNG on every map', () => {
  for (const difficulty of ['easy', 'normal']) {
    for (const shapeId of [null, ...SHAPES.map(s => s.id)]) {
      for (const roll of [0, 0.1, 0.25, 0.5, 0.75, 0.999]) {
        const engine = createEngine({ playMode: 'totem-building', difficulty,
          modeId: shapeId ? 'shaped' : 'classic', modeOptions: { shapeId }, random: () => roll });
        const state = engine.snapshot();
        assert.equal(state.phase, 'play', `${difficulty}, ${shapeId}, ${roll}`);
        assert.deepEqual(totemFullRows(state), []);
        assert.ok(!state.blocks.some(b => b.kind === 'totem' && b.row === 9));
        assert.ok(hasMoves(state));
        valid(state);
      }
    }
  }
});

test('Totem Building drops every level-up totem during the same turn', () => {
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
  assert.equal(drop.events.filter(e => e.type === 'totem-drop').length, 3,
    'one replacement plus two level-up extras');
  assert.ok(drop.events.findIndex(e => e.type === 'totem-drop')
    > drop.events.findLastIndex(e => e.type === 'rise'));
  assert.ok(drop.state.blocks.some(b => b.kind === 'totem'), 'drops land on the refill');

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

test('Building replaces a collected last totem without needing a level-up on either map', () => {
  for (const shaped of [false, true]) {
    const initial = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
      ...(shaped ? { shape: { rows: Array.from({ length: 10 }, () => ({ left: 2, right: 7 })) } } : {}),
      blocks: [{ ...pole(1, 9, 6, 1), smile: 2 }, block(2, 9, shaped ? 2 : 0, 2)] };
    const events = [];
    resolveTurn(initial, () => 0, (type, data) => events.push({ type, ...structuredClone(data) }),
      () => insertRow(initial, [{ col: 2, len: 2, color: 0 }]));
    assert.equal(initial.phase, 'play');
    assert.equal(initial.level, 1);
    assert.equal(initial.score, 100);
    assert.equal(events.filter(e => e.type === 'totem-drop').length, 1);
    const replacement = initial.blocks.filter(b => b.kind === 'totem');
    assert.equal(replacement.length, 1);
    assert.notEqual(replacement[0].id, 1);
    assert.equal(replacement[0].smile, 1);
    valid(initial);
  }
});

test('Building gives four level-up extras in addition to an empty-board replacement', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    lines: 19, level: 4, blocks: [block(1, 9, 0, 8)] };
  const events = [];
  resolveTurn(state, () => 0, type => events.push(type),
    () => insertRow(state, [{ col: 0, len: 2, color: 0 }]));
  assert.equal(state.level, 5);
  assert.equal(state.phase, 'play');
  assert.equal(events.filter(type => type === 'totem-drop').length, 5);
  assert.equal(state.blocks.filter(b => b.kind === 'totem').length
    + events.filter(type => type === 'totem-collect').length, 5);
  valid(state);
});

test('Building caps a multi-level clear at four extras plus one replacement', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    lines: 4, level: 1, blocks: Array.from({ length: 9 }, (_, i) => block(i + 1, i + 1, 0, 8)) };
  const events = [];
  resolveTurn(state, () => 0, type => events.push(type),
    () => insertRow(state, [{ col: 0, len: 2, color: 0 }]));
  assert.equal(state.level, 3);
  assert.equal(events.filter(type => type === 'totem-drop').length, 5);
  assert.equal(state.phase, 'play');
  valid(state);
});

test('Building stops at four drops when an existing totem needs no replacement', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    lines: 19, level: 4, blocks: [block(1, 9, 0, 8),
      ...[6, 7, 8].map((row, i) => block(i + 2, row, 0, 2)), pole(10, 5, 0, 1)] };
  const events = [];
  resolveTurn(state, () => 0, type => events.push(type),
    () => insertRow(state, [{ col: 0, len: 2, color: 0 }]));
  assert.equal(state.level, 5);
  assert.equal(events.filter(type => type === 'totem-drop').length, 4);
  assert.equal(state.blocks.filter(b => b.kind === 'totem').length
    + events.filter(type => type === 'totem-collect').length, 5);
  assert.equal(state.phase, 'play');
  valid(state);
});

test('Building drop-induced levels and collections cannot renew the turn budget', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    shape: { rows: Array.from({ length: 10 }, (_, row) => ({ left: row === 0 ? 7 : 0, right: 8 })) },
    lines: 19, level: 4, blocks: [block(1, 9, 0, 8),
      ...[5, 6, 7, 8].map((row, i) => block(i + 2, row, 0, 7))] };
  const events = [];
  resolveTurn(state, () => 0.999, type => events.push(type),
    () => insertRow(state, [{ col: 0, len: 7, color: 0 }]));
  assert.equal(state.level, 9, 'drop cascades cross further levels during the same turn');
  assert.equal(events.filter(type => type === 'totem-drop').length, 5);
  assert.equal(events.filter(type => type === 'totem-collect').length, 5);
  assert.equal(state.blocks.filter(b => b.kind === 'totem').length, 0);
  assert.equal(state.phase, 'play');
  assert.equal(occupiedTileRows(state), 4);
  valid(state);
});

test('Building spends its single replacement even when it immediately collects', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    // Only column zero is reachable from above. Its first drop reaches the floor.
    shape: { rows: Array.from({ length: 10 }, (_, row) => ({ left: 0, right: row === 0 ? 1 : 8 })) },
    blocks: [block(1, 9, 3, 2), block(2, 8, 3, 2)] };
  let rises = 0;
  const events = [];
  resolveTurn(state, () => 0, (type, data) => events.push({ type, ...structuredClone(data) }), () => {
    rises++;
    insertRow(state, [{ col: 3, len: 2, color: 0 }]);
  });
  assert.equal(rises, 2);
  assert.equal(events.filter(e => e.type === 'totem-drop').length, 1);
  assert.equal(events.filter(e => e.type === 'totem-collect').length, 1);
  assert.equal(state.blocks.filter(b => b.kind === 'totem').length, 0);
  assert.equal(state.phase, 'play');
  assert.ok(hasMoves(state));
  // The next turn owns a fresh replacement allowance; none were queued up.
  resolveTurn(state, () => 0, type => events.push({ type }), () => {
    insertRow(state, [{ col: 0, len: 2, color: 0 }]);
  });
  assert.equal(events.filter(e => e.type === 'totem-drop').length, 2);
  assert.equal(state.blocks.filter(b => b.kind === 'totem').length, 1);
  valid(state);
});

test('Totem Building can stack when every column already contains a totem', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    blocks: Array.from({ length: 8 }, (_, col) => pole(col + 1, 8, col, 1)) };
  const incoming = spawnBuildingTotem(state, () => 0);
  assert.equal(incoming.col, 0);
  totemGravity(state);
  assert.equal(incoming.row, 8);
  assert.equal(totemGrid(state)[9][0].kind, 'totem');
  valid(state);
});

test('Building spreads successive drops even with an identical random roll', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    blocks: [block(1, 9, 0, 8)] };
  const cols = [];
  for (let i = 0; i < 4; i++) {
    const incoming = spawnBuildingTotem(state, () => 0);
    cols.push(incoming.col);
    totemGravity(state);
    valid(state);
  }
  assert.equal(new Set(cols).size, 4);
  assert.ok(cols.every((col, i) => cols.slice(i + 1).every(other => Math.abs(col - other) >= 2)));
});

test('Building randomly chooses between equally spaced columns and avoids ceiling landings', () => {
  const choices = new Set();
  for (const roll of [0, 0.999]) {
    const state = { ...fixture([block(1, 9, 0, 8), pole(2, 8, 0, 1), pole(3, 8, 7, 1)]),
      playMode: 'totem-building' };
    choices.add(spawnBuildingTotem(state, () => roll).col);
  }
  assert.deepEqual([...choices].sort(), [3, 4]);
  const crowded = { ...fixture([pole(1, 8, 0, 1), block(2, 9, 0, 8),
    ...Array.from({ length: 8 }, (_, i) => block(i + 3, i + 1, 7))]), playMode: 'totem-building' };
  const incoming = spawnBuildingTotem(crowded, () => 0);
  assert.equal(incoming.col, 6, 'choose the widest safe spacing rather than column 7 at the ceiling');
  totemGravity(crowded);
  valid(crowded);
});

test('Building remembers collected drop columns until the turn ends', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
    lines: 19, level: 4, blocks: [block(1, 9, 0, 8)] };
  const cols = [], collected = [];
  resolveTurn(state, () => 0, (type, data) => {
    if (type === 'totem-drop') cols.push(state.blocks.find(b => b.id === data.id).col);
    if (type === 'totem-collect') collected.push(...data.blocks);
  }, () => insertRow(state, [{ col: 0, len: 2, color: 0 }]));
  assert.equal(cols.length, 5);
  assert.equal(new Set(cols).size, 5, 'floor collections must not attract every remaining drop to one column');
  assert.ok(collected.length > 0);
  valid(state);
});

test('Building level-up drops stack sequentially when only one column is reachable', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 10, lines: 4,
    shape: { rows: Array.from({ length: 10 }, (_, row) => ({ left: 0, right: row === 0 ? 1 : 8 })) },
    nextRow: [{ col: 0, len: 2, color: 0 }], blocks: [
      block(1, 9, 0, 8),
      ...[6, 7, 8].map((row, i) => block(i + 2, row, 0, 2)),
      ...[0, 1].map((col, i) => ({ ...pole(i + 5, 5, col, 1), smile: 1 }))
    ] };
  const events = [];
  resolveTurn(state, () => 0,
    (type, data) => {
      valid(state);
      events.push({ type, ...structuredClone(data), state: structuredClone(state) });
    }, () => rise(state, () => 0.5));
  assert.equal(state.level, 2);
  const drops = events.filter(e => e.type === 'totem-drop');
  assert.equal(drops.length, 2);
  assert.ok(drops.every(e => e.state.blocks.find(b => b.id === e.id).col === 0));
  const first = state.blocks.find(b => b.id === drops[0].id);
  const second = state.blocks.find(b => b.id === drops[1].id);
  assert.equal(second.row, first.row - 1);
  assert.ok(!('pendingTotemSpawns' in state));
  assert.ok(!('totemSpawnBlocked' in state));
  valid(state);
});

test('an empty Building opening resolves and scores its floor collection', () => {
  const initial = createState(0, 'easy', 'totem-building');
  const events = [];
  spawnOpeningTotem(initial, () => 0, (type, data) => events.push({ type, ...data }));
  assert.equal(initial.blocks.length, 0);
  assert.equal(initial.score, 50);
  assert.deepEqual(events.map(e => e.type), ['totem-drop', 'gravity', 'totem-collect']);
  assert.ok(!('pendingTotemSpawns' in initial));
  assert.ok(!('totemSpawnBlocked' in initial));
});

test('Building drops may complete a row and resolve its normal clear and collection', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 10,
    blocks: [block(1, 8, 0, 7), block(2, 9, 0, 8)] };
  const incoming = spawnBuildingTotem(state, () => 0.999);
  const events = [];
  settleBoard(state, (type, data) => events.push({ type, ...structuredClone(data) }));
  assert.equal(incoming.col, 7);
  assert.ok(events.some(e => e.type === 'clear' && e.rows.includes(8)));
  assert.ok(events.some(e => e.type === 'totem-collect' && e.blocks.some(b => b.id === incoming.id)));
});

test('Building ends on a landed ceiling drop without waiting or spawning further tiles', () => {
  const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100, lines: 9, level: 2,
    shape: { rows: Array.from({ length: 10 }, (_, row) => ({ left: row === 0 ? 2 : 0, right: row === 0 ? 3 : 8 })) },
    blocks: [block(1, 9, 0, 8),
      ...Array.from({ length: 8 }, (_, row) => block(row + 2, row + 1, 2, 4))] };
  const events = [];
  resolveTurn(state, () => 0, (type, data) => {
    events.push({ type, ...structuredClone(data), state: structuredClone(state) });
  }, () => insertRow(state, [{ col: 2, len: 4, color: 0 }]));
  assert.equal(state.phase, 'over');
  assert.equal(state.gameOverReason, 'top-out');
  assert.equal(events.filter(e => e.type === 'totem-drop').length, 1);
  const over = events.find(e => e.type === 'game-over');
  assert.ok(over.blockIds.length);
  assert.ok(over.blockIds.every(id => over.state.blocks.find(b => b.id === id).row === 0));
});

test('Building advances a cleared refill with no moves instead of losing below the ceiling', () => {
  const state = createState(0, 'easy', 'totem-building');
  let rises = 0;
  const events = [];
  resolveTurn(state, () => 0, type => events.push(type), () => {
    rises++;
    insertRow(state, [{ col: 0, len: rises <= 4 ? 8 : 2, color: 0 }]);
  });
  assert.equal(rises, 8, 'cleared incoming rows do not count toward the four-row target');
  assert.equal(occupiedTileRows(state), 4);
  assert.equal(state.phase, 'play');
  assert.equal(state.gameOverReason, undefined);
  assert.ok(!events.includes('game-over'));
  assert.deepEqual(totemSlideRange(state, state.blocks[0]), [0, 6]);
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

test('Totem Building randomly chooses floor and stacked columns', () => {
  const landings = new Set(), cols = new Set();
  for (const random of [() => 0, () => 0.49, () => 0.999]) {
    const state = { ...fixture([
      block(1, 7, 2, 2), block(2, 8, 2, 2), block(3, 9, 2, 2),
      block(4, 9, 5, 2)
    ]), playMode: 'totem-building' };
    const incoming = spawnBuildingTotem(state, random);
    assert.ok(incoming.col >= 0 && incoming.col < 8);
    assert.equal(incoming.row, -1, 'the drop still animates from above the board');
    totemGravity(state);
    landings.add(incoming.row);
    cols.add(incoming.col);
    if (incoming.row < 9)
      assert.equal(totemGrid(state)[incoming.row + 1][incoming.col].kind, undefined);
    assert.deepEqual(totemFullRows(state), []);
    valid(state);
  }
  assert.ok(cols.size > 1, 'different rolls pick different columns');
  assert.ok(landings.has(9), 'empty columns remain valid floor landings');
  assert.ok([...landings].some(row => row < 9), 'occupied columns remain valid stacked landings');
});

test('Totem Building always drops with floor or totem support', () => {
  const empty = { ...fixture([]), playMode: 'totem-building' };
  const floorDrop = spawnBuildingTotem(empty, () => 0);
  totemGravity(empty);
  assert.equal(floorDrop.row, 9);
  valid(empty);

  const stacked = { ...fixture([pole(1, 8, 3, 1), block(2, 9, 3)]), playMode: 'totem-building' };
  stacked.shape = { rows: Array.from({ length: 10 }, (_, row) => ({ left: row === 0 ? 3 : 0,
    right: row === 0 ? 4 : 8 })) };
  const stackDrop = spawnBuildingTotem(stacked, () => 0.4);
  totemGravity(stacked);
  assert.equal(stackDrop.col, 3);
  assert.equal(stackDrop.row, 7);
  valid(stacked);
});

test('Totem Building respects shaped entry paths, including ledge landings', () => {
  for (const shape of SHAPES) {
    const state = { ...fixture([
      block(1, 7, 3, 2), block(2, 8, 3, 2), block(3, 9, 3, 2)
    ]), playMode: 'totem-building', shape: structuredClone(shape) };
    const incoming = spawnBuildingTotem(state, () => 0);
    totemGravity(state);
    assert.ok(incoming.row > 0, shape.id);
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

test('Building seeded games remain playable until a visible ceiling loss on both maps', () => {
  for (const difficulty of ['easy', 'normal']) {
    for (const shapeId of [null, ...SHAPES.map(shape => shape.id)]) {
      const options = { playMode: 'totem-building', difficulty,
        modeId: shapeId ? 'shaped' : 'classic', modeOptions: { shapeId } };
      const a = createEngine({ ...options, random: seeded(41) });
      const b = createEngine({ ...options, random: seeded(41) });
      for (let turn = 0; turn < 25; turn++) {
        assert.deepEqual(a.snapshot(), b.snapshot());
        const state = a.snapshot();
        valid(state);
        if (state.phase === 'over') {
          assert.equal(state.gameOverReason, 'top-out');
          assert.ok(state.blocks.some(b => b.row === 0));
          break;
        }
        assert.ok(state.blocks.every(b => b.row > 0));
        const command = firstMove(a);
        assert.ok(command, 'every live Building board offers a slide');
        const result = a.dispatch(command);
        assert.deepEqual(result, b.dispatch(command));
        assert.ok(result.events.filter(e => e.type === 'totem-drop').length <= 5);
        for (const event of result.events) valid(event.state);
      }
    }
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

test('Building refills every row-count boundary on both maps, ignoring totem rows', () => {
  for (const shaped of [false, true]) for (const rows of [0, 1, 2, 3, 4, 5]) {
    const state = { ...createState(0, 'easy', 'totem-building'), nextId: 100,
      ...(shaped ? { shape: { rows: Array.from({ length: 10 }, () => ({ left: 2, right: 7 })) } } : {}),
      blocks: Array.from({ length: rows }, (_, i) => block(i + 1, 9 - i, 2, 2)) };
    if (rows) state.blocks.push(pole(20, 9 - rows, 2, 1));
    let rises = 0;
    resolveTurn(state, () => 0, () => {}, () => {
      rises++;
      (shaped ? insertShapedRow : insertRow)(state, [{ col: 2, len: 2, color: 0 }]);
    });
    assert.equal(rises, Math.max(1, 4 - rows), `${shaped ? 'shaped' : 'classic'}: ${rows} tile rows`);
    assert.equal(occupiedTileRows(state), Math.max(4, rows + 1));
    assert.equal(state.phase, 'play');
    valid(state);
  }
});

test('refill row detection counts occupied shard cells once, excluding holes and totems', () => {
  const state = fixture([block(1, 9, 0, 2), block(2, 9, 3, 2),
    { ...piece(3, 5, 0, ['#.', '..', '##']), kind: undefined, face: 'smile' },
    pole(4, 1, 7, 3)]);
  assert.equal(occupiedTileRows(state), 3, 'only rows 5, 7 and 9 contain ordinary tiles');
});

test('Building refills end immediately at the ceiling on either map', () => {
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
    assert.equal(result.state.phase, 'over');
    assert.equal(result.state.gameOverReason, 'top-out');
    assert.equal(result.events.filter(e => e.type === 'game-over').length, 1);
    assert.equal(Math.min(...result.state.blocks.map(b => b.row)), 0);
    for (const event of result.events) valid(event.state);
    assert.equal(engine.dispatch({ type: 'slide', id: 9, col: 4 }).reason, 'game-over');
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
