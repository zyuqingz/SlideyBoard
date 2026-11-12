import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, computeGravity, fullRows, slideRange, touchingTop, buildGrid
} from '../js/board.js';
import {
  createState, createTurnScore, awardRows, setupClassic, rise
} from '../js/sim.js';
import { generateRowCandidate, generateNextRow } from '../js/spawn.js';
import { CLASSIC_LINES_BASE } from '../js/play-mode.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function assertPacked(pieces) {
  const occ = new Array(COLS).fill(0);
  for (const p of pieces) {
    assert.ok(p.len >= 1 && p.col >= 0 && p.col + p.len <= COLS);
    for (let i = 0; i < p.len; i++) occ[p.col + i]++;
  }
  assert.ok(occ.every(n => n <= 1));
  assert.ok(occ.some(n => n === 0));
}

test('unsupported block falls to the floor', () => {
  const s = createState();
  s.blocks = [{ id: 1, row: 0, col: 0, len: 1, color: 0 }];
  const moved = computeGravity(s);
  assert.equal(s.blocks[0].row, ROWS - 1);
  assert.deepEqual(moved, [{ id: 1, from: 0, to: ROWS - 1 }]);
});

test('a block lands on the one below it, bottom-up', () => {
  const s = createState();
  s.blocks = [
    { id: 1, row: 7, col: 0, len: 1, color: 0 },
    { id: 2, row: 8, col: 0, len: 1, color: 1 }
  ];
  computeGravity(s);
  assert.equal(s.blocks.find(b => b.id === 2).row, 9);
  assert.equal(s.blocks.find(b => b.id === 1).row, 8);
});

test('a wide block cannot fall through a one-cell gap', () => {
  const s = createState();
  s.blocks = [
    { id: 1, row: 0, col: 0, len: 2, color: 0 },
    { id: 2, row: 9, col: 1, len: 1, color: 1 }
  ];
  computeGravity(s);
  assert.equal(s.blocks.find(b => b.id === 1).row, 8);
  assert.equal(s.blocks.find(b => b.id === 2).row, 9);
});

test('a supported block does not move', () => {
  const s = createState();
  s.blocks = [{ id: 1, row: 9, col: 3, len: 2, color: 0 }];
  assert.deepEqual(computeGravity(s), []);
  assert.equal(s.blocks[0].row, 9);
});

test('full rows are reported from top to bottom', () => {
  const s = createState();
  s.blocks = [
    { id: 1, row: 4, col: 0, len: COLS, color: 0 },
    { id: 2, row: 9, col: 0, len: COLS, color: 1 }
  ];
  assert.deepEqual(fullRows(s), [4, 9]);
});

test('clear score uses the level from before the level bump', () => {
  const s = createState();
  s.level = 1;
  s.lines = CLASSIC_LINES_BASE - 1;
  const st = createTurnScore();
  const a = awardRows(s, [8], st);
  assert.equal(s.score, COLS * 10);
  assert.equal(a.mult, 1);
  assert.equal(s.lines, CLASSIC_LINES_BASE);
  assert.equal(s.level, 2);
  assert.equal(s.best, COLS * 10);
});

test('combo stacks across rows and a later batch in the same turn', () => {
  const s = createState();
  s.level = 2;
  s.lines = 10;
  s.best = 1000;
  const st = createTurnScore();
  awardRows(s, [1, 2], st);
  // 8*10*2*1 + 8*10*2*2 = 480, lines 12, level stays 2
  assert.equal(s.score, 480);
  assert.equal(s.level, 2);
  assert.equal(s.best, 1000);
  awardRows(s, [3], st);
  // next combo is 3: 480 + 8*10*2*3 = 960
  assert.equal(s.score, 960);
  assert.equal(st.combo, 3);
  assert.equal(s.best, 1000);
  assert.equal(s.lines, 13);
  assert.equal(s.level, 2);
});

test('slide range stops at neighbours and the board edge', () => {
  const s = createState();
  s.blocks = [
    { id: 1, row: 4, col: 2, len: 2, color: 0 },
    { id: 2, row: 4, col: 0, len: 1, color: 1 },
    { id: 3, row: 4, col: 6, len: 1, color: 2 }
  ];
  assert.deepEqual(slideRange(s, s.blocks[0]), [1, 4]);
  assert.deepEqual(slideRange(s, s.blocks[1]), [0, 1]);
});

test('generated rows cover only empty-or-one cells and always leave a gap', () => {
  const random = mulberry32(7);
  for (const level of [1, 5, 12, 30]) {
    for (let i = 0; i < 40; i++) assertPacked(generateRowCandidate(level, random));
  }
});

test('a fresh game has no full row and every cell is occupied at most once', () => {
  const s = createState(40);
  setupClassic(s, mulberry32(3));
  assert.equal(s.score, 0);
  assert.equal(s.best, 40);
  assert.equal(s.bestAtStart, 40);
  assert.equal(s.phase, 'play');
  assert.equal(s.level, 1);
  assert.equal(fullRows(s).length, 0);
  assert.equal(touchingTop(s), false);
  const g = buildGrid(s);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = g[r][c];
      if (!b) continue;
      assert.equal(b.row, r);
      assert.ok(c >= b.col && c < b.col + b.len);
    }
  }
  assertPacked(s.nextRow);
  assert.ok(s.blocks.length > 0);
});

