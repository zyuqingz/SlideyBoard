// Composition root: browser adapters connect to the headless engine here only.
import { COLS, ROWS } from './board.js';
import { W, H, CELL, BX } from './theme.js';
import { createEngine } from './engine.js';
import { createPresenter } from './presenter.js';
import { bindInput } from './input.js';
import { layout, bindCanvas } from './canvas-layout.js';
import { draw } from './render.js';
import { loadBest, saveBest, loadDifficulty, saveDifficulty, loadTotems, saveTotems } from './storage.js';
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
const engine = createEngine({ modeId: 'shaped', best: loadBest('shaped'),
  difficulty: loadDifficulty(), totemsEnabled: loadTotems(),
  modeOptions: { shapeId: activeShapeSelection } });
const presenter = createPresenter({ boardY: () => layout.BY });
presenter.reset(engine.snapshot());

function restart() {
  input.cancelDrag();
  presenter.reset(engine.reset());
}

function toggleDifficulty() {
  const difficulty = engine.snapshot().difficulty === 'normal' ? 'easy' : 'normal';
  resetOptions({ difficulty });
  saveDifficulty(difficulty);
}

function toggleTotems() {
  const totemsEnabled = !engine.snapshot().totemsEnabled;
  resetOptions({ totemsEnabled });
  saveTotems(totemsEnabled);
}

function resetOptions(options) {
  input.cancelDrag();
  presenter.reset(engine.reset(undefined, options));
  presenter.present.menu = 'mode';
}

function selectMode(id) {
  if (id === engine.snapshot().mode && (id !== 'shaped' || activeShapeSelection === shapeSelection.value)) {
    presenter.present.menu = null;
    return;
  }
  input.cancelDrag();
  activeShapeSelection = shapeSelection.value;
  presenter.reset(engine.reset(id, { best: loadBest(id),
    modeOptions: id === 'shaped' ? { shapeId: activeShapeSelection } : {} }));
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
  slide, restart, selectMode, shapeSelection, toggleDifficulty, toggleTotems
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
      pendingScore: present.scoreFx?.pts || 0,
      scoreAnimating: !!(present.scoreFx || present.scoreScale !== 1),
      combo: present.comboFx?.mult || 0, level: state.level, lines: state.lines,
      busy: presenter.busy, over: state.phase === 'over', paused: present.menu === 'pause',
      modeOpen: present.menu === 'mode', mode: state.mode, best: state.best,
      difficulty: state.difficulty, totemsEnabled: state.totemsEnabled
    };
  },
  get layout() {
    return { W, H, VH: layout.VH, OY: layout.OY, BX, BY: layout.BY, HY: layout.HY,
      CELL, COLS, ROWS, panelY: layout.PANEL.y };
  }
};
