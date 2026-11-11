// Shared turn lifecycle. Modes supply insertion/preview rules, options add drops.
import { rowSpan, settleBoard, touchingTop, hasMoves, occupiedTileRows } from './board.js';
import { createTurnScore, awardRows, awardTotemCollect } from './sim.js';
import { spawnTotem, spawnBuildingTotem } from './totem-spawn.js';
import { isBuilding, isTetris, usesTotems, tetrisDropInterval,
  buildingTotemsForLevelUp } from './play-mode.js';

export function resolveTurn(state, random, emit, rise) {
  const turn = createTurnScore();
  const spawnPending = () => {
    let spawned = false;
    while (state.pendingTotemSpawns > 0) {
      const result = spawnBuildingTotem(state, random);
      if (result.type === 'blocked') {
        state.totemSpawnBlocked = true;
        break;
      }
      state.totemSpawnBlocked = false;
      state.pendingTotemSpawns--;
      spawned = true;
      emit('totem-drop', { id: result.block.id });
    }
    if (spawned) {
      settleBoard(state, step);
      spawnPending();
    }
  };
  const step = (type, data) => {
    if (type === 'clear') {
      const prevLevel = state.level;
      data.award = awardRows(state, data.rows, turn, row => {
        const { left, right } = rowSpan(state, row);
        return right - left;
      });
      if (isBuilding(state)) {
        state.pendingTotemSpawns += buildingTotemsForLevelUp(prevLevel, state.level);
        if (data.collected?.length)
          data.collectionAward = awardTotemCollect(state, data.collected);
      }
    } else if (type === 'totem-collect') {
      data.award = awardTotemCollect(state, data.blocks);
    }
    emit(type, data);
  };
  const settle = () => {
    settleBoard(state, step);
    spawnPending();
  };
  const endGame = reason => {
    state.phase = 'over';
    state.gameOverReason = reason;
    state.newBest = state.score > state.bestAtStart && state.score > 0;
    emit('game-over', { blockIds: state.blocks
      .filter(b => reason === 'no-moves' || b.row <= 0).map(b => b.id) });
  };
  settle();
  // A rise reaching the ceiling still allows one rescue slide next turn.
  if (touchingTop(state)) return endGame('top-out');

  const spawnRows = count => {
    for (let i = 0; i < count; i++) {
      // A refill can reach the ceiling before all requested rows arrive.
      // Leave that position intact for the next turn's rescue slide.
      if (touchingTop(state)) break;
      rise();
      settle();
    }
  };
  const tileRows = occupiedTileRows(state);
  const riseCount = isBuilding(state)
    ? (tileRows <= 0 ? 4 : tileRows === 1 ? 3 : 1)
    : (state.blocks.length ? 1 : 3);
  spawnRows(riseCount);
  if (isTetris(state)) {
    const live = state.blocks.some(b => b.kind === 'totem');
    if (!live) {
      const wait = Number.isInteger(state.tetrisDropIn) ? state.tetrisDropIn : tetrisDropInterval(state.level);
      if (wait <= 1) {
        const block = spawnTotem(state, random);
        if (block) {
          state.tetrisDropIn = tetrisDropInterval(state.level);
          emit('totem-drop', { id: block.id });
          settle();
        } else state.tetrisDropIn = 1;
      } else state.tetrisDropIn = wait - 1;
    }
  }
  if (!isBuilding(state) && !occupiedTileRows(state))
    spawnRows(state.blocks.length ? 1 : (state.shape ? 1 : 3));
  if ((state.shape || usesTotems(state)) && !hasMoves(state)) endGame('no-moves');
}
