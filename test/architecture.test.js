import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the engine dependency graph cannot reach visual modules or browser APIs', async () => {
  const allowed = new Set(['engine.js', 'modes.js', 'sim.js', 'board.js', 'spawn.js', 'difficulty.js',
    'shapes.js', 'shaped-board.js', 'shaped-spawn.js', 'shaped-mode.js',
    'totem-spawn.js', 'turn.js', 'block-geometry.js', 'play-mode.js']);
  const seen = new Set();
  async function visit(name) {
    if (seen.has(name)) return;
    assert.ok(allowed.has(name), `unexpected dependency in core: ${name}`);
    seen.add(name);
    const source = await readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(window|document|localStorage|performance|requestAnimationFrame|setTimeout|setInterval)\b/);
    for (const [, path] of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      assert.ok(path.startsWith('./'), `unexpected external dependency: ${path}`);
      await visit(path.slice(2));
    }
  }
  await visit('engine.js');
});

test('presentation modules cannot import the engine or turn policies', async () => {
  for (const name of ['presenter.js', 'input.js', 'render.js', 'canvas-layout.js', 'canvas-draw.js',
    'overlay-render.js', 'food-art.js', 'creature-art.js', 'monster.js', 'theme.js', 'fx.js', 'score-fx.js', 'drag.js', 'mode-popup.js', 'settings-popup.js', 'i18n.js', 'audio.js', 'mode-lock.js']) {
    const source = await readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s*['"].*\/(engine|modes|sim|spawn|shapes|shaped-board|shaped-spawn|shaped-mode|totem-spawn|turn|difficulty)\.js['"]/);
    const boardImport = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/board\.js['"]/);
    if (boardImport) for (const field of boardImport[1].split(',').map(s => s.trim()))
      assert.ok(['COLS', 'ROWS', 'COLOR_GROUPS'].includes(field), `${name} imports a rule: ${field}`);
  }
});

test('shared primitives and Classic spawn policy have no dependency on mode policies', async () => {
  for (const name of ['board.js', 'sim.js', 'spawn.js']) {
    const source = await readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s*['"].*\/(shapes|shaped-[^/]+|totem-[^/]+)\.js['"]/);
  }
});
