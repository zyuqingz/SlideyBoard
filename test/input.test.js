import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../js/input.js';
import { bindCanvas, layout } from '../js/canvas-layout.js';
import { createPresenter } from '../js/presenter.js';
import { createState } from '../js/sim.js';
import { BX, CELL, W, H } from '../js/theme.js';
import { passwordBoxControl, passwordBackControl, buildingModeControl } from '../js/mode-popup.js';
import { MODE_PASSWORD, isModeUnlocked, modePasswordDigits, lockModeUi, setModePasswordDigits } from '../js/mode-lock.js';

class Target {
  listeners = new Map();
  style = {};
  value = '';
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  emit(type, fields = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault() {}, ...fields });
  }
  setAttribute() {}
  focus() { document.activeElement = this; }
  blur() { if (document.activeElement === this) document.activeElement = null; }
}

function setupBrowser(t) {
  const elements = [];
  const window = Object.assign(new Target(), { innerWidth: W, innerHeight: H });
  const document = Object.assign(new Target(), {
    createElement: () => new Target(), body: { style: {}, appendChild(el) { elements.push(el); } }
  });
  const globals = { window, document, getComputedStyle: () => ({ paddingTop: '0', paddingBottom: '0' }) };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  const canvas = Object.assign(new Target(), {
    getContext: () => ({ setTransform() {} }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
    setPointerCapture() {},
    releasePointerCapture(id) { this.emit('lostpointercapture', { pointerId: id }); }
  });
  bindCanvas(canvas);
  return { window, document, canvas, elements };
}

test('monster tracks mouse and primary touch input, retaining the last touch location', t => {
  const { canvas } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset({ ...createState(), blocks: [] });
  bindInput(canvas, { presenter, modes: [], sfx: () => {} });
  const event = { button: 0, isPrimary: true, pointerId: 1,
    pointerType: 'mouse', clientX: 125, clientY: 500 };
  canvas.emit('pointermove', event);
  assert.deepEqual(presenter.present.monster.target, { x: 125, y: 500 });
  canvas.emit('pointerdown', { ...event, pointerType: 'touch', clientX: 250 });
  assert.deepEqual(presenter.present.monster.target, { x: 250, y: 500 });
  canvas.emit('pointermove', { ...event, pointerType: 'touch', isPrimary: false, clientX: 700 });
  assert.equal(presenter.present.monster.target.x, 250);
  canvas.emit('pointerup', { ...event, pointerType: 'touch', clientX: 300 });
  canvas.emit('pointerleave', { ...event, pointerType: 'touch' });
  assert.deepEqual(presenter.present.monster.target, { x: 300, y: 500 });
});

test('Building rules toggle is clickable only in Totem Building after unlocking', t => {
  const { canvas } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  let toggles = 0;
  bindInput(canvas, { presenter, modes: [], toggleBuildingMode: () => toggles++, sfx: () => {} });
  const control = buildingModeControl([]);
  const click = () => canvas.emit('pointerdown', { button: 0, isPrimary: true,
    clientX: control.x + control.w / 2, clientY: layout.OY + control.y + control.h / 2 });
  lockModeUi();
  t.after(lockModeUi);
  presenter.reset(createState(0, 'easy', 'totem-building'));
  presenter.present.menu = 'mode';
  click();
  assert.equal(toggles, 0);
  setModePasswordDigits(MODE_PASSWORD);
  presenter.present.menu = 'mode';
  click();
  assert.equal(toggles, 1);
  presenter.reset(createState());
  presenter.present.menu = 'mode';
  click();
  assert.equal(toggles, 1);
});

test('browser pointer lifecycle only commits intentional releases', async t => {
  const { window, document, canvas } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  const initial = { ...createState(), blocks: [{ id: 1, row: 8, col: 3, len: 2, color: 0 }] };
  const slides = [];
  let range = [0, 6];
  bindInput(canvas, { presenter, modes: [], moveRange: () => range,
    slide: (id, col) => { slides.push({ id, col }); return false; } });
  const pointer = (type, x = 0, y = 0, fields = {}) => canvas.emit(type, {
    button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch',
    clientX: BX + (3.5 + x) * CELL, clientY: layout.BY + (8.5 + y) * CELL, ...fields
  });
  const reset = () => { presenter.reset(initial); slides.length = 0; range = [0, 6]; };
  const settle = async () => {
    for (let i = 0; i < 30 && presenter.busy; i++) {
      presenter.update(16);
      await Promise.resolve();
    }
    assert.equal(presenter.busy, false);
    assert.equal(presenter.viewOf(initial.blocks[0]).vx, 3);
  };

  reset();
  pointer('pointerdown');
  assert.equal(presenter.viewOf(initial.blocks[0]).slot, 0, 'touch alone does not pick up');
  pointer('pointermove', 0.08, 0.03);
  pointer('pointerup', 0.09, 0.03);
  assert.deepEqual(slides, []);
  assert.equal(presenter.busy, false, 'tap does not lock input for an empty animation');

  reset();
  pointer('pointerdown');
  pointer('pointermove', 0.05, 0.3);
  pointer('pointerup', 2, 0.5);
  assert.deepEqual(slides, [], 'vertical start cannot become a slide on release');

  reset();
  pointer('pointerdown', 0, 0, { isPrimary: false, pointerId: 2 });
  assert.equal(presenter.present.drag, null);
  pointer('pointerdown');
  pointer('pointermove', 3, 0, { pointerId: 2 });
  pointer('pointerup', 3, 0, { pointerId: 2 });
  assert.equal(presenter.present.drag.target, 3, 'another contact cannot move or release the block');
  pointer('pointermove', 0.8);
  const preview = presenter.present.drag.target;
  pointer('pointerup', 0.78);
  assert.deepEqual(slides, [{ id: 1, col: preview }], 'release jitter keeps the preview destination');
  assert.equal(preview, 4);
  assert.equal(presenter.present.drag, null);
  assert.equal(presenter.busy, true, 'rejected command snaps back');
  pointer('pointerdown');
  assert.equal(presenter.present.drag, null, 'new gesture waits for snap completion');
  await settle();

  reset();
  pointer('pointerdown');
  pointer('pointerup', 1.9);
  assert.deepEqual(slides, [{ id: 1, col: 5 }], 'final release coordinates are sampled');
  await settle();

  for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'resize', 'visibilitychange']) {
    reset();
    pointer('pointerdown');
    pointer('pointermove', 1.9);
    if (cancel === 'blur' || cancel === 'resize') window.emit(cancel);
    else if (cancel === 'visibilitychange') {
      document.hidden = true;
      document.emit(cancel);
    } else pointer(cancel, 1.9);
    pointer('pointerup', 1.9);
    assert.deepEqual(slides, [], `${cancel} must not spend a turn`);
    assert.equal(presenter.present.drag, null);
    await settle();
  }

  reset();
  range = [3, 3];
  pointer('pointerdown');
  assert.equal(presenter.present.drag, null, 'immovable blocks do not capture a drag');
});

