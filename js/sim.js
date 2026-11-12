// Game state, scoring, and lifecycle. Board rules and spawn policy are independent.
import { COLS, insertRow, settleBoard } from './board.js';
import { generateRowCandidate, generateNextRow } from './spawn.js';
import { normalizeDifficulty } from './difficulty.js';
import { JUNIOR_COUNT } from './junior-powers.js';
import {
  resolvePlayMode, tetrisDropInterval, isBuilding, isBuildingMode2, normalizeBuildingMode, buildingScoreProgress,
  levelForBuildingLines, buildingLevelProgress, classicProgressFromLines
} from './play-mode.js';

const START_ROWS = 4;

export function createState(best = 0, difficulty = 'easy', playMode = 'standard', buildingMode = 1) {
  playMode = resolvePlayMode({ playMode }, 'standard');
  return {
    playMode,
    buildingMode: normalizeBuildingMode(buildingMode),
    totemsEnabled: playMode === 'tetris',
    // Turns until the next tetromino. Reset at spawn; does not tick while one is live.
    tetrisDropIn: playMode === 'tetris' ? tetrisDropInterval(1) : 0,
    difficulty: normalizeDifficulty(difficulty),
    blocks: [],
    juniorCollection: Array(JUNIOR_COUNT).fill(0),
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

export function awardRows(state, rows, st, widthOf = () => COLS, lineCount = rows.length) {
  if (isBuilding(state) && !isBuildingMode2(state)) {
    state.lines += lineCount;
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
  state.lines += lineCount;
  if (isBuildingMode2(state)) Object.assign(state, buildingScoreProgress(state.score));
  else {
    const classic = classicProgressFromLines(state.lines);
    state.level = classic.level;
    state.levelProgress = classic.levelProgress;
  }
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
  const minLen = state.playMode === 'totem-building' ? 2 : 1;
  for (let i = 0; i < START_ROWS; i++) {
    insertRow(state, generateRowCandidate(state.level, random, state.difficulty, minLen));
    settleBoard(state);
  }
  state.nextRow = generateNextRow(state, random);
}
