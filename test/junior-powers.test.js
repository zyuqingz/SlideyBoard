import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../js/engine.js';
import { classic } from '../js/modes.js';
import { shaped } from '../js/shaped-mode.js';
import { createPresenter } from '../js/presenter.js';
import { spawnBuildingTotem } from '../js/totem-spawn.js';
import { createState } from '../js/sim.js';
import { applyJuniorPower, juniorTarget } from '../js/junior-powers.js';
import { cellsOf } from '../js/block-geometry.js';
import { buildingLevelProgress, buildingScoreProgress, BUILDING_LINES_BASE } from '../js/play-mode.js';

const food = (id, row, col, len = 2) => ({ id, row, col, len, color: 0 });
const junior = (id, row, col, adultVariant, smile = 1) =>
  ({ id, row, col, len: 1, height: 1, color: 4, kind: 'totem', adultVariant, smile });

function fixture({ map = classic, stock = [1, 1, 1, 1], blocks, shape, buildingMode = 2, progress = {} } = {}) {
  let rolls = 0;
  const mode = { ...map, reset(state) {
    Object.assign(state, {
      blocks: blocks ?? [food(1, 9, 0), food(2, 9, 4), food(3, 8, 0),
        food(4, 8, 4), junior(5, 7, 0, 2)],
      juniorCollection: [...stock], nextId: 20,
      nextRow: [food(0, 0, 0), food(0, 0, 4)],
      ...(shape ? { shape } : {}), ...progress
    });
  } };
  const game = createEngine({ modes: [mode], playMode: 'totem-building', buildingMode,
    random: () => { rolls++; return 0.4; } });
  return { game, rolls: () => rolls };
}

test('each Junior power targets its described tiles and spends exactly one matching use', () => {
  for (const [variant, row, col, removed] of [
    [0, 8, 7, [3, 4]], [1, 7, 0, []], [2, 9, 2, [1, 3]], [3, 8, 1, []]
  ]) {
    const { game } = fixture();
    const before = game.snapshot();
    const result = game.dispatch({ type: 'use-junior', variant, row, col });
    assert.equal(result.accepted, true);
    const use = result.events[0];
    assert.equal(use.type, 'junior-use');
    assert.deepEqual(use.blocks.map(b => b.id), removed);
    assert.equal(use.state.juniorCollection[variant], 0);
    assert.deepEqual(use.state.juniorCollection, before.juniorCollection.map((n, i) => n - (i === variant ? 1 : 0)));
    assert.equal(result.state.blocks.find(b => b.id === 5).smile, variant === 1 ? 2 : 1);
    assert.equal(result.state.score, before.score, 'direct tool removal grants no score');
    assert.ok(!result.events.some(e => e.type === 'rise' || e.type === 'shaped-rise'), 'bonus action adds no rise');
    assert.deepEqual(result.state.nextRow, before.nextRow, 'keeps the committed preview');
    assert.equal(game.dispatch({ type: 'use-junior', variant, row, col }).reason, 'unavailable-junior');
  }
});