test('desktop drags continue through side margins without pointer capture', t => {
  const { window, canvas } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  const initial = { ...createState(), blocks: [{ id: 1, row: 8, col: 3, len: 2, color: 0 }] };
  const slides = [];
  bindInput(canvas, { presenter, modes: [], moveRange: () => [0, 6],
    slide: (id, col) => { slides.push({ id, col }); return true; }, sfx: () => {} });
  const pointer = (target, type, clientX, fields = {}) => target.emit(type, {
    target, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    isPrimary: true, pointerId: 1, pointerType: 'mouse',
    clientX, clientY: layout.BY + 8.5 * CELL, ...fields
  });

  for (const captureFails of [false, true]) {
    presenter.reset(initial);
    slides.length = 0;
    canvas.setPointerCapture = () => { if (captureFails) throw new Error('capture unavailable'); };
    pointer(canvas, 'pointerdown', BX + 3.5 * CELL);
    pointer(canvas, 'pointermove', BX + 4.5 * CELL);
    const drag = presenter.present.drag;
    pointer(window, 'pointermove', BX + 4.5 * CELL, { target: canvas });
    assert.equal(drag.lastX, BX + 4.5 * CELL, 'bubbled canvas movement is not processed twice');
    canvas.emit('lostpointercapture', { pointerId: 1 });
    assert.equal(presenter.present.drag, drag, 'capture loss keeps the mouse drag alive');
    assert.equal(presenter.busy, false, 'capture loss does not animate a snap-back');

    pointer(window, 'pointermove', W + CELL, { pointerId: 2 });
    assert.equal(drag.target, 4, 'another pointer cannot move the drag');
    pointer(window, 'pointermove', W + CELL);
    assert.equal(drag.target, 6, 'right margin continues the drag to the wall');
    pointer(window, 'pointermove', W);
    assert.equal(drag.target, 5, 'reversing in the margin immediately moves away from the wall');
    pointer(window, 'pointermove', -CELL);
    assert.equal(drag.target, 0, 'left margin also continues the drag');
    pointer(window, 'pointerup', -CELL, { pointerId: 2 });
    assert.equal(presenter.present.drag, drag, 'another pointer cannot release the drag');
    pointer(window, 'pointerup', -CELL);
    assert.deepEqual(slides, [{ id: 1, col: 0 }], 'release in a margin commits the preview');
    assert.equal(presenter.present.drag, null);
    pointer(canvas, 'pointerup', -CELL);
    assert.equal(slides.length, 1, 'late release cannot commit twice');
  }
});

