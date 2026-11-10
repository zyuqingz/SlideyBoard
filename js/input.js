// Browser gestures become grid-space commands. Only presentation data is edited.
import { COLS, ROWS } from './board.js';
import { cellsOf } from './block-geometry.js';
import { CELL, BX } from './theme.js';
import { followDrag, commitTarget } from './drag.js';
import { layout, toLogical, toOverlay, hit, GO_RESTART, invalidateCanvas } from './canvas-layout.js';
import { mapControl, modeResume, shapeControl, difficultyControl, playModeControl } from './mode-popup.js';
import { settingsPopup } from './settings-popup.js';
import { setLang } from './i18n.js';
import { playSfx, unlockAudio, isMuted, setMuted } from './audio.js';

export function bindInput(canvas, { presenter, modes, moveRange, slide, restart, shapeSelection,
  toggleDifficulty, cyclePlayMode, cycleMap, cycleShape }) {
  const { present, viewOf } = presenter;
  const on = (target, type, fn, options) => target.addEventListener(type, e => {
    fn(e);
    invalidateCanvas();
  }, options);

  function hoverTarget(e) {
    const p = toLogical(e), op = toOverlay(p);
    if (present.menu === 'pause') {
      const pop = settingsPopup();
      if (hit(pop.resume, op)) return 'btn:resume';
      if (hit(pop.restart, op)) return 'btn:restart';
      if (hit(pop.en, op)) return 'btn:en';
      if (hit(pop.zh, op)) return 'btn:zh';
      if (hit(pop.sound, op)) return 'btn:sound';
      return null;
    }
    if (present.menu === 'mode') {
      if (hit(difficultyControl(modes), op)) return 'btn:difficulty';
      if (hit(playModeControl(modes), op)) return 'btn:play-mode';
      if (hit(mapControl(modes), op)) return 'btn:map';
      const control = shapeControl(modes);
      const shaped = presenter.state.mode === 'shaped';
      if (control && shapeSelection && shaped && hit(control, op)) return 'shape';
      if (hit(modeResume(modes), op)) return 'btn:mode-resume';
      return null;
    }
    if (presenter.state.phase === 'over') {
      if (present.overlayA > 0.5 && hit(GO_RESTART, op)) return 'btn:go-restart';
      return null;
    }
    if (hit(layout.MODE_BTN, p)) return 'icon:mode';
    if (hit(layout.PAUSE_BTN, p)) return 'icon:pause';
    const b = blockAt(p);
    return b ? 'block:' + b.id : null;
  }

  function setHover(e) {
    present.hoverKey = e ? hoverTarget(e) : null;
    const key = present.hoverKey;
    if (!present.drag) {
      canvas.style.cursor = key?.startsWith('block:') ? 'grab' : key ? 'pointer' : 'default';
    }
  }

  function blockAt(p) {
    const col = Math.floor((p.x - BX) / CELL), row = Math.floor((p.y - layout.BY) / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    const span = presenter.state.shape?.rows[row];
    if (span && (col < span.left || col >= span.right)) return null;
    const x = (p.x - BX) / CELL, y = (p.y - layout.BY) / CELL;
    return presenter.state.blocks.find(b => {
      const v = viewOf(b);
      return cellsOf(b).some(cell => {
        const left = v.vx + cell.col, top = v.vy + cell.row;
        return x >= left && x < left + 1 && y >= top && y < top + 1;
      });
    });
  }

  function releasePointer(drag) {
    try { canvas.releasePointerCapture(drag.id); } catch {}
    canvas.style.cursor = 'default';
  }

  function cancelDrag() {
    const drag = present.drag;
    if (!drag) return;
    present.drag = null;
    const b = presenter.state.blocks.find(b => b.id === drag.blockId);
    if (b) {
      viewOf(b).vx = b.col;
      viewOf(b).slot = 0;
    }
    releasePointer(drag);
  }

  function moveDrag(e) {
    const drag = present.drag;
    if (!drag || e.pointerId !== drag.id) return;
    const b = presenter.state.blocks.find(b => b.id === drag.blockId);
    if (!b) { cancelDrag(); return; }
    const p = toLogical(e), v = viewOf(b);
    const dx = (p.x - drag.lastX) / CELL;
    v.vx = followDrag(v.vx, dx, drag.min, drag.max);
    drag.lastX = p.x;
    const next = commitTarget(v.vx, drag.target, drag.min, drag.max, dx);
    if (next !== drag.target) playSfx('place', { volume: 0.42, rate: 0.88 });
    drag.target = next;
  }

  on(canvas, 'pointerdown', e => {
    if (e.button !== 0 || present.drag) return;
    e.preventDefault();
    unlockAudio();
    const p = toLogical(e), op = toOverlay(p);
    if (present.menu === 'pause') {
      const pop = settingsPopup();
      if (hit(pop.resume, op)) { playSfx('click'); present.menu = null; }
      else if (hit(pop.restart, op)) { playSfx('click'); restart(); }
      else if (hit(pop.en, op)) { playSfx('click'); setLang('en'); }
      else if (hit(pop.zh, op)) { playSfx('click'); setLang('zh'); }
      else if (hit(pop.sound, op)) {
        const next = !isMuted();
        setMuted(next);
        if (!next) playSfx('click');
      }
      return;
    }
    if (present.menu === 'mode') {
      if (hit(playModeControl(modes), op)) {
        playSfx('click');
        cyclePlayMode();
        return;
      }
      if (hit(difficultyControl(modes), op)) {
        playSfx('click');
        toggleDifficulty();
        return;
      }
      if (hit(mapControl(modes), op)) {
        playSfx('click');
        cycleMap();
        return;
      }
      const control = shapeControl(modes);
      if (control && shapeSelection && presenter.state.mode === 'shaped' && hit(control, op)) {
        const direction = op.x < control.x + 60 ? -1 : 1;
        playSfx('click');
        cycleShape(direction);
        return;
      }
      if (hit(modeResume(modes), op)) { playSfx('click'); present.menu = null; }
      return;
    }
    if (presenter.state.phase === 'over') {
      if (present.overlayA > 0.5 && hit(GO_RESTART, op)) { playSfx('click'); restart(); }
      return;
    }
    if (hit(layout.MODE_BTN, p)) { playSfx('click'); present.menu = 'mode'; cancelDrag(); return; }
    if (hit(layout.PAUSE_BTN, p)) { playSfx('click'); present.menu = 'pause'; cancelDrag(); return; }
    if (presenter.busy) return;
    const b = blockAt(p);
    if (!b) return;
    const range = moveRange(b.id);
    if (!range) return;
    const [min, max] = range;
    present.hoverKey = 'block:' + b.id;
    presenter.pickup(b);
    present.drag = { blockId: b.id, id: e.pointerId, lastX: p.x, col0: b.col, target: b.col, min, max };
    playSfx('pickup', { volume: 0.5, rate: 0.88 });
    canvas.style.cursor = 'grabbing';
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });

  on(canvas, 'pointermove', e => {
    if (!present.drag) {
      setHover(e);
      return;
    }
    if (e.pointerId !== present.drag.id) return;
    e.preventDefault();
    moveDrag(e);
  });
  on(canvas, 'pointerleave', () => { if (!present.drag) setHover(null); });

  on(canvas, 'pointerup', e => {
    const drag = present.drag;
    if (!drag || e.pointerId !== drag.id) return;
    moveDrag(e);
    present.drag = null;
    releasePointer(drag);
    const b = presenter.state.blocks.find(b => b.id === drag.blockId);
    if (!b) return;
    setHover(e.pointerType === 'touch' ? null : e);
    if (present.hoverKey === 'block:' + b.id) present.hoverAmt[present.hoverKey] = 1;
    if (drag.target === drag.col0) {
      presenter.snapBack(b);
    } else if (!slide(b.id, drag.target)) {
      presenter.snapBack(b);
    }
  });

  for (const type of ['pointercancel', 'lostpointercapture']) on(canvas, type, e => {
    if (present.drag?.id === e.pointerId) cancelDrag();
  });
  on(window, 'blur', cancelDrag);
  on(window, 'resize', cancelDrag);
  on(document, 'visibilitychange', () => { if (document.hidden) cancelDrag(); });
  on(canvas, 'contextmenu', e => e.preventDefault());
  on(document, 'touchmove', e => e.preventDefault(), { passive: false });
  on(document, 'gesturestart', e => e.preventDefault());
  on(window, 'keydown', e => {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
      if (present.menu) present.menu = null;
      else if (presenter.state.phase !== 'over') present.menu = 'pause';
      cancelDrag();
    }
    if (e.key.toLowerCase() === 'r' && (presenter.state.phase === 'over' || present.menu === 'pause'))
      restart();
  });

  return { cancelDrag };
}
