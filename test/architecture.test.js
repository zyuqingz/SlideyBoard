import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the engine dependency graph cannot reach visual modules or browser APIs', async () => {
  const allowed = new Set(['engine.js', 'modes.js', 'sim.js', 'board.js', 'spawn.js',
    'shapes.js', 'shaped-board.js', 'shaped-spawn.js', 'shaped-mode.js',
    'totem-board.js', 'totem-spawn.js', 'totem-mode.js']);
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
    'overlay-render.js', 'theme.js', 'fx.js', 'score-fx.js', 'drag.js', 'mode-popup.js', 'settings-popup.js', 'i18n.js', 'audio.js']) {
    const source = await readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s*['"].*\/(engine|modes|sim|spawn|shapes|shaped-board|shaped-spawn|shaped-mode|totem-board|totem-spawn|totem-mode)\.js['"]/);
    const boardImport = source.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/board\.js['"]/);
    if (boardImport) for (const field of boardImport[1].split(',').map(s => s.trim()))
      assert.ok(['COLS', 'ROWS', 'COLOR_GROUPS'].includes(field), `${name} imports a rule: ${field}`);
  }
});

test('Classic primitives and spawn policy have no dependency on other mode rules', async () => {
  for (const name of ['board.js', 'sim.js', 'spawn.js']) {
    const source = await readFile(new URL(`../js/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s*['"].*\/(shapes|shaped-[^/]+|totem-[^/]+)\.js['"]/);
    assert.doesNotMatch(source, /\bstate\.shape\b|\bboard\.shape\b/);
  }
});