test('mouse movement recovers a missed release after capture failure or loss', async t => {
  const { window, canvas } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  const initial = { ...createState(), blocks: [{ id: 1, row: 8, col: 3, len: 2, color: 0 }] };
  const slides = [];
  bindInput(canvas, { presenter, modes: [], moveRange: () => [0, 6],
    slide: (id, col) => { slides.push({ id, col }); return true; }, sfx: () => {} });
  const event = { button: 0, buttons: 1, isPrimary: true, pointerId: 1, pointerType: 'mouse',
    clientX: BX + 3.5 * CELL, clientY: layout.BY + 8.5 * CELL };
  for (const captureFails of [false, true]) for (const target of [canvas, window]) {
    presenter.reset(initial);
    canvas.setPointerCapture = () => { if (captureFails) throw new Error('capture unavailable'); };
    canvas.emit('pointerdown', { ...event, target: canvas });
    canvas.emit('pointermove', { ...event, target: canvas, clientX: BX + 4.5 * CELL });
    presenter.update(16);
    if (!captureFails) canvas.emit('lostpointercapture', { pointerId: 1 });
    // The release happened outside the window; only the next move reveals it.
    target.emit('pointermove', { ...event, target, buttons: 0, clientX: BX + 5.5 * CELL });
    assert.equal(presenter.present.drag, null);
    assert.deepEqual(slides, [], 'a missed release cancels rather than spending a turn');
    for (let i = 0; i < 30 && presenter.busy; i++) {
      presenter.update(16);
      await Promise.resolve();
    }
    assert.equal(presenter.busy, false);
    assert.equal(presenter.viewOf(initial.blocks[0]).vx, 3);
    canvas.emit('pointerdown', { ...event, target: canvas });
    assert.ok(presenter.present.drag, 'the next gesture is accepted');
  }
});

function setupPassword(t) {
  const browser = setupBrowser(t);
  lockModeUi();
  t.after(lockModeUi);
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(createState());
  bindInput(browser.canvas, { presenter, modes: [] });
  const pin = browser.elements.at(-1);
  const click = (box, overlay = false) => browser.canvas.emit('pointerdown', {
    button: 0, isPrimary: true, pointerId: 1,
    clientX: box.x + box.w / 2,
    clientY: box.y + box.h / 2 + (overlay ? layout.OY : 0)
  });
  const enter = value => { pin.value = value; pin.emit('input'); };
  const open = () => click(layout.MODE_BTN);
  open();
  return { ...browser, presenter, pin, click, enter, open };
}

