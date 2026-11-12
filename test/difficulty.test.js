import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS } from '../js/board.js';
import { createEngine } from '../js/engine.js';
import { generateRowCandidate, generateNextRow } from '../js/spawn.js';
import { generateNormalRow } from '../js/difficulty.js';
import { createState } from '../js/sim.js';
import { levelForBuildingLines } from '../js/play-mode.js';
import { generateShapedCandidate } from '../js/shaped-spawn.js';
import { SHAPES } from '../js/shapes.js';

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const variants = [
  { id: 'classic', generate: (state, random) => generateRowCandidate(state.level, random, state.difficulty) },
  ...SHAPES.map(shape => ({ id: `shaped/${shape.id}`, shape, generate: generateShapedCandidate }))
];

test('Normal substantially reduces singleton frequency in every mode and shape at early and late levels', () => {
  for (const variant of variants) for (const level of [1, 11]) {
    const stats = {};
    const { left, right } = variant.shape?.rows[ROWS - 1] ?? { left: 0, right: COLS };
    for (const difficulty of ['easy', 'normal']) {
      const random = seeded(1234);
      let singles = 0, blocks = 0, cells = 0;
      for (let i = 0; i < 1000; i++) {
        const row = variant.generate({ level, difficulty, shape: variant.shape }, random);
        let end = left, occupied = 0;
        for (const block of row) {
          assert.ok(block.col >= end && block.col + block.len <= right);
          assert.ok(block.len >= 1 && block.len <= 4);
          end = block.col + block.len;
          occupied += block.len;
          singles += block.len === 1 ? 1 : 0;
        }
        assert.ok(occupied > 0 && occupied < right - left);
        cells += occupied;
        blocks += row.length;
      }
      stats[difficulty] = { rate: singles / blocks, cells };
    }
    assert.ok(stats.normal.rate < stats.easy.rate * 0.5,
      `${variant.id} level ${level}: ${JSON.stringify(stats)}`);
    assert.ok(stats.normal.cells > stats.easy.cells, `${variant.id}: Normal rows should be denser`);
  }
});

test('all modes use identical Normal row policy for identical row spans and RNG', () => {
  const shape = SHAPES.find(shape => shape.id === 'funnel');
  for (const level of [1, 5, 11]) {
    const state = { level, difficulty: 'normal', shape };
    const randoms = [seeded(42), seeded(42)];
    for (let i = 0; i < 100; i++) {
      const classic = generateRowCandidate(level, randoms[0], 'normal');
      assert.deepEqual(generateShapedCandidate(state, randoms[1]), classic);
    }
  }
});

test('Normal is applied to openings and searched previews, and persists across turns, restarts, and modes', () => {
  for (const modeId of ['classic', 'shaped']) {
    const counts = {};
    for (const difficulty of ['easy', 'normal']) {
      let singles = 0, blocks = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const engine = createEngine({ modeId, difficulty, random: seeded(seed) });
        const state = engine.snapshot();
        assert.equal(state.difficulty, difficulty);
        for (const block of [...state.blocks, ...state.nextRow]) {
          singles += block.len === 1 ? 1 : 0;
          blocks++;
        }
      }
      counts[difficulty] = singles / blocks;
    }
    assert.ok(counts.normal < counts.easy * 0.5, `${modeId}: ${JSON.stringify(counts)}`);
  }

  const engine = createEngine({ difficulty: 'normal', random: seeded(10) });
  for (const modeId of ['classic', 'shaped']) {
    assert.equal(engine.reset(modeId).difficulty, 'normal');
    const state = engine.reset();
    assert.equal(state.difficulty, 'normal');
    const block = state.blocks.find(b => {
      const [min, max] = engine.moveRange(b.id);
      return min !== max;
    });
    assert.ok(block, `${modeId} has an opening move`);
    const [min, max] = engine.moveRange(block.id);
    const result = engine.dispatch({ type: 'slide', id: block.id, col: min === block.col ? max : min });
    assert.ok(result.accepted);
    assert.equal(result.state.difficulty, 'normal');
    assert.ok(result.events.every(event => event.state.difficulty === 'normal'));
  }
  assert.equal(engine.reset(undefined, { difficulty: 'easy' }).difficulty, 'easy');
  assert.equal(engine.reset('classic').difficulty, 'easy');
});

test('Normal generation remains bounded for constant random streams and narrow spans', () => {
  for (const value of [0, 0.5, 0.999999]) for (const variant of variants) {
    let calls = 0;
    const row = variant.generate({ level: 1, difficulty: 'normal', shape: variant.shape }, () => {
      assert.ok(++calls < 100);
      return value;
    });
    assert.ok(row.length);
  }
});

test('Building Normal rows fill usable runs without dropping avoidable single cells', () => {
  for (const run of [2, 3, 4, 5, 6, 7]) {
    for (const value of [0, 0.25, 0.75, 0.999999]) {
      let calls = 0;
      // Choose one gap at the left edge, then exercise the block-length weights.
      const random = () => ++calls <= 2 ? 0 : value;
      const row = generateNormalRow(1, random, 0, run + 1, 2);
      assert.ok(row.every(b => b.len >= 2 && b.len <= 4));
      assert.equal(row.reduce((sum, b) => sum + b.len, 0), run);
      assert.equal(row[0].col, 1);
    }
  }
});

test('Building candidates always contain usable blocks and a gap, including narrow spans and constant RNG', () => {
  for (const shape of [null, ...SHAPES]) for (const difficulty of ['easy', 'normal']) {
    const { left, right } = shape?.rows[ROWS - 1] ?? { left: 0, right: COLS };
    for (const level of [1, 11]) {
      const streams = [seeded(1), ...[0, 0.25, 0.5, 0.75, 0.999999].map(value => () => value)];
      for (const stream of streams) for (let i = 0; i < 100; i++) {
        let calls = 0;
        const random = () => { assert.ok(++calls < 100, 'generation must be bounded'); return stream(); };
        const row = shape
          ? generateShapedCandidate({ shape, difficulty, level, playMode: 'totem-building' }, random)
          : generateRowCandidate(level, random, difficulty, 2);
        assert.ok(row.length, `${shape?.id ?? 'classic'} ${difficulty}: empty row`);
        let end = left, occupied = 0;
        for (const b of row) {
          assert.ok(b.len >= 2 && b.len <= 4);
          assert.ok(b.col >= end && b.col + b.len <= right);
          end = b.col + b.len;
          occupied += b.len;
        }
        assert.ok(occupied < right - left, 'leave a gap');
      }
    }
  }
});

test('Classic Building preview generation uses its line level curve', () => {
  for (const difficulty of ['easy', 'normal']) for (const lines of [8, 25, 50]) {
    const state = { ...createState(0, difficulty, 'totem-building'), lines, level: levelForBuildingLines(lines) };
    // Empty boards use the candidate fallback, allowing identical RNG streams to
    // compare the preview against candidate generation at the actual game level.
    for (let seed = 0; seed < 20; seed++) {
      assert.deepEqual(generateNextRow(state, seeded(seed)),
        generateRowCandidate(state.level, seeded(seed), difficulty, 2));
    }
  }
});
