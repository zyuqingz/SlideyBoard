import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../js/input.js';
import { bindCanvas, layout } from '../js/canvas-layout.js';
import { createPresenter } from '../js/presenter.js';
import { createState } from '../js/sim.js';
import { BX, CELL, W, H, juniorSlot } from '../js/theme.js';
import { modePopup } from '../js/mode-popup.js';

class Target {
  listeners = new Map();
  style = {};
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  emit(type, fields = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault() {}, ...fields });
  }
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

test('Junior tools hover, hold, target the board, and only activate on a valid release', t => {
  const { canvas, window, document } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset({ ...createState(0, 'easy', 'totem-building'), juniorCollection: [2, 0, 0, 0] });
  const uses = [];
  bindInput(canvas, { presenter, modes: [], sfx: () => {},
    juniorPreview: (variant, row, col) => row === 9 && col === 3 ? { row, col, blockIds: [1] } : null,
    useJunior: (...args) => uses.push(args) });
  const slot = juniorSlot(0, layout.COLLECTION_Y);
  const event = { button: 0, buttons: 1, isPrimary: true, pointerId: 1,
    pointerType: 'mouse', clientX: slot.x + slot.size / 2, clientY: slot.y + slot.size / 2 };
  // The pointer is in row 10 while the lifted junior's center is in row 9.
  const target = { ...event, clientX: BX + CELL * 3.5, clientY: layout.BY + CELL * 10.1 };
  canvas.emit('pointermove', event);
  assert.equal(presenter.present.hoverKey, 'junior:0');
  assert.equal(canvas.style.cursor, 'grab');
  canvas.emit('pointerdown', event);
  assert.equal(presenter.present.drag.kind, 'junior', 'holding displays the power before movement');
  canvas.emit('pointerup', event);
  assert.deepEqual(uses, [], 'a click cannot spend a tool');
  canvas.emit('pointerdown', event);
  canvas.emit('pointermove', target);
  assert.deepEqual(presenter.present.drag.target, { row: 9, col: 3, blockIds: [1] });
  assert.equal(Math.floor((presenter.present.drag.y - layout.BY) / CELL), 9);
  canvas.emit('pointerup', { ...target, pointerId: 2 });
  assert.deepEqual(uses, [], 'other contacts cannot release the tool');
  canvas.emit('pointerup', target);
  assert.deepEqual(uses, [[0, 9, 3]]);
  uses.length = 0;
  canvas.emit('pointerdown', event);
  canvas.emit('pointermove', target);
  canvas.emit('pointerup', { ...target, clientY: layout.BY + CELL * 9.1 });
  assert.deepEqual(uses, [], 'release resamples the junior center, even when the pointer is on a valid row');
  for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'resize', 'visibilitychange', 'Escape']) {
    canvas.emit('pointerdown', { ...event, pointerType: 'touch' });
    canvas.emit('pointermove', { ...target, pointerType: 'touch' });
    if (cancel === 'blur' || cancel === 'resize') window.emit(cancel);
    else if (cancel === 'visibilitychange') { document.hidden = true; document.emit(cancel); }
    else if (cancel === 'Escape') window.emit('keydown', { key: 'Escape' });
    else canvas.emit(cancel, { pointerId: 1 });
    canvas.emit('pointerup', { ...target, pointerType: 'touch' });
    assert.equal(presenter.present.drag, null);
    assert.deepEqual(uses, [], `${cancel} does not activate`);
  }
  presenter.present.menu = null;
  canvas.emit('pointerdown', event);
  canvas.emit('pointermove', target);
  canvas.emit('pointerup', { ...event, clientX: -20 });
  assert.deepEqual(uses, [], 'release outside cancels even after previewing a valid target');
  const empty = juniorSlot(1, layout.COLLECTION_Y);
  canvas.emit('pointerdown', { ...event, clientX: empty.x + 10 });
  assert.equal(presenter.present.drag, null, 'empty slots cannot be picked up');
});

