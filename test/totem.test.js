import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { createState } from '../js/sim.js';
import { totem } from '../js/totem-mode.js';
import { totemGrid, totemGravity, totemSlideRange, totemFullRows, clearTotemRows } from '../js/totem-board.js';
import { spawnTotem, chooseTotemRows } from '../js/totem-spawn.js';

const block = (id, row, col, len = 1) => ({ id, row, col, len, color: 0 });
const pole = (id, row, col, height) => ({ ...block(id, row, col), kind: 'totem', height });
function seeded(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
function fixture(blocks) {
  return { ...createState(), blocks, nextId: 100, nextRow: [{ col: 0, len: 1, color: 0 }] };
}
function engineFor(state) {
  return createEngine({ modeId: 'totem', random: seeded(123), modes: [{ ...totem,
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
      assert.equal(b.len, 1);
      assert.ok(b.height >= 1 && b.height <= 3);
    }
    for (let r = b.row; r < b.row + (b.height ?? 1); r++) {
      for (let c = b.col; c < b.col + b.len; c++) {
        const key = `${r}:${c}`;
        assert.ok(!cells.has(key), `overlap at ${key}`); cells.add(key);
      }
    }
  }
}

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

test('normal row clears shorten a totem, including clearing its middle or several segments', () => {
  for (const rows of [[7], [8], [9], [7, 9], [7, 8, 9]]) {
    const state = fixture([pole(1, 7, 8, 3), ...[7, 8, 9].map(r => block(r, r, 0, 8))]);
    assert.deepEqual(totemFullRows(state), [7, 8, 9]);
    const before = structuredClone(state.blocks[0]);
    const geometry = clearTotemRows(state, rows);
    const remaining = state.blocks.find(b => b.id === 1);
    assert.equal(remaining?.height ?? 0, 3 - rows.length);
    assert.equal(geometry.blocks.filter(b => b.kind === 'totem').length, rows.length);
    assert.equal(geometry.displayBlocks.filter(b => b.kind === 'totem').length, 3);
    assert.equal(before.height, 3);
    valid(state);
    totemGravity(state);
    valid(state);
  }
});

test('2–3 cell drops start entirely above the board and highest block, then land without overlap', () => {
  for (const height of [2, 3]) {
    const state = fixture([block(1, 5, 0, 9)]);
    let n = 0;
    const b = spawnTotem(state, () => n++ === 0 ? (height - 1.5) / 2 : 0.5);
    assert.equal(b.height, height);
    assert.ok(b.row + b.height <= 0);
    assert.ok(b.row + b.height <= 5);
    valid(state);
    // Keep the support stationary to inspect the exact landing position.
    state.blocks.push(...[6, 7, 8, 9].map(r => block(r + 10, r, 0, 9)));
    totemGravity(state);
    assert.equal(b.row + b.height, 5);
    valid(state);
    assert.equal(spawnTotem(state, () => 0), null, 'only one live totem');
  }
  const crowded = fixture([block(1, 1, 0, 9)]);
  assert.equal(spawnTotem(crowded, () => 0.9), null, 'defer instead of overlapping or spawning at the ceiling');
});

test('drops land on the highest blocks of uneven stacks, never in a lower column', () => {
  for (const height of [2, 3]) {
    for (const choice of [0, 0.3, 0.7, 0.999]) {
      const state = fixture([
        ...Array.from({ length: 5 }, (_, i) => block(i + 1, i + 5, 3, 2)),
        block(10, 9, 0, 2), block(11, 9, 7)
      ]);
      let calls = 0;
      const b = spawnTotem(state, () => calls++ === 0 ? (height - 1.5) / 2 : choice);
      assert.ok([3, 4].includes(b.col), 'choose a column occupied by a highest block');
      totemGravity(state);
      assert.equal(b.row + b.height, 5, 'bottom cell lands immediately above the global highest row');
      valid(state);
    }
  }
  const crowded = fixture([block(1, 2, 4), block(2, 9, 0)]);
  assert.equal(spawnTotem(crowded, () => 0.9), null,
    'defer when the highest block has insufficient clearance, even if lower columns have room');
});

test('top-edge activation consumes the totem and removes distinct random rows equal to its remaining height', () => {
  for (const height of [1, 2, 3]) {
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

test('seeded Totem games are deterministic, maintain valid geometry, and isolate mode resets', () => {
  let drops = 0, activations = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const a = createEngine({ modeId: 'totem', random: seeded(seed) });
    const b = createEngine({ modeId: 'totem', random: seeded(seed) });
    for (let turn = 0; turn < 80; turn++) {
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
      drops += result.events.filter(e => e.type === 'totem-drop').length;
      activations += result.events.filter(e => e.type === 'totem-activate').length;
    }
    assert.ok(!a.reset('classic').blocks.some(b => b.kind === 'totem'));
    assert.ok(a.reset('shaped').shape);
    assert.equal(a.reset('totem').shape, undefined);
  }
  assert.ok(drops > 0);
  assert.ok(activations > 0);
});
