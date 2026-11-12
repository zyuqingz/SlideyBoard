import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/sim.js';
import { createEngine } from '../js/engine.js';
import { classic } from '../js/modes.js';
import { settleBoard, copyBoard, fullRows, buildGrid } from '../js/board.js';
import { createPresenter } from '../js/presenter.js';
import { buildingScoreProgress } from '../js/play-mode.js';
import { loadBuildingMode, saveBuildingMode } from '../js/storage.js';
import { SHAPES } from '../js/shapes.js';

const tile = (id, row, col, len = 1) => ({ id, row, col, len, color: 0 });
const totem = (id, row, col, smile) => ({ ...tile(id, row, col), kind: 'totem', height: 1, smile });
const stateFor = blocks => ({ ...createState(0, 'easy', 'totem-building', 2),
  blocks, nextId: 100, nextRow: [{ col: 0, len: 2, color: 0 }] });
const engineFor = state => createEngine({ modes: [{ ...classic,
  reset(target) { Object.assign(target, structuredClone(state)); }
}], random: () => 0.5 });

test('Mode 2 keeps immature floor totems while Mode 1 still collects them', () => {
  for (const smile of [1, 2]) for (const buildingMode of [1, 2]) {
    const board = { ...stateFor([totem(1, 7, 0, smile)]), buildingMode };
    const events = [];
    settleBoard(board, type => events.push(type));
    assert.equal(events.includes('totem-collect'), buildingMode === 1);
    assert.equal(board.blocks.length, buildingMode === 1 ? 0 : 1);
  }
});

test('Mode 2 collects at stage 3 in place before cascades can reuse the totem', () => {
  const board = stateFor([totem(1, 8, 7, 2), tile(2, 8, 0, 7),
    tile(3, 9, 6, 2), tile(4, 7, 0, 7)]);
  const preview = copyBoard(copyBoard(board));
  const events = [];
  settleBoard(board, (type, data) => events.push(structuredClone({ type, ...data })));
  settleBoard(preview);
  assert.deepEqual(events.map(e => e.type), ['clear', 'totem-collect', 'gravity']);
  assert.equal(events[1].blocks[0].row, 8);
  assert.equal(events[1].blocks[0].smile, 3);
  assert.ok(!board.blocks.some(b => b.id === 1));
  assert.deepEqual(board.blocks, preview.blocks);
  assert.deepEqual(fullRows(board), []);
});

test('Mode 2 collections add no score, progress, or level-up spawn bonus', () => {
  const initial = stateFor([totem(1, 8, 7, 2), tile(2, 8, 0, 7), tile(3, 9, 6, 2), tile(4, 9, 0, 2)]);
  initial.score = 650;
  Object.assign(initial, buildingScoreProgress(initial.score));
  const result = engineFor(initial).dispatch({ type: 'slide', id: 4, col: 1 });
  const clear = result.events.find(e => e.type === 'clear');
  const collect = result.events.find(e => e.type === 'totem-collect');
  assert.equal(clear.award.pts, 70);
  assert.equal(clear.state.score, 720);
  assert.equal(clear.state.levelProgress, 0.72);
  assert.equal(collect.award, undefined);
  assert.equal(collect.state.score, 720);
  assert.equal(collect.state.best, clear.state.best);
  assert.equal(collect.state.level, 1);
  assert.equal(collect.state.levelProgress, 0.72);
  assert.equal(result.events.filter(e => e.type === 'totem-drop').length, 1, 'only the empty-board replacement');
});

test('Mode 2 power upgrades every totem, scores the wipe, and collects each once in place', () => {
  const initial = stateFor([totem(1, 5, 3, 1), totem(2, 7, 5, 2), tile(3, 8, 0, 4), tile(4, 9, 4, 4)]);
  initial.score = 400;
  Object.assign(initial, buildingScoreProgress(initial.score));
  const result = engineFor(initial).dispatch({ type: 'power-mode' });
  const clear = result.events[0], collect = result.events[1];
  assert.equal(clear.godClear, true);
  assert.equal(clear.award.pts, 120);
  assert.ok(clear.state.blocks.every(b => b.smile === 3));
  assert.equal(collect.type, 'totem-collect');
  assert.deepEqual(collect.blocks.map(b => [b.id, b.row]), [[1, 5], [2, 7]]);
  assert.equal(collect.award, undefined);
  assert.equal(collect.state.score, 520, 'only the food wipe scores');
  assert.equal(collect.state.blocks.length, 0);
  assert.equal(collect.state.level, 1);
  assert.equal(result.events.filter(e => e.type === 'totem-collect').length, 1);
});

