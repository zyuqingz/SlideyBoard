// Public headless API. Owns authoritative state; callers only receive copies.
import { createState } from './sim.js';
import { GAME_MODES } from './modes.js';
import { resolvePlayMode, normalizeBuildingMode } from './play-mode.js';

/**
 * A mode supplies { id, label, reset(state, random, options, emit), moveRange(state, block),
 * resolveTurn(state, random, emit) }. emit(type, data) records a detached snapshot.
 * Commands and results are plain serializable data, with no timers or callbacks
 * from the browser. Supplying the same RNG stream and commands reproduces a game.
 */
export function createEngine({ best = 0, random = Math.random, modes = GAME_MODES,
  modeId, modeOptions = {}, difficulty = 'easy', playMode, totemsEnabled, buildingMode = 1 } = {}) {
  let currentPlayMode = resolvePlayMode({ playMode, totemsEnabled }, 'standard');
  let currentBuildingMode = normalizeBuildingMode(buildingMode);
  const registry = new Map(modes.map(mode => [mode.id, mode]));
  modeId = modeId ?? (registry.has('classic') ? 'classic' : modes[0]?.id);
  const bests = new Map([[modeId, best]]);
  const options = new Map([[modeId, structuredClone(modeOptions)]]);
  let mode;
  let state;
  let openingEvents = [];
  const snapshot = () => structuredClone(state);

  function reset(id = mode?.id ?? modeId, config = {}) {
    const nextPlayMode = resolvePlayMode(config, currentPlayMode);
    const nextBuildingMode = normalizeBuildingMode(config.buildingMode ?? currentBuildingMode);
    if (nextPlayMode === 'tetris' && registry.has('classic')) id = 'classic';
    const nextMode = registry.get(id);
    if (!nextMode) throw new Error(`Unknown game mode: ${id}`);
    const nextBest = config.best ?? (id === mode?.id ? state.best : bests.get(id) ?? 0);
    const nextOptions = structuredClone(config.modeOptions ?? options.get(id) ?? {});
    // The engine initializes base state; modes only construct their opening.
    // Publish after setup succeeds so an invalid option cannot erase a live run.
    const fresh = createState(nextBest, config.difficulty ?? state?.difficulty ?? difficulty,
      nextPlayMode, nextBuildingMode);
    fresh.mode = id;
    const events = [];
    const emit = (type, data = {}) => events.push(structuredClone({ type, ...data, state: fresh }));
    nextMode.reset(fresh, random, structuredClone(nextOptions), emit);
    if (events.length) emit('turn-complete');
    currentPlayMode = nextPlayMode;
    currentBuildingMode = nextBuildingMode;
    if (mode) bests.set(mode.id, state.best);
    options.set(id, nextOptions);
    bests.set(id, fresh.best);
    mode = nextMode;
    state = fresh;
    openingEvents = events;
    return snapshot();
  }

  function moveRange(id) {
    if (state.phase !== 'play') return null;
    const block = state.blocks.find(b => b.id === id);
    return block ? [...mode.moveRange(state, block)] : null;
  }

  function dispatch(command) {
    const reject = reason => ({ accepted: false, reason, events: [], state: snapshot() });
    if (command?.type === 'power-mode') {
      if (state.phase !== 'play') return reject('game-over');
      if (state.playMode !== 'totem-building') return reject('wrong-mode');
      const events = [];
      const emit = (type, data = {}) => events.push(structuredClone({ type, ...data, state }));
      mode.resolveTurn(state, random, emit, { forcePower: true });
      emit('turn-complete');
      return { accepted: true, events, state: snapshot() };
    }
    if (command?.type !== 'slide') return reject('unknown-command');
    if (state.phase !== 'play') return reject('game-over');
    const block = state.blocks.find(b => b.id === command.id);
    if (!block) return reject('unknown-block');
    const range = mode.moveRange(state, block);
    if (!Number.isInteger(command.col) || command.col < range[0] || command.col > range[1])
      return reject('illegal-slide');
    if (command.col === block.col) return reject('no-change');

    const events = [];
    const emit = (type, data = {}) => events.push(structuredClone({ type, ...data, state }));
    const from = block.col;
    block.col = command.col;
    state.hasMoved = true;
    emit('slide', { id: block.id, from, to: block.col });
    mode.resolveTurn(state, random, emit);
    emit('turn-complete');
    return { accepted: true, events, state: snapshot() };
  }

  reset(modeId);
  return Object.freeze({ snapshot, reset, moveRange, dispatch,
    opening: () => structuredClone({ accepted: openingEvents.length > 0, events: openingEvents }),
    modes: Object.freeze(modes.map(({ id, label }) => Object.freeze({ id, label }))) });
}
