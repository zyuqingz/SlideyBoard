import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresenter } from '../js/presenter.js';
import { createState } from '../js/sim.js';
import { monsterGeometry } from '../js/monster.js';

const initial = () => ({ ...createState(0, 'easy', 'totem-building'),
  blocks: [{ id: 1, row: 8, col: 2, len: 2, color: 0 }], nextRow: [] });
const setup = () => {
  const p = createPresenter({ sfx: () => {}, boardY: () => 350 });
  p.reset(initial());
  return p;
};
async function advance(p, ms) {
  p.update(ms);
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

test('gaze follows the pointer smoothly, stays bounded, and freezes in menus', () => {
  const p = setup(), m = p.present.monster;
  m.target = { x: 10000, y: 10000 };
  p.update(16);
  const first = { ...m.eyes[0] };
  assert.ok(first.x > 0 && first.y > 3);
  p.update(200);
  assert.ok(m.eyes[0].x > first.x);
  assert.ok(Math.hypot(m.eyes[0].x, m.eyes[0].y) <= 8);
  p.present.menu = 'pause';
  const frozen = structuredClone(m);
  p.update(1000);
  assert.deepEqual(m, frozen);
  p.present.menu = null;
  m.target = { x: -10000, y: -10000 };
  p.update(500);
  assert.ok(m.eyes.every(eye => eye.x < 0 && eye.y < 0));
  p.reset(initial());
  assert.equal(p.present.monster.target, null);
  const shaped = { shape: { rows: [{ left: 2, right: 7 }] } };
  const geometry = monsterGeometry(shaped, 350);
  assert.equal((geometry.eyes[0] + geometry.eyes[1]) / 2, geometry.center);
});

test('clears and Junior arrivals trigger a timed smile without extending board playback', async () => {
  for (const type of ['clear', 'totem-drop']) {
    const p = setup(), state = initial();
    const event = type === 'clear'
      ? { type, state: { ...state, blocks: [] }, blocks: state.blocks, rows: [8] }
      : { type, id: 2, state: { ...state, blocks: [...state.blocks,
        { id: 2, kind: 'totem', row: -1, col: 4, len: 1, color: 0, smile: 1 }] } };
    const playback = p.play({ accepted: true, events: [event,
      { type: 'turn-complete', state: event.state }] });
    await advance(p, 100);
    assert.ok(p.present.monster.smile > 0.5, type);
    p.present.menu = 'pause';
    const smile = p.present.monster.smile;
    await advance(p, 5000);
    assert.equal(p.present.monster.smile, smile);
    p.present.menu = null;
    for (let i = 0; i < 12; i++) await advance(p, 100);
    assert.equal(p.busy, false);
    assert.equal(await playback, true);
    await advance(p, 2000);
    assert.ok(p.present.monster.smile < 0.01);
  }
});

test('panic uses visible occupied cells, overrides smiles, and recovers after a rescue', () => {
  const p = setup(), b = p.state.blocks[0], v = p.viewOf(b), m = p.present.monster;
  m.happyUntil = 5000;
  b.row = 1;
  v.vy = 2;
  p.update(500);
  assert.equal(m.panic, 0, 'logical destination must not warn before the rise is visible');
  assert.ok(m.smile > 0.99);
  v.vy = 1;
  p.update(500);
  assert.ok(m.panic > 0.99);
  assert.ok(m.smile < 0.01);
  v.clearing = true;
  p.update(500);
  assert.ok(m.panic < 0.01, 'a cleared ceiling tile no longer threatens the creature');
  v.clearing = false;
  v.vy = -2;
  p.update(500);
  assert.ok(m.panic < 0.01, 'incoming pieces above the mouth are excluded');
  b.kind = 'totem'; b.cells = [{ row: 0, col: 0 }, { row: 2, col: 0 }];
  p.update(500);
  assert.ok(m.panic > 0.99, 'each occupied cell of a tall piece is checked');
});

test('partially entering cells trigger panic before their top edge reaches the board', () => {
  const p = setup(), v = p.viewOf(p.state.blocks[0]), m = p.present.monster;
  m.happyUntil = 5000;
  for (const [row, danger] of [[-1.25, false], [-1, false], [-0.25, true],
    [0, true], [1.75, true], [2, false]]) {
    v.vy = row;
    p.update(16);
    assert.equal(m.panic, danger ? 1 : 0, `cell at row ${row}`);
    assert.equal(m.smile, danger ? 0 : 1, 'visible danger overrides the arrival smile');
  }
  v.vy = -0.25;
  v.clearing = true;
  p.update(16);
  assert.equal(m.panic, 0, 'departing cells are excluded even when partially visible');
});

test('Junior spawn waves never cause panic in transit but landed ceiling Juniors do', async () => {
  for (const rows of [[7], [7, 6], [1], [0]]) {
    const p = setup(), state = initial(), events = [], moves = [];
    for (const [index, row] of rows.entries()) {
      const block = { id: index + 2, kind: 'totem', row: -1, col: 4, len: 1, height: 1, color: 0, smile: 1 };
      state.blocks.push(block);
      events.push({ type: 'totem-drop', id: block.id, state: structuredClone(state) });
      moves.push({ id: block.id, from: -1, to: row });
      block.row = row;
    }
    events.push({ type: 'gravity', moves, state: structuredClone(state) },
      { type: 'turn-complete', state: structuredClone(state) });
    const playback = p.play({ accepted: true, events });
    const crossed = new Set();
    for (let frame = 0; frame < 120 && p.busy; frame++) {
      await advance(p, 16);
      let landedDanger = false;
      for (const block of p.state.blocks.filter(b => b.kind === 'totem')) {
        const v = p.viewOf(block);
        if (v.vy > -1 && v.vy < 2) {
          if (v.spawning) crossed.add(block.id);
          else landedDanger = true;
        }
      }
      assert.equal(p.present.monster.panic, landedDanger ? 1 : 0, `rows ${rows}, frame ${frame}`);
    }
    assert.equal(await playback, true);
    assert.equal(crossed.size, rows.length, 'every arriving Junior visibly crosses the danger zone');
    for (const block of p.state.blocks.filter(b => b.kind === 'totem'))
      assert.equal(p.viewOf(block).spawning, false, 'arrival exemption ends at landing');
    if (rows[0] === 7) {
      const block = p.state.blocks.find(b => b.id === 2);
      const risen = structuredClone(p.state);
      risen.blocks.find(b => b.id === 2).row = 1;
      const rise = p.play({ accepted: true, events: [
        { type: 'rise', state: risen }, { type: 'turn-complete', state: risen }
      ] });
      for (let frame = 0; frame < 40 && p.busy; frame++) await advance(p, 16);
      assert.equal(await rise, true);
      assert.equal(p.viewOf(block).vy, 1);
      assert.equal(p.present.monster.panic, 1, 'a later rise still warns about the Junior');
    }
  }
});

test('spawn exemption preserves existing danger, pauses with playback, and clears on reset', async () => {
  const p = setup(), state = initial();
  state.blocks[0].row = 1;
  p.reset(state);
  const junior = { id: 2, kind: 'totem', row: -1, col: 4, len: 1, height: 1, color: 0, smile: 1 };
  const dropped = { ...state, blocks: [...state.blocks, junior] };
  const landed = { ...state, blocks: [...state.blocks, { ...junior, row: 7 }] };
  const playback = p.play({ accepted: true, events: [
    { type: 'totem-drop', id: 2, state: dropped },
    { type: 'gravity', moves: [{ id: 2, from: -1, to: 7 }], state: landed },
    { type: 'turn-complete', state: landed }
  ] });
  await advance(p, 16);
  await advance(p, 100);
  assert.equal(p.present.monster.panic, 1, 'spawning cannot hide other ceiling tiles');
  assert.equal(p.viewOf(junior).spawning, true);
  const row = p.viewOf(junior).vy;
  p.present.menu = 'pause';
  await advance(p, 2000);
  assert.equal(p.viewOf(junior).vy, row);
  assert.equal(p.viewOf(junior).spawning, true);
  p.reset({ ...initial(), blocks: [{ ...junior, row: 1 }] });
  await advance(p, 1000);
  assert.equal(await playback, false);
  assert.equal(p.viewOf(junior).spawning, false);
  assert.equal(p.present.monster.panic, 1, 'reused IDs after reset do not retain an exemption');
});

test('death begins before the result overlay and reset cancels stale reactions', async () => {
  const p = setup();
  const over = { ...initial(), phase: 'over' };
  const playback = p.play({ accepted: true, events: [
    { type: 'game-over', blockIds: [1], state: over }
  ] });
  assert.equal(p.present.monster.dead, true);
  assert.equal(p.present.overlayA, 0);
  p.reset(initial());
  await advance(p, 2000);
  assert.equal(await playback, false);
  assert.equal(p.present.monster.dead, false);
  assert.equal(p.present.monster.smile, 0);
  p.reset(over);
  assert.equal(p.present.monster.dead, true);
});