test('Building rules toggle is immediately clickable only in Totem Building', t => {
  const { canvas } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  let toggles = 0;
  bindInput(canvas, { presenter, modes: [], toggleBuildingMode: () => toggles++, sfx: () => {} });
  const control = modePopup().buildingMode;
  const click = () => canvas.emit('pointerdown', { button: 0, isPrimary: true,
    clientX: control.x + control.w / 2, clientY: layout.OY + control.y + control.h / 2 });
  presenter.reset(createState(0, 'easy', 'totem-building'));
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

test('mouse and touch releases reach the intended distant cell from any grab point', t => {
  const { canvas } = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  const slides = [];
  bindInput(canvas, { presenter, modes: [], moveRange: () => [0, 6],
    slide: (id, col) => { slides.push({ id, col }); return true; }, sfx: () => {} });
  for (const pointerType of ['mouse', 'touch']) {
    for (const direction of [-1, 1]) {
      for (const grab of [0.1, 1, 1.9]) {
        const col = direction > 0 ? 0 : 6;
        presenter.reset({ ...createState(), blocks: [{ id: 1, row: 8, col, len: 2, color: 0 }] });
        slides.length = 0;
        const pointer = (type, travel) => canvas.emit(type, {
          button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
          pointerId: 1, pointerType, clientX: BX + (col + grab + direction * travel) * CELL,
          clientY: layout.BY + 8.5 * CELL
        });
        pointer('pointerdown', 0);
        pointer('pointermove', 4.4);
        assert.equal(presenter.present.drag.target, col + direction * 4);
        pointer('pointermove', 4.8);
        assert.equal(presenter.present.drag.target, col + direction * 5);
        pointer('pointerup', 4.77);
        assert.deepEqual(slides, [{ id: 1, col: col + direction * 5 }]);
      }
    }
  }
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

function setupScoreTaps(t) {
  const browser = setupBrowser(t);
  const presenter = createPresenter({ sfx: () => {} });
  presenter.reset(createState());
  bindInput(browser.canvas, { presenter, modes: [], sfx: () => {} });
  const click = (box, overlay = false) => browser.canvas.emit('pointerdown', {
    button: 0, isPrimary: true, pointerId: 1,
    clientX: box.x + box.w / 2,
    clientY: box.y + box.h / 2 + (overlay ? layout.OY : 0)
  });
  const event = { button: 0, isPrimary: true, pointerId: 1, pointerType: 'touch',
    clientX: W / 2, clientY: layout.SCORE_Y };
  const tap = (fields = {}) => {
    browser.canvas.emit('pointerdown', { ...event, ...fields });
    browser.canvas.emit('pointerup', { ...event, ...fields });
  };
  return { ...browser, presenter, click, event, tap };
}

test('three score taps open mode controls directly and every reopening needs three taps', t => {
  const { window, elements, presenter, click, tap } = setupScoreTaps(t);
  assert.equal(elements.length, 1, 'input binding adds no hidden form fields');
  for (const exit of ['Escape', 'p', 'Resume']) {
    tap();
    tap();
    assert.equal(presenter.present.menu, null);
    tap();
    assert.equal(presenter.present.menu, 'mode');
    if (exit === 'Resume') click(modePopup().resume, true);
    else window.emit('keydown', { key: exit });
    assert.equal(presenter.present.menu, null, `${exit} closes the menu once`);
  }
  tap({ pointerType: 'mouse' });
  tap({ pointerType: 'mouse' });
  tap({ pointerType: 'mouse' });
  assert.equal(presenter.present.menu, 'mode', 'desktop clicks also work');
});

test('score tap sequence expires and resets on unrelated input or interrupted gestures', t => {
  const { canvas, window, document, presenter, tap, event } = setupScoreTaps(t);
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  for (const interruption of ['timeout', 'outside', 'move', 'hold', 'pointercancel', 'blur', 'resize', 'hidden']) {
    tap();
    tap();
    if (interruption === 'timeout') now += 601;
    else if (interruption === 'outside') tap({ clientX: 5, clientY: 5 });
    else if (interruption === 'blur' || interruption === 'resize') window.emit(interruption);
    else if (interruption === 'hidden') { document.hidden = true; document.emit('visibilitychange'); }
    else {
      canvas.emit('pointerdown', event);
      if (interruption === 'move') canvas.emit('pointermove', { ...event, clientX: event.clientX + 30 });
      else if (interruption === 'hold') now += 601;
      else canvas.emit('pointercancel', event);
      canvas.emit('pointerup', event);
    }
    tap();
    tap();
    assert.equal(presenter.present.menu, null, `${interruption} resets the sequence`);
    tap();
    assert.equal(presenter.present.menu, 'mode');
    window.emit('keydown', { key: 'Escape' });
  }
});

test('score access ignores secondary contacts and cannot bypass other overlays', t => {
  const { canvas, presenter, tap, event } = setupScoreTaps(t);
  tap();
  tap();
  tap({ isPrimary: false, pointerId: 2 });
  canvas.emit('pointerup', { ...event, pointerId: 2 });
  assert.equal(presenter.present.menu, null);
  tap();
  assert.equal(presenter.present.menu, 'mode');
  presenter.present.menu = 'pause';
  for (let i = 0; i < 3; i++) tap();
  assert.equal(presenter.present.menu, 'pause');
  presenter.reset({ ...createState(), phase: 'over' });
  for (let i = 0; i < 3; i++) tap();
  assert.equal(presenter.present.menu, null);
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
