// Browser gestures become grid-space commands. Only presentation data is edited.
import { COLS, ROWS } from './board.js';
import { cellsOf } from './block-geometry.js';
import { CELL, BX } from './theme.js';
import { createDrag, followDrag } from './drag.js';
import { layout, toLogical, toOverlay, hit, GO_RESTART, invalidateCanvas } from './canvas-layout.js';
import { mapControl, modeResume, shapeControl, difficultyControl, playModeControl,
  powerButtonControl, passwordBoxControl, passwordBackControl } from './mode-popup.js';
import { MODE_PASSWORD, isModeUnlocked, modePasswordDigits,
  setModePasswordDigits, resetModePassword } from './mode-lock.js';
import { settingsPopup } from './settings-popup.js';
import { setLang } from './i18n.js';
import { unlockAudio, isMuted, setMuted, playSfx } from './audio.js';

export function bindInput(canvas, { presenter, modes, moveRange, slide, restart, shapeSelection,
  toggleDifficulty, cyclePlayMode, cycleMap, cycleShape, togglePowerButton, triggerPowerMode,
  sfx = playSfx }) {
  const { present, viewOf } = presenter;
  const click = () => sfx('click');
  function scrape(drag, vx, start = false) {
    const now = Date.now();
    if (!start) {
      if (now - (drag.sfxAt ?? 0) < 90) return;
      if (Math.abs(vx - (drag.sfxX ?? vx)) < 0.28) return;
    }
    sfx('drag', { volume: start ? 1 : 0.8, rate: 0.86 + Math.random() * 0.2 });
    drag.sfxAt = now;
    drag.sfxX = vx;
  }
  const on = (target, type, fn, options) => target.addEventListener(type, e => {
    fn(e);
    invalidateCanvas();
  }, options);

  const pinInput = document.createElement('input');
  pinInput.type = 'tel';
  pinInput.inputMode = 'numeric';
  pinInput.autocomplete = 'off';
  pinInput.maxLength = MODE_PASSWORD.length;
  pinInput.setAttribute('aria-label', 'password');
  Object.assign(pinInput.style, {
    position: 'fixed', left: '0', top: '0', width: '1px', height: '1px',
    opacity: '0', border: '0', padding: '0', margin: '0', pointerEvents: 'none'
  });
  document.body.appendChild(pinInput);

  function syncPinField() {
    if (present.menu === 'mode' && !isModeUnlocked()) {
      pinInput.value = modePasswordDigits();
      pinInput.focus({ preventScroll: true });
    } else {
      pinInput.blur();
      pinInput.value = '';
    }
  }

  function closeMenu() {
    present.menu = null;
    resetModePassword();
    syncPinField();
  }

  function applyPinValue(value) {
    if (present.menu !== 'mode' || isModeUnlocked()) {
      syncPinField();
      return;
    }
    const result = setModePasswordDigits(value);
    pinInput.value = modePasswordDigits();
    if (result === true) {
      pinInput.blur();
    }
  }

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
      if (!isModeUnlocked()) {
        if (hit(passwordBoxControl(modes), op)) return 'btn:password';
        if (hit(passwordBackControl(modes), op)) return 'btn:password-back';
        return null;
      }
      if (hit(difficultyControl(modes), op)) return 'btn:difficulty';
      if (hit(powerButtonControl(modes), op)) return 'btn:power-toggle';
      if (hit(playModeControl(modes), op)) return 'btn:play-mode';
      if (presenter.state.playMode !== 'tetris' && hit(mapControl(modes), op)) return 'btn:map';
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
    if (present.powerButton && hit(layout.POWER_BTN, p)) return 'btn:power';
    if (presenter.busy) return null;
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
    present.hoverKey = null;
    if (b) presenter.snapBack(b);
    releasePointer(drag);
  }

  function moveDrag(e) {
    const drag = present.drag;
    if (!drag || e.pointerId !== drag.id) return;
    const b = presenter.state.blocks.find(b => b.id === drag.blockId);
    if (!b) { cancelDrag(); return; }
    const p = toLogical(e);
    const dx = (p.x - drag.lastX) / CELL;
    const dy = (p.y - drag.lastY) / CELL;
    const wasActive = drag.active;
    followDrag(drag, dx, dy);
    drag.lastX = p.x;
    drag.lastY = p.y;
    if (!wasActive && drag.active) {
      presenter.pickup(b);
      scrape(drag, drag.vx, true);
    } else if (drag.active) {
      scrape(drag, drag.vx);
    }
  }

  on(canvas, 'pointerdown', e => {
    if (e.button !== 0 || e.isPrimary === false || present.drag) return;
    e.preventDefault();
    unlockAudio();
    const p = toLogical(e), op = toOverlay(p);
    if (present.menu === 'pause') {
      const pop = settingsPopup();
      if (hit(pop.resume, op)) { click(); closeMenu(); }
      else if (hit(pop.restart, op)) { click(); restart(); }
      else if (hit(pop.en, op)) { click(); setLang('en'); }
      else if (hit(pop.zh, op)) { click(); setLang('zh'); }
      else if (hit(pop.sound, op)) {
        if (isMuted()) { setMuted(false); click(); }
        else { click(); setMuted(true); }
      }
      return;
    }
    if (present.menu === 'mode') {
      if (!isModeUnlocked()) {
        if (hit(passwordBackControl(modes), op)) {
          click();
          closeMenu();
          return;
        }
        if (hit(passwordBoxControl(modes), op)) {
          click();
          syncPinField();
        }
        return;
      }
      if (hit(playModeControl(modes), op)) {
        click();
        cyclePlayMode();
        return;
      }
      if (hit(difficultyControl(modes), op)) {
        click();
        toggleDifficulty();
        return;
      }
      if (hit(powerButtonControl(modes), op)) {
        click();
        togglePowerButton();
        return;
      }
      if (presenter.state.playMode !== 'tetris' && hit(mapControl(modes), op)) {
        click();
        cycleMap();
        return;
      }
      const control = shapeControl(modes);
      if (control && shapeSelection && presenter.state.mode === 'shaped' && hit(control, op)) {
        click();
        const direction = op.x < control.x + 60 ? -1 : 1;
        cycleShape(direction);
        return;
      }
      if (hit(modeResume(modes), op)) { click(); closeMenu(); }
      return;
    }
    if (presenter.state.phase === 'over') {
      if (present.overlayA > 0.5 && hit(GO_RESTART, op)) { click(); restart(); }
      return;
    }
    if (hit(layout.MODE_BTN, p)) {
      click();
      present.menu = 'mode';
      cancelDrag();
      syncPinField();
      return;
    }
    if (hit(layout.PAUSE_BTN, p)) {
      click();
      present.menu = 'pause';
      cancelDrag();
      return;
    }
    if (present.powerButton && hit(layout.POWER_BTN, p)) {
      if (presenter.state.playMode !== 'totem-building' || presenter.busy) return;
      click();
      triggerPowerMode?.();
      return;
    }
    if (presenter.busy) return;
    const b = blockAt(p);
    if (!b) return;
    const range = moveRange(b.id);
    if (!range) return;
    const [min, max] = range;
    if (min === max) return;
    present.hoverKey = null;
    delete present.hoverAmt['block:' + b.id];
    present.drag = { ...createDrag(b.col, min, max), blockId: b.id, id: e.pointerId,
      pointerType: e.pointerType, lastX: p.x, lastY: p.y };
    canvas.style.cursor = 'grabbing';
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  });

  on(canvas, 'pointermove', e => {
    if (!present.drag) {
      setHover(e.pointerType === 'touch' ? null : e);
      return;
    }
    if (e.pointerId !== present.drag.id) return;
    e.preventDefault();
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) cancelDrag();
    else moveDrag(e);
  });
  on(canvas, 'pointerleave', () => { if (!present.drag) setHover(null); });

  function endDrag(e) {
    // Touch browsers may grant audio activation only on release.
    unlockAudio();
    const drag = present.drag;
    if (!drag || e.pointerId !== drag.id) return;
    moveDrag(e);
    present.drag = null;
    releasePointer(drag);
    const b = presenter.state.blocks.find(b => b.id === drag.blockId);
    if (!b) return;
    setHover(e.pointerType === 'touch' ? null : e);
    // Hover must not mask the release compression/slot-in animation.
    if (present.hoverKey === 'block:' + b.id) present.hoverKey = null;
    delete present.hoverAmt['block:' + b.id];
    if (drag.target === drag.col0) {
      presenter.snapBack(b);
    } else if (!slide(b.id, drag.target)) {
      presenter.snapBack(b);
    }
  }
  on(canvas, 'pointerup', endDrag);

  // Desktop drags can cross the canvas margins even without pointer capture.
  // Captured canvas events bubble here too; handle those only once.
  on(window, 'pointermove', e => {
    if (e.target === canvas || present.drag?.pointerType !== 'mouse'
      || e.pointerId !== present.drag.id) return;
    e.preventDefault();
    if (!(e.buttons & 1)) cancelDrag();
    else moveDrag(e);
  });
  on(window, 'pointerup', e => {
    if (e.target !== canvas && present.drag?.pointerType === 'mouse') endDrag(e);
  });

  on(canvas, 'pointercancel', e => {
    if (present.drag?.id === e.pointerId) cancelDrag();
  });
  on(canvas, 'lostpointercapture', e => {
    if (present.drag?.id === e.pointerId && present.drag.pointerType !== 'mouse') cancelDrag();
  });
  on(window, 'blur', cancelDrag);
  on(window, 'resize', cancelDrag);
  on(pinInput, 'input', () => applyPinValue(pinInput.value));
  on(document, 'visibilitychange', () => { if (document.hidden) cancelDrag(); });
  on(canvas, 'contextmenu', e => e.preventDefault());
  on(document, 'touchmove', e => e.preventDefault(), { passive: false });
  on(document, 'gesturestart', e => e.preventDefault());
  on(window, 'keydown', e => {
    unlockAudio();
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (present.menu) { click(); closeMenu(); }
      else if (presenter.state.phase !== 'over') { click(); present.menu = 'pause'; }
      cancelDrag();
      return;
    }
    if (e.key.toLowerCase() === 'r' && (presenter.state.phase === 'over' || present.menu === 'pause')) {
      click();
      restart();
    }
  });

  return { cancelDrag };
}