test('rise moves existing blocks up and spawns the preview on the bottom row', () => {
  const s = createState();
  s.blocks = [{ id: 1, row: 5, col: 0, len: 1, color: 0 }];
  s.nextId = 2;
  s.nextRow = [{ col: 2, len: 3, color: 1 }];
  s.level = 1;
  const preview = structuredClone(s.nextRow);
  const fresh = rise(s, mulberry32(1));
  assert.equal(s.blocks.find(b => b.id === 1).row, 4);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].row, ROWS - 1);
  assert.equal(fresh[0].col, 2);
  assert.equal(fresh[0].len, 3);
  assert.deepEqual(fresh.map(({ col, len, color }) => ({ col, len, color })), preview);
  assert.equal(s.nextId, 3, 'search must not consume live block IDs');
  assert.equal(s.score, 0);
  assert.equal(s.lines, 0);
  assert.ok(s.nextRow.length > 0);
  assert.notDeepEqual(s.nextRow, [{ col: 2, len: 3, color: 1 }]);
});

test('touching the top row is the lose signal', () => {
  const s = createState();
  s.blocks = [{ id: 1, row: 1, col: 0, len: 1, color: 0 }];
  assert.equal(touchingTop(s), false);
  s.blocks[0].row = 0;
  assert.equal(touchingTop(s), true);
});

function settleForTest(board) {
  for (;;) {
    computeGravity(board);
    const rows = fullRows(board);
    if (!rows.length) return;
    board.blocks = board.blocks.filter(b => !rows.includes(b.row));
  }
}

function legalSlides(board) {
  const result = [];
  for (let i = 0; i < board.blocks.length; i++) {
    const b = board.blocks[i];
    const [min, max] = slideRange(board, b);
    for (let col = min; col <= max; col++) {
      if (col === b.col) continue;
      const next = structuredClone(board);
      next.blocks[i].col = col;
      settleForTest(next);
      if (!touchingTop(next)) result.push(next);
    }
  }
  return result;
}

// Exhaustively replay the real turn order, independently of the generator's
// four-path shortlist, to verify that a preview offers a surviving continuation.
function hasContinuation(board, row) {
  for (const next of legalSlides(board)) {
    for (const b of next.blocks) b.row--;
    next.blocks.push(...row.map((b, i) => ({ ...b, id: -i - 1, row: ROWS - 1 })));
    settleForTest(next);
    if (legalSlides(next).length) return true;
  }
  return false;
}

test('preview search is deterministic and never mutates live state', () => {
  const s = createState(800);
  setupClassic(s, mulberry32(17));
  const before = structuredClone(s);
  const row = generateNextRow(s, mulberry32(99));
  assert.deepEqual(s, before);
  assert.deepEqual(row, generateNextRow(s, mulberry32(99)));
  assertPacked(row);
});

test('candidate generation terminates even with a constant random source', () => {
  for (const value of [0, 0.5, 0.999999]) {
    const s = createState();
    setupClassic(s, () => value);
    assertPacked(s.nextRow);
    for (const row of [generateRowCandidate(1, () => value), generateRowCandidate(100, () => value)]) {
      assertPacked(row);
      for (let i = 1; i < row.length; i++) {
        if (row[i - 1].col + row[i - 1].len === row[i].col)
          assert.notEqual(row[i - 1].color, row[i].color);
      }
    }
  }
});

test('previews offer a playable continuation on seeded openings and tall stacks', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const s = createState();
    setupClassic(s, mulberry32(seed));
    assert.ok(hasContinuation(s, s.nextRow), `opening seed ${seed}`);
    s.blocks = Array.from({ length: ROWS }, (_, row) => (
      { id: row + 1, row, col: 0, len: 1, color: row % 5 }
    ));
    s.nextId = ROWS + 1;
    s.lines = 90;
    s.level = 10;
    s.nextRow = generateNextRow(s, mulberry32(seed));
    assertPacked(s.nextRow);
    assert.ok(hasContinuation(s, s.nextRow), `recovery seed ${seed}`);
  }
});

test('the same random stream produces board-dependent previews', () => {
  const low = createState();
  setupClassic(low, mulberry32(13));
  const high = structuredClone(low);
  high.blocks = Array.from({ length: 8 }, (_, i) => (
    { id: i + 1, row: i + 2, col: 0, len: 2, color: i % 5 }
  ));
  let different = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const a = generateNextRow(low, mulberry32(seed));
    const b = generateNextRow(high, mulberry32(seed));
    assertPacked(a);
    assertPacked(b);
    if (JSON.stringify(a) !== JSON.stringify(b)) different++;
  }
  assert.ok(different >= 5, `only ${different} previews responded to the board`);
});

test('preview search evaluates pending cascades without committing them', () => {
  const s = createState();
  s.lines = 9;
  s.blocks = [
    { id: 1, row: 9, col: 0, len: COLS, color: 0 },
    { id: 2, row: 8, col: 3, len: 2, color: 1 }
  ];
  const settled = structuredClone(s);
  settleForTest(settled);
  settled.lines = 10;
  settled.level = 2;
  assert.deepEqual(generateNextRow(s, mulberry32(4)), generateNextRow(settled, mulberry32(4)));
  assert.equal(s.blocks.length, 2);
  assert.equal(s.lines, 9);
});

test('empty and immovable boards still get valid previews without mutation', () => {
  for (const occupied of [false, true]) {
    const s = createState();
    if (occupied) {
      // Alternating seven-cell blocks support one another all the way to the top.
      s.blocks = Array.from({ length: ROWS }, (_, row) => ({
        id: row + 1, row, col: row % 2, len: 7, color: row % 5
      }));
      s.nextId = ROWS + 1;
    }
    assert.equal(legalSlides(s).length, 0);
    const before = structuredClone(s);
    assertPacked(generateNextRow(s, mulberry32(12)));
    assert.deepEqual(s, before);
  }
});