test('tool-induced level-ups grant one Junior with or without a required refill in both rulesets', async () => {
  for (const buildingMode of [1, 2]) for (const keepFood of [true, false]) {
    const lines = BUILDING_LINES_BASE - 1;
    const progress = buildingMode === 1
      ? { lines, levelProgress: buildingLevelProgress(lines) }
      : { score: 1950, ...buildingScoreProgress(1950) };
    const { game } = fixture({ buildingMode, progress, blocks: [
      food(1, 9, 0), food(2, 9, 5, 3), food(3, 7, 0), food(4, 7, 2, 3),
      ...(keepFood ? [food(5, 6, 0)] : [])
    ] });
    const before = game.snapshot();
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(before);
    const result = game.dispatch({ type: 'use-junior', variant: 2, row: 9, col: 0 });
    assert.equal(result.accepted, true);
    assert.equal(result.state.phase, 'play');
    assert.equal(result.state.level, 2);
    assert.equal(result.events.find(e => e.type === 'clear').state.score, buildingMode === 2 ? 2030 : 0);
    const drops = result.events.filter(e => e.type === 'totem-drop');
    assert.equal(drops.length, 1, 'the natural clear earns exactly one drop this turn');
    const rises = result.events.filter(e => e.type === 'rise');
    assert.equal(rises.length > 0, !keepFood, 'only an unplayable board requires refill');
    if (keepFood) assert.deepEqual(result.state.nextRow, before.nextRow);
    else assert.ok(result.events.indexOf(drops[0]) > result.events.findLastIndex(e => e.type === 'rise'));

    const done = presenter.play(result);
    for (let i = 0; i < 400; i++) {
      presenter.update(16);
      for (let j = 0; j < 12; j++) await Promise.resolve();
    }
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, result.state);
    assert.equal(presenter.present.displayLevel, 2);
    assert.equal(presenter.present.displayProgress, result.state.levelProgress);
    assert.deepEqual(presenter.present.juniorCollection, result.state.juniorCollection);
    const movable = result.state.blocks.find(b => {
      const [min, max] = game.moveRange(b.id);
      return min !== max;
    });
    const [min, max] = game.moveRange(movable.id);
    const next = game.dispatch({ type: 'slide', id: movable.id, col: movable.col === min ? max : min });
    assert.equal(next.accepted, true);
    assert.equal(next.events.filter(e => e.type === 'totem-drop').length, 0, 'the reward is not repeated');
  }
});

test('invalid tool commands preserve stock, board, and RNG, including shaped cutouts', () => {
  const shape = { rows: Array.from({ length: 10 }, () => ({ left: 1, right: 7 })) };
  const { game, rolls } = fixture({ map: shaped, shape, blocks: [food(1, 9, 1)] });
  const before = game.snapshot(), count = rolls();
  for (const command of [
    { variant: 0, row: -1, col: 3 }, { variant: 0, row: 10, col: 3 },
    { variant: 0, row: 9.5, col: 3 }, { variant: 0, row: 9, col: 0 },
    { variant: 0, row: 9, col: 7 }, { variant: 0, row: 9, col: 2.5 },
    { variant: 0, row: 7, col: 3 }, { variant: 1, row: 9, col: 3 },
    { variant: 2, row: 3, col: 3 }, { variant: 3, row: 9, col: 0 },
    { variant: 4, row: 9, col: 3 }, { variant: 1.5, row: 9, col: 3 }
  ]) {
    assert.equal(game.dispatch({ type: 'use-junior', ...command }).accepted, false);
    assert.deepEqual(game.snapshot(), before);
    assert.equal(rolls(), count);
  }
  const target = game.juniorTarget(3, 9, 1);
  target.blockIds.push(999);
  assert.deepEqual(game.juniorTarget(3, 9, 1).blockIds, [1], 'target previews are detached');
});

test('Horns cuts only in-range cells and leaves separate food bars on both sides', () => {
  for (const col of [0, 3, 7]) {
    const originals = [food(1, 6, 0, 8), food(2, 7, 0, 8), food(3, 8, 0, 8),
      food(4, 9, 0, 8), junior(5, 6, 4, 0)];
    const state = { ...createState(0, 'easy', 'totem-building'), blocks: structuredClone(originals),
      juniorCollection: [0, 0, 1, 0], nextId: 6 };
    const result = applyJuniorPower(state, 2, juniorTarget(state, 2, 8, col));
    const worldCells = blocks => blocks.flatMap(b => cellsOf(b).map(cell =>
      `${b.row + cell.row}:${b.col + cell.col}`)).sort();
    const removed = originals.filter(b => b.kind !== 'totem').flatMap(b => cellsOf(b)
      .map(cell => ({ row: b.row + cell.row, col: b.col + cell.col })))
      .filter(cell => Math.abs(cell.row - 8) <= 1 && Math.abs(cell.col - col) <= 1)
      .map(cell => `${cell.row}:${cell.col}`).sort();
    assert.deepEqual(worldCells(result.blocks), removed);
    assert.deepEqual(worldCells([...state.blocks, ...result.blocks]), worldCells(originals),
      'cut fragments and survivors partition the original occupied cells');
    assert.deepEqual(worldCells(result.displayBlocks), worldCells(originals),
      'animation snapshot contains survivors plus only the cut portions');
    assert.deepEqual(state.blocks.find(b => b.id === 5), originals[4], 'juniors are untouched');
    assert.equal(new Set(result.displayBlocks.map(b => b.id)).size, result.displayBlocks.length);
    assert.ok(state.blocks.every(b => !b.cells), 'ordinary food retains its bar appearance');
    assert.equal(state.juniorCollection[2], 0);
    if (col === 3) assert.deepEqual(state.blocks.filter(b => b.row === 8)
      .map(b => [b.col, b.len]), [[0, 2], [5, 3]]);
  }
});

