// Game state, scoring, and lifecycle. Board rules and spawn policy are independent.
import { COLS, insertRow, levelForLines, settleBoard } from './board.js';
import { generateRowCandidate, generateNextRow } from './spawn.js';
import { normalizeDifficulty } from './difficulty.js';
import {
  resolvePlayMode, tetrisDropInterval, isBuilding,
  levelForBuildingLines, buildingLevelProgress, TOTEM_COLLECT_SCORE
} from './play-mode.js';

const START_ROWS = 4;

export function createState(best = 0, difficulty = 'easy', playMode = 'standard') {
  playMode = resolvePlayMode({ playMode }, 'standard');
  return {
    playMode,
    totemsEnabled: playMode === 'tetris',
    totemSpawnBlocked: false,
    pendingTotemSpawns: 0,
    // Turns until the next tetromino. Reset at spawn; does not tick while one is live.
    tetrisDropIn: playMode === 'tetris' ? tetrisDropInterval(1) : 0,
    difficulty: normalizeDifficulty(difficulty),
    blocks: [],
    nextRow: [],
    score: 0,
    best,
    bestAtStart: best,
    level: 1,
    levelProgress: 0,
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
  if (isBuilding(state)) {
    state.lines += rows.length;
    state.level = levelForBuildingLines(state.lines);
    state.levelProgress = buildingLevelProgress(state.lines);
    return { pts: 0, mult: 1 };
  }
  for (const row of rows) {
    st.combo++;
    st.pts += widthOf(row) * 10 * state.level * st.combo;
  }
  const gained = st.pts - st.awarded;
  st.awarded = st.pts;
  state.score += gained;
  state.lines += rows.length;
  state.level = levelForLines(state.lines);
  state.levelProgress = (state.lines % 10) / 10;
  if (state.score > state.best) state.best = state.score;
  return { pts: st.pts, mult: st.combo };
}

export function awardTotemCollect(state, blocks) {
  const totems = blocks.map(b => ({ id: b.id,
    pts: TOTEM_COLLECT_SCORE * (b.smile ?? 1) * state.level, mult: 1 }));
  const pts = totems.reduce((sum, award) => sum + award.pts, 0);
  state.score += pts;
  if (state.score > state.best) state.best = state.score;
  return { pts, mult: 1, totems };
}

// Commit the displayed preview before choosing the following one.
export function rise(state, random = Math.random) {
  const fresh = insertRow(state, state.nextRow);
  state.nextRow = generateNextRow(state, random);
  return fresh;
}

// Called with fresh base state by the engine, or by headless setup/search tests.
export function setupClassic(state, random = Math.random) {
  const minLen = state.playMode === 'totem-building' ? 2 : 1;
  for (let i = 0; i < START_ROWS; i++) {
    insertRow(state, generateRowCandidate(state.level, random, state.difficulty, minLen));
    settleBoard(state);
  }
  state.nextRow = generateNextRow(state, random);
}