test('password menu exits clear and blur input without opening another menu', t => {
  const { window, document, presenter, pin, click, enter, open } = setupPassword(t);
  for (const exit of ['Escape', 'p', 'Back']) {
    enter('67');
    if (exit === 'Back') click(passwordBackControl([]), true);
    else window.emit('keydown', { key: exit });
    assert.equal(presenter.present.menu, null, `${exit} closes the menu once`);
    assert.notEqual(document.activeElement, pin);
    assert.equal(pin.value, '');
    assert.equal(modePasswordDigits(), '');
    enter(MODE_PASSWORD);
    assert.equal(isModeUnlocked(), false, 'late input outside the password screen is ignored');
    assert.equal(pin.value, '');
    open();
    assert.equal(document.activeElement, pin);
    assert.equal(modePasswordDigits(), '');
  }
});

test('refocusing the password field preserves partial entry and unlocks on completion', t => {
  const { document, presenter, pin, click, enter } = setupPassword(t);
  enter('67');
  pin.blur();
  click(passwordBoxControl([]), true);
  assert.equal(document.activeElement, pin);
  assert.equal(pin.value, '67');
  assert.equal(modePasswordDigits(), '67');
  enter(pin.value + '67');
  assert.equal(isModeUnlocked(), true);
  assert.equal(presenter.present.menu, 'mode');
  assert.equal(pin.value, '');
  assert.equal(modePasswordDigits(), '');
  assert.notEqual(document.activeElement, pin);
  enter('12');
  assert.equal(modePasswordDigits(), '', 'late input after unlocking is ignored');
});

test('password input normalizes non-digits and allows retry after an incorrect code', t => {
  const { document, pin, enter } = setupPassword(t);
  assert.equal(pin.maxLength, MODE_PASSWORD.length);
  enter('0000');
  assert.equal(isModeUnlocked(), false);
  assert.equal(pin.value, '');
  assert.equal(modePasswordDigits(), '');
  assert.equal(document.activeElement, pin, 'incorrect entry stays focused for retry');
  enter('6a76');
  assert.equal(pin.value, '676', 'non-digits do not consume the remaining input capacity');
  assert.equal(modePasswordDigits(), '676');
  enter(pin.value + '7');
  assert.equal(isModeUnlocked(), true);
});

test('buttons play click foley and dragging plays scrape foley', async t => {
  const { canvas } = setupBrowser(t);
  const cues = [];
  const presenter = createPresenter({ sfx: () => {} });
  const initial = { ...createState(), blocks: [{ id: 1, row: 8, col: 3, len: 2, color: 0 }] };
  presenter.reset(initial);
  bindInput(canvas, { presenter, modes: [], moveRange: () => [0, 6],
    slide: () => false, sfx: name => cues.push(name) });
  canvas.emit('pointerdown', {
    button: 0, isPrimary: true, pointerId: 1,
    clientX: layout.PAUSE_BTN.x + layout.PAUSE_BTN.w / 2,
    clientY: layout.PAUSE_BTN.y + layout.PAUSE_BTN.h / 2
  });
  assert.equal(presenter.present.menu, 'pause');
  assert.deepEqual(cues, ['click']);

  cues.length = 0;
  presenter.present.menu = null;
  canvas.emit('pointerdown', {
    button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch',
    clientX: BX + 3.5 * CELL, clientY: layout.BY + 8.5 * CELL
  });
  canvas.emit('pointermove', {
    button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch',
    clientX: BX + 4.4 * CELL, clientY: layout.BY + 8.5 * CELL
  });
  assert.ok(presenter.present.drag?.active);
  assert.ok(cues.includes('drag'));
});