test('Horns fragments animate at their cut positions and survive turn resolution', async () => {
  const { game } = fixture({ blocks: [food(1, 8, 0, 7), food(2, 9, 0), food(3, 9, 5)] });
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(game.snapshot());
  const result = game.dispatch({ type: 'use-junior', variant: 2, row: 7, col: 3 });
  const use = result.events[0];
  assert.deepEqual(use.blocks.map(b => [b.row, b.col, b.len]), [[8, 2, 3]]);
  assert.deepEqual(use.state.blocks.filter(b => b.row === 8).map(b => [b.col, b.len]), [[0, 2], [5, 2]]);
  const done = presenter.play(result);
  const cut = presenter.state.blocks.find(b => b.id === use.blocks[0].id);
  assert.equal(cut.col, 2);
  assert.equal(presenter.viewOf(cut).vx, 2, 'old full-tile position is replaced by the cut position');
  for (let i = 0; i < 160; i++) {
    presenter.update(16);
    for (let j = 0; j < 12; j++) await Promise.resolve();
  }
  assert.equal(await done, true);
  assert.deepEqual(presenter.state.blocks, result.state.blocks);
  assert.equal(result.state.score, 0);
  assert.equal(result.state.blocks.reduce((sum, b) => sum + b.len, 0), 8);
});

test('Bow halves all food once, preserving cells, singletons, and juniors', () => {
  for (const len of [2, 3, 4, 5, 6, 7, 8]) {
    const originals = [food(1, 9, 0, len), food(2, 8, 0, 3), food(3, 7, 0, 1),
      junior(4, 6, 0, 1)];
    const state = { ...createState(0, 'easy', 'totem-building'),
      blocks: structuredClone(originals), juniorCollection: [0, 0, 0, 2], nextId: 5 };
    const target = juniorTarget(state, 3, 0, 7);
    assert.deepEqual(target.blockIds, [1, 2], 'an empty drop cell targets food board-wide');
    const result = applyJuniorPower(state, 3, target);
    assert.deepEqual(result.blocks, [], 'splitting removes no food');
    assert.equal(result.splitBlocks.length, 4, 'each original tile splits exactly once');
    assert.deepEqual(state.blocks.filter(b => b.row === 9).map(b => [b.col, b.len]),
      [[0, Math.floor(len / 2)], [Math.floor(len / 2), Math.ceil(len / 2)]]);
    assert.deepEqual(state.blocks.filter(b => b.row === 8).map(b => [b.col, b.len]), [[0, 1], [1, 2]]);
    const occupied = blocks => blocks.flatMap(b => cellsOf(b).map(cell =>
      `${b.row + cell.row}:${b.col + cell.col}`)).sort();
    assert.deepEqual(occupied(state.blocks), occupied(originals));
    assert.deepEqual(state.blocks.find(b => b.id === 3), originals[2]);
    assert.deepEqual(state.blocks.find(b => b.id === 4), originals[3]);
    assert.equal(new Set(state.blocks.map(b => b.id)).size, state.blocks.length);
    assert.ok(result.splitBlocks.every(b => b.id >= 5 && !b.cells));
    assert.equal(state.juniorCollection[3], 1);
    result.splitBlocks[0].len = 999;
    assert.notEqual(state.blocks[0].len, 999, 'event pieces are detached');
  }
});

