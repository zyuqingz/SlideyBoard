// Composition root: browser adapters connect to the headless engine here only.
import { COLS, ROWS } from './board.js';
import { W, H, CELL, BX } from './theme.js';
import { createEngine } from './engine.js';
import { createPresenter } from './presenter.js';
import { bindInput } from './input.js';
import { layout, bindCanvas } from './canvas-layout.js';
import { draw } from './render.js';
import { loadBest, saveBest, loadDifficulty, saveDifficulty, loadPlayMode, savePlayMode,
  loadPowerButton, savePowerButton, loadBuildingMode, saveBuildingMode } from './storage.js';
import { nextPlayMode } from './play-mode.js';
import { loadLang } from './i18n.js';
import { SHAPES } from './shapes.js';

const shapeSelection = {
  value: 'funnel',
  options: [{ id: 'random', label: 'RANDOM' }, ...SHAPES.map(({ id, label }) => ({ id, label }))]
};
let activeShapeSelection = 'funnel';

const canvas = document.getElementById('game');
bindCanvas(canvas);
loadLang();
const engine = createEngine({ modeId: 'classic', best: loadBest('classic'),
  difficulty: loadDifficulty(), playMode: loadPlayMode(), buildingMode: loadBuildingMode() });
const presenter = createPresenter({ boardY: () => layout.BY, collectionY: () => layout.COLLECTION_Y });
presenter.present.powerButton = loadPowerButton();

function showBoard(snapshot) {
  const opening = engine.opening();
  presenter.reset(opening.events[0]?.state ?? snapshot);
  saveBest(snapshot.mode, snapshot.best);
  presenter.play(opening).catch(error => {
    console.error('Opening drop presentation failed', error);
    presenter.reset(engine.snapshot());
  });
}

showBoard(engine.snapshot());

function restart() {
  input.cancelDrag();
  showBoard(engine.reset());
}

function toggleDifficulty() {
  const difficulty = engine.snapshot().difficulty === 'normal' ? 'easy' : 'normal';
  resetOptions({ difficulty });
  saveDifficulty(difficulty);
}

function cyclePlayMode() {
  const playMode = nextPlayMode(engine.snapshot().playMode);
  resetOptions({ playMode });
  savePlayMode(playMode);
}

function toggleBuildingMode() {
  const buildingMode = engine.snapshot().buildingMode === 2 ? 1 : 2;
  resetOptions({ buildingMode });
  saveBuildingMode(buildingMode);
}

function cycleMap() {
  if (engine.snapshot().playMode === 'tetris') return;
  const modes = engine.modes;
  const index = modes.findIndex(mode => mode.id === engine.snapshot().mode);
  const next = modes[(index < 0 ? 0 : index + 1) % modes.length];
  input.cancelDrag();
  activeShapeSelection = shapeSelection.value;
  showBoard(engine.reset(next.id, { best: loadBest(next.id),
    modeOptions: next.id === 'shaped' ? { shapeId: activeShapeSelection } : {} }));
  presenter.present.menu = 'mode';
}

function cycleShape(direction) {
  if (engine.snapshot().mode !== 'shaped') return;
  const { options, value } = shapeSelection;
  const index = options.findIndex(option => option.id === value);
  shapeSelection.value = options[(index + direction + options.length) % options.length].id;
  activeShapeSelection = shapeSelection.value;
  resetOptions({ modeOptions: { shapeId: activeShapeSelection } });
}

function resetOptions(options) {
  input.cancelDrag();
  showBoard(engine.reset(undefined, options));
  presenter.present.menu = 'mode';
}

function togglePowerButton() {
  presenter.present.powerButton = !presenter.present.powerButton;
  savePowerButton(presenter.present.powerButton);
}

function triggerPowerMode() {
  if (!presenter.present.powerButton || presenter.busy || presenter.present.menu) return false;
  const result = engine.dispatch({ type: 'power-mode' });
  if (!result.accepted) return false;
  saveBest(result.state.mode, result.state.best);
  presenter.play(result).catch(error => {
    console.error('Power mode presentation failed', error);
    presenter.reset(engine.snapshot());
  });
  return true;
}

function slide(id, col) {
  if (presenter.busy || presenter.present.menu) return false;
  const result = engine.dispatch({ type: 'slide', id, col });
  if (!result.accepted) return false;
  saveBest(result.state.mode, result.state.best);
  presenter.play(result).catch(error => {
    console.error('Turn presentation failed', error);
    presenter.reset(engine.snapshot());
  });
  return true;
}

const input = bindInput(canvas, {
  presenter, modes: engine.modes, moveRange: id => engine.moveRange(id),
  slide, restart, shapeSelection, toggleDifficulty, cyclePlayMode, cycleMap, cycleShape,
  togglePowerButton, triggerPowerMode, toggleBuildingMode
});

let last = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  const ms = Math.min(50, t - last);
  last = t;
  const changed = presenter.update(ms);
  draw(presenter.effects.now(), presenter.state, presenter.viewOf, presenter.present,
    presenter.effects, engine.modes, shapeSelection, changed);
}
requestAnimationFrame(frame);

// Read-only inspection: shown state can trail the already-completed logical turn.
window.__slidey = {
  get logicalState() { return engine.snapshot(); },
  get state() {
    const state = presenter.state, present = presenter.present;
    return {
      blocks: state.blocks.map(b => {
        const v = presenter.viewOf(b);
        return { ...b, vx: v.vx, vy: v.vy, s: v.s, sq: v.sq };
      }),
      score: state.score, displayScore: present.displayScore,
      juniorCollection: [...present.juniorCollection],
      pendingScore: present.scoreFx?.pts || 0,
      scoreAnimating: !!(present.scoreFx || present.scoreScale !== 1),
      combo: present.comboFx?.mult || 0, level: state.level, lines: state.lines,
      busy: presenter.busy, over: state.phase === 'over', paused: present.menu === 'pause',
      modeOpen: present.menu === 'mode', mode: state.mode, best: state.best,
      difficulty: state.difficulty, playMode: state.playMode, buildingMode: state.buildingMode
    };
  },
  get layout() {
    return { W, H, VH: layout.VH, VW: layout.VW, OY: layout.OY, OX: layout.OX,
      BX, BY: layout.BY, HY: layout.HY, CELL, COLS, ROWS, panelY: layout.PANEL.y };
  }
};
