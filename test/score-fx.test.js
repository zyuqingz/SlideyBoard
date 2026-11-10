import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createTurnScore, awardRows } from '../js/sim.js';
import { createScorePresentation, stackScore, bankScore } from '../js/score-fx.js';
import { createEffects } from '../js/fx.js';

function clock(effects) {
  return async ms => {
    effects.update(ms);
    // Let chained tweens schedule their next phase.
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
}

test('cascade points wait, fly once, react, then snap to the total', async () => {
  const effects = createEffects();
  const advance = clock(effects);
  const s = createState();
  const turn = createTurnScore();
  const present = createScorePresentation();
  stackScore(present, awardRows(s, [9], turn), effects);
  assert.equal(present.comboFx, null);
  await advance(2000);
  assert.equal(present.displayScore, 0);
  assert.equal(present.scoreFx.flight, null, 'a long cascade must not auto-bank');
  stackScore(present, awardRows(s, [8], turn), effects);
  assert.equal(present.comboFx.mult, 2);
  assert.equal(present.scoreFx.pts, 240);

  const done = bankScore(present, effects);
  await advance(480);
  await advance(280);
  assert.ok(present.scoreFx.flight > 0 && present.scoreFx.flight < 0.5, 'flight accelerates');
  assert.equal(present.displayScore, 0);
  await advance(280);
  assert.equal(present.scoreFx, null);
  assert.equal(present.displayScore, 0, 'impact happens before the number changes');
  await advance(35);
  assert.ok(present.scoreScale > 1);
  assert.equal(present.displayScore, 0);
  await advance(35);
  assert.equal(present.displayScore, 240, 'the full amount snaps in at the reaction peak');
  await advance(75);
  assert.equal(present.displayScore, 240);
  await advance(75);
  await done;
  assert.equal(present.displayScore, s.score);
  assert.equal(present.scoreScale, 1);
  assert.equal(present.comboFx, null);

  stackScore(present, awardRows(s, [9], createTurnScore()), effects);
  const next = bankScore(present, effects);
  for (const ms of [480, 560, 70, 150]) await advance(ms);
  await next;
  assert.equal(present.displayScore, 320, 'later turns add only their own points');
});

test('restart cancels pending score transfer without changing the fresh total', async () => {
  const effects = createEffects();
  const advance = clock(effects);
  const present = createScorePresentation();
  stackScore(present, { pts: 80, mult: 1 }, effects);
  const done = bankScore(present, effects);
  await advance(480);
  await advance(200);
  effects.clear();
  Object.assign(present, createScorePresentation());
  await advance(5000);
  assert.equal(await done, false);
  assert.deepEqual(present, createScorePresentation());
});

test('overlapping turn completions bank an award once and leave a newer combo alone', async () => {
  const effects = createEffects();
  const advance = clock(effects);
  const present = createScorePresentation();
  stackScore(present, { pts: 80, mult: 1 }, effects);
  const first = bankScore(present, effects);
  assert.equal(bankScore(present, effects), first);
  await advance(480);
  stackScore(present, { pts: 240, mult: 2 }, effects);
  const combo = present.comboFx;
  await advance(560);
  assert.equal(await first, true);
  assert.equal(present.displayScore, 80);
  assert.equal(combo.alpha, 1, 'previous score flight cannot fade the next combo');
  const second = bankScore(present, effects);
  for (const ms of [480, 560, 70, 150]) await advance(ms);
  assert.equal(await second, true);
  assert.equal(present.displayScore, 320);
});
