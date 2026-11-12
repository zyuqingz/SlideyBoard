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