test('Bow spends nothing when no food can split', () => {
  for (const blocks of [[], [food(1, 9, 0, 1), junior(2, 8, 0, 1)]]) {
    const { game, rolls } = fixture({ blocks });
    const before = game.snapshot(), count = rolls();
    assert.equal(game.juniorTarget(3, 4, 4), null);
    assert.equal(game.dispatch({ type: 'use-junior', variant: 3, row: 4, col: 4 }).accepted, false);
    assert.deepEqual(game.snapshot(), before);
    assert.equal(rolls(), count);
  }
});

test('Bow pieces fall independently and animate from their cut positions on both maps and rulesets', async () => {
  for (const map of [classic, shaped]) for (const buildingMode of [1, 2]) {
    const shape = map === shaped
      ? { rows: Array.from({ length: 10 }, () => ({ left: 1, right: 7 })) } : undefined;
    const { game } = fixture({ map, shape, buildingMode, blocks: [
      food(1, 9, 1), food(2, 8, 1, 5), junior(3, 7, 1, 0)
    ] });
    const before = game.snapshot();
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(before);
    const result = game.dispatch({ type: 'use-junior', variant: 3, row: 2, col: 4 });
    assert.equal(result.accepted, true);
    const pieces = result.events[0].splitBlocks;
    const left = pieces.find(b => b.row === 8 && b.col === 1);
    const right = pieces.find(b => b.row === 8 && b.col === 3);
    assert.equal(left.len, 2);
    assert.equal(right.len, 3);
    assert.equal(result.state.blocks.find(b => b.id === left.id).row, 8);
    assert.equal(result.state.blocks.find(b => b.id === right.id).row, 9);
    assert.equal(result.state.score, before.score);
    assert.equal(result.state.lines, before.lines);
    assert.deepEqual(result.state.nextRow, before.nextRow);
    assert.ok(!result.events.some(e => e.type === 'rise' || e.type === 'shaped-rise'));
    const done = presenter.play(result);
    assert.equal(presenter.viewOf(right).vx, 3);
    assert.equal(presenter.viewOf(right).vy, 8);
    presenter.update(60);
    const scale = presenter.viewOf(right).s;
    assert.ok(scale > 1);
    presenter.present.menu = 'pause';
    presenter.update(1000);
    assert.equal(presenter.viewOf(right).s, scale, 'split pulse pauses');
    presenter.present.menu = null;
    for (let i = 0; i < 160; i++) {
      presenter.update(16);
      for (let j = 0; j < 12; j++) await Promise.resolve();
    }
    assert.equal(await done, true);
    assert.deepEqual(presenter.state, result.state);
    assert.equal(presenter.viewOf(right).vy, 9);
    assert.equal(presenter.viewOf(right).s, 1);
    assert.deepEqual(presenter.present.juniorCollection, result.state.juniorCollection);

    presenter.reset(before);
    const cancelled = presenter.play(result);
    presenter.update(60);
    presenter.reset(before);
    presenter.update(1000);
    assert.equal(await cancelled, false);
    assert.deepEqual(presenter.state, before);
    assert.deepEqual(presenter.present.juniorCollection, before.juniorCollection);
  }
});

test('Sprout grows only the selected junior and credits its collection in both rulesets', () => {
  for (const buildingMode of [1, 2]) {
    const { game } = fixture({ buildingMode, blocks: [
      food(1, 9, 0), food(2, 8, 0), junior(3, buildingMode === 1 ? 9 : 7, 4, 0, 2),
      junior(4, 8, 6, 3, 2), junior(5, 7, 0, 2, 1), food(6, 9, 6, 1)
    ] });
    const row = buildingMode === 1 ? 9 : 7;
    assert.deepEqual(game.juniorTarget(1, row, 4).blockIds, [3]);
    const result = game.dispatch({ type: 'use-junior', variant: 1, row, col: 4 });
    assert.equal(result.accepted, true);
    assert.deepEqual(result.events[0].blockIds, [3]);
    assert.equal(result.events[0].state.blocks.find(b => b.id === 3).smile, 3);
    assert.deepEqual(result.state.juniorCollection, [2, 0, 1, 1]);
    const collections = result.events.filter(e => e.type === 'totem-collect');
    assert.deepEqual(collections.flatMap(e => e.blocks.map(b => b.adultVariant)), [0]);
    assert.equal(result.state.blocks.find(b => b.id === 4).smile, 2);
    assert.equal(result.state.blocks.find(b => b.id === 5).smile, 1);
    result.state.juniorCollection[0] = 999;
    assert.equal(game.snapshot().juniorCollection[0], 2);
    assert.equal(collections.at(-1).state.juniorCollection[0], 2);
  }
});

