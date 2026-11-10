// Game state, scoring, and lifecycle. Board rules and spawn policy are independent.
import { COLS, insertRow, levelForLines, settleBoard } from './board.js';
import { generateRowCandidate, generateNextRow } from './spawn.js';
import { normalizeDifficulty } from './difficulty.js';

const START_ROWS = 4;

export function createState(best = 0, difficulty = 'normal', totemsEnabled = false) {
  return {
    totemsEnabled: !!totemsEnabled,
    difficulty: normalizeDifficulty(difficulty),
    blocks: [],
    nextRow: [],
    score: 0,
    best,
    bestAtStart: best,
    level: 1,
    lines: 0,
    phase: 'play',
    nextId: 1,
    hasMoved: false,
    newBest: false
  };
}

export function createTurnScore() {
  return { combo: 0, pts: 0, awarded: 0 };
}

export function awardRows(state, rows, st, widthOf = () => COLS) {
  for (const row of rows) {
    st.combo++;
    st.pts += widthOf(row) * 10 * state.level * st.combo;
  }
  const gained = st.pts - st.awarded;
  st.awarded = st.pts;
  state.score += gained;
  state.lines += rows.length;
  state.level = levelForLines(state.lines);
  if (state.score > state.best) state.best = state.score;
  return { pts: st.pts, mult: st.combo };
}

// Commit the displayed preview before choosing the following one.
export function rise(state, random = Math.random) {
  const fresh = insertRow(state, state.nextRow);
  state.nextRow = generateNextRow(state, random);
  return fresh;
}

// Called with fresh base state by the engine, or by headless setup/search tests.
export function setupClassic(state, random = Math.random) {
  for (let i = 0; i < START_ROWS; i++) {
    insertRow(state, generateRowCandidate(state.level, random, state.difficulty));
    settleBoard(state);
  }
  state.nextRow = generateNextRow(state, random);
}