test('Mode 2 all-totem row triggers one power wipe before collection', () => {
  const board = stateFor(Array.from({ length: 8 }, (_, col) => totem(col + 1, 9, col, col % 2 + 1)));
  const events = [];
  settleBoard(board, (type, data) => events.push({ type, ...data }));
  assert.deepEqual(events.map(e => e.type), ['clear', 'totem-collect']);
  assert.equal(events[0].godClear, true);
  assert.equal(events[1].blocks.length, 8);
  assert.ok(events[1].blocks.every(b => b.smile === 3));
  assert.deepEqual(board.blocks, []);
});

test('ruleset defaults to Mode 1 and persists across maps, play modes, and resets', () => {
  const engine = createEngine({ playMode: 'totem-building', random: () => 0.5 });
  assert.equal(engine.snapshot().mode, 'classic');
  assert.equal(engine.snapshot().buildingMode, 1);
  assert.equal(engine.reset(undefined, { buildingMode: 2 }).buildingMode, 2);
  assert.equal(engine.reset('shaped', { modeOptions: { shapeId: 'funnel' } }).buildingMode, 2);
  assert.equal(engine.reset(undefined, { playMode: 'standard' }).buildingMode, 2);
  assert.equal(engine.reset(undefined, { playMode: 'totem-building' }).buildingMode, 2);
  assert.equal(engine.reset().buildingMode, 2);
  assert.equal(engine.reset(undefined, { buildingMode: 1 }).buildingMode, 1);
});

test('ruleset storage defaults safely and restores the saved toggle', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value)
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage);
  assert.equal(loadBuildingMode(), 2);
  saveBuildingMode(1);
  assert.equal(loadBuildingMode(), 1);
  saveBuildingMode(2);
  assert.equal(loadBuildingMode(), 2);
});

test('Mode 2 playback flies from the upgrade position and banks only tile scores', async () => {
  for (const step of [16, 250, 1000]) {
    const initial = stateFor([totem(1, 5, 3, 1), tile(2, 8, 0, 4), tile(3, 9, 4, 4)]);
    initial.score = 500;
    Object.assign(initial, buildingScoreProgress(initial.score));
    const result = engineFor(initial).dispatch({ type: 'power-mode' });
    const presenter = createPresenter({ sfx: () => {} });
    presenter.reset(initial);
    const done = presenter.play(result);
    let finished = false;
    done.then(() => { finished = true; });
    let flew = false;
    for (let i = 0; i < 2000; i++) {
      presenter.update(step);
      for (let j = 0; j < 12; j++) await Promise.resolve();
      const flying = presenter.present.flyingTotems.find(item => item.block.id === 1);
      if (flying) {
        assert.equal(flying.view.vy, 5);
        flew ||= !!flying.view.flight;
      }
      if (finished && !presenter.effects.hasTweens()) break;
    }
    assert.ok(finished, `playback finishes at ${step}ms steps`);
    assert.equal(await done, true);
    if (step < 1000) assert.ok(flew);
    assert.equal(presenter.present.displayScore, result.state.score);
    assert.equal(presenter.present.displayLevel, result.state.level);
    assert.equal(presenter.present.displayProgress, result.state.levelProgress);
    assert.deepEqual(presenter.state, result.state);
  }
});

test('Mode 2 seeded play stays settled and collision-free on every map', () => {
  for (const shapeId of [null, ...SHAPES.map(s => s.id)]) {
    let seed = 41;
    const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
    const engine = createEngine({ playMode: 'totem-building', buildingMode: 2, random,
      modeId: shapeId ? 'shaped' : 'classic', modeOptions: { shapeId } });
    for (let turn = 0; turn < 15 && engine.snapshot().phase === 'play'; turn++) {
      const state = engine.snapshot();
      assert.deepEqual(fullRows(state), []);
      assert.ok(state.blocks.every(b => b.kind !== 'totem' || b.smile < 3));
      const grid = buildGrid(state);
      assert.equal(grid.flat().filter(Boolean).length, state.blocks.reduce((sum, b) => sum + b.len, 0));
      const command = state.blocks.flatMap(b => {
        const [min, max] = engine.moveRange(b.id);
        return min === max ? [] : [{ type: 'slide', id: b.id, col: b.col === min ? max : min }];
      })[0];
      assert.ok(command);
      const result = engine.dispatch(command);
      assert.ok(result.accepted);
      assert.ok(result.events.filter(e => e.type === 'totem-drop').length <= 4);
    }
  }
});