test('Sprout rejects food, empty cells, and fully grown juniors without spending a use', () => {
  const { game, rolls } = fixture({ blocks: [
    food(1, 9, 0), junior(2, 8, 0, 0, 1), junior(3, 7, 0, 2, 3)
  ] });
  const before = game.snapshot(), count = rolls();
  for (const [row, col] of [[9, 0], [8, 1], [7, 0]]) {
    assert.equal(game.juniorTarget(1, row, col), null);
    assert.equal(game.dispatch({ type: 'use-junior', variant: 1, row, col }).accepted, false);
    assert.deepEqual(game.snapshot(), before);
    assert.equal(rolls(), count);
  }
  const result = game.dispatch({ type: 'use-junior', variant: 1, row: 8, col: 0 });
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].state.blocks.find(b => b.id === 2).smile, 2);
  assert.equal(result.events[0].state.blocks.find(b => b.id === 3).smile, 3);
});

test('tools refill an emptied board and remain valid on shaped maps', () => {
  for (const map of [classic, shaped]) {
    const shape = map === shaped
      ? { rows: Array.from({ length: 10 }, () => ({ left: 1, right: 7 })) } : undefined;
    const { game } = fixture({ map, shape, blocks: [food(1, 9, 1)] });
    const result = game.dispatch({ type: 'use-junior', variant: 0, row: 9, col: 1 });
    assert.equal(result.accepted, true);
    assert.equal(result.state.phase, 'play');
    assert.ok(result.state.blocks.some(b => {
      const [min, max] = game.moveRange(b.id);
      return min < max;
    }));
    assert.equal(result.state.juniorCollection[0], 0);
  }
});

test('spawned identities belong to gameplay and survive presenter resets', () => {
  for (let variant = 0; variant < 4; variant++) {
    const state = createState(0, 'easy', 'totem-building');
    const b = spawnBuildingTotem(state, () => (variant + 0.5) / 32);
    assert.equal(b.adultVariant, variant);
    const presenter = createPresenter({ appearanceRandom: () => { throw Error('identity rerolled'); } });
    presenter.reset(state);
    assert.equal(presenter.viewOf(b).adultVariant, variant);
    presenter.reset(state);
    assert.equal(presenter.viewOf(b).adultVariant, variant);
  }
});

test('Junior spending plays once while collection arrivals, pause, and reset keep inventory consistent', async () => {
  const { game } = fixture({ blocks: [food(1, 9, 0), junior(2, 8, 0, 3, 2)] });
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(game.snapshot());
  const result = game.dispatch({ type: 'use-junior', variant: 1, row: 8, col: 0 });
  const done = presenter.play(result);
  assert.deepEqual(presenter.present.juniorCollection, [1, 0, 1, 1]);
  presenter.present.menu = 'pause';
  presenter.update(1000);
  assert.equal(presenter.viewOf(presenter.state.blocks[1]).expression, 2);
  presenter.present.menu = null;
  for (let i = 0; i < 160; i++) {
    presenter.update(16);
    for (let j = 0; j < 12; j++) await Promise.resolve();
  }
  assert.equal(await done, true);
  assert.deepEqual(presenter.present.juniorCollection, result.state.juniorCollection);
  assert.equal(presenter.present.juniorCollection[3], 2);
  assert.equal(presenter.present.displayScore, result.state.score);
  presenter.reset(game.snapshot());
  assert.deepEqual(presenter.present.juniorCollection, result.state.juniorCollection, 'recovery retains stock');
  const next = game.dispatch({ type: 'use-junior', variant: 3, row: 9, col: 0 });
  const cancelled = presenter.play(next);
  presenter.reset(createState());
  presenter.update(1000);
  assert.equal(await cancelled, false);
  assert.deepEqual(presenter.present.juniorCollection, [0, 0, 0, 0]);
});
