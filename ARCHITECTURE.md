# Architecture

## Data flow

```text
Pointer/keyboard → input.js → main.js → engine.dispatch(command)
                                           ↓
                                  complete logical turn
                                           ↓
                            detached result + event snapshots
                                           ↓
                        presenter.js → render.js → Canvas
```

The engine completes a turn synchronously. It does not know whether a renderer
exists or whether animations are paused, skipped, fast, or slow. The presenter
owns a separate copy of the state currently on screen, which may trail the engine.
`main.js` connects the two and saves best scores through `storage.js`.

## Ownership

| Module | Owns |
| --- | --- |
| `js/engine.js` | Authoritative state, base-state reset, command validation, snapshots, per-mode best scores/options |
| `js/modes.js` | Classic/Shaped map registry and Classic's turn adapter |
| `js/play-mode.js` | Standard / Tetris / Totem Building identifiers |
| `js/turn.js` | Shared settling, scoring, rescue timing, refills and optional Totem drops |
| `js/board.js` | Shared rectangular/shaped collision, rigid gravity, row clears and Totem removal/activation |
| `js/block-geometry.js` | Occupied-cell and face geometry shared by rules and presentation |
| `js/sim.js` | State creation, scoring, opening setup, preview commitment |
| `js/spawn.js` | Classic row generation and board-aware preview search |
| `js/shapes.js` | Four fixed outlines and per-run random shape selection |
| `js/shaped-board.js` | Shaped rise trimming and cell-counted search settling |
| `js/shaped-spawn.js` | Shaped candidate generation and bounded continuation search |
| `js/shaped-mode.js` | Shape selection, opening and shaped turn adapter |
| `js/totem-spawn.js` | Totem drop placement, layer stacking, and spirit cost |
| `js/difficulty.js` | Shared Normal row geometry and difficulty normalization |
| `js/presenter.js` | Shown state, animated block views, event playback, playback cancellation |
| `js/fx.js`, `js/score-fx.js` | Instance-local visual clocks, particles, score feedback |
| `js/render.js` | Board, HUD and effects drawing; cached paused paints and digit widths |
| `js/canvas-layout.js` | Canvas binding, viewport/safe-area layout, coordinate conversion, paint invalidation |
| `js/canvas-draw.js` | Shared rounded-rectangle, text and hover drawing helpers |
| `js/overlay-render.js` | Settings, mode and game-over overlay drawing |
| `js/theme.js` | Pixel geometry, colors and fonts |
| `js/mode-popup.js` | Mode card layout, vertically centered on the design canvas |
| `js/settings-popup.js` | Settings card layout, language buttons, restart and resume |
| `js/i18n.js` | English/Chinese UI strings and language persistence |
| `js/input.js` | Browser gestures, hit testing, drag preview, menu interaction |
| `js/drag.js` | Symmetric direction-aware drag commitment and pointer gain |
| `js/audio.js` | Sound cues, guarded browser-storage access, mute persistence |
| `js/storage.js` | Per-map best scores and shared difficulty/play-mode preferences |
| `js/main.js` | Browser composition and visual frame loop |

Gameplay modules never import visual modules, DOM APIs, clocks, storage, or
animation callbacks. Presentation modules may read grid dimensions but do not
import rule functions. `test/architecture.test.js` enforces these dependencies.

The `color` field is an abstract group ID; paint colors live in `theme.js`.
Changing the palette does not alter the gameplay RNG stream.

## Headless API

```js
import { createEngine } from './js/engine.js';

const game = createEngine({ best: 0, random: seededRandom });
const before = game.snapshot();
const range = game.moveRange(blockId); // [minCol, maxCol], or null
const result = game.dispatch({ type: 'slide', id: blockId, col: targetCol });
// result: { accepted, reason? , events, state }
const fresh = game.reset();
const shaped = game.reset('shaped', { best: 700, modeOptions: { shapeId: 'diamond' } });
```

Shaped is the default mode; the menu order is Shaped, Classic. With a custom
registry that excludes Shaped, the first registered mode is the default.
`best` and `modeOptions` supplied at creation belong only to the initial mode.
`reset()` restarts the current mode with its latest best score and saved options.
`reset(id, { best, modeOptions })` can seed another mode from browser persistence;
omitted values reuse that mode's in-memory values (zero / empty options on its first
visit). Best scores and options never cross mode boundaries. Setup builds a fresh
state and publishes it only after the mode hook succeeds.

Classic and Shaped are maps (board outlines), registered in `GAME_MODES`. Play
modes are `standard`, `tetris`, and `totem-building`. Tetris keeps one live drop.
Totem Building spends spirit from cleared rows (3 lines per tile) to drop and
stack 1×1 tiles. Neither play mode blasts rows when a totem reaches the top.
Gameplay branches on `playMode`. Snapshots still expose `totemsEnabled` as
`playMode === 'tetris'` for older callers. Stored `'totem'` migrates to `'tetris'`.

`difficulty` and `playMode` are shared run options on `createEngine` and reset.
Unspecified engine calls default to Easy and Standard. The browser first run
loads Normal and Tetris unless `slidey_difficulty_v2` / `slidey_play_mode` store a
preference (`slidey_totems` still migrates). They persist across map switches.
The popup labels maps at the top, then Mode and Difficulty selectors below a
divider. Switching either restarts the run while keeping the popup open.

`seededRandom` is an injected function returning a number in `[0, 1)`; it defaults
to `Math.random`. Identical RNG streams and commands reproduce identical results.
Cosmetic randomness never consumes the injected gameplay RNG.

Snapshots, events and result state are independent deep copies. Editing a returned
object cannot change the engine or another event. Invalid, blocked, fractional,
unknown-block, game-over and no-op commands do not mutate state or consume RNG.

### Event contract

Every event has `type` and a detached `state` **after** that logical step.

| Type | Extra data | Visual interpretation |
| --- | --- | --- |
| `slide` | `id`, `from`, `to` | Snap dragged block to its accepted column |
| `gravity` | `moves: [{ id, from, to }]` | Animate falling blocks |
| `clear` | `rows`, pre-removal `blocks`, `award` | Animate departing blocks, then adopt snapshot and stack score |
| `rise` | — | Animate the committed row and existing blocks upward |
| `shaped-rise` | `blocks` (pre-trim, destination coordinates), `trimmed` (discarded spans) | Animate original spans upward, emit chips, adopt surviving geometry |
| `totem-drop` | `id` | Introduce the incoming totem above the board; subsequent gravity animates its fall |
| `totem-stack` | `ids` | Drop a new cap from above the board onto each growing totem, then join the stack |
| `game-over` | `blockIds` | Bank score, show danger feedback, reveal result |
| `turn-complete` | — | Finish score feedback and adopt final snapshot |

Events contain facts, not durations, easing curves, pixels, colors or drawing
instructions. Their snapshots are deliberately simple for this small board;
there is no global event bus or event-sourced persistence system.

## Adding a mode

A mode is a plain object with:

```js
{
  id: 'classic',
  label: 'CLASSIC',
  reset(state, random, options) { /* construct an opening on fresh base state */ },
  moveRange(state, block) { /* return [minColumn, maxColumn] */ },
  resolveTurn(state, random, emit) { /* resolve rules and emit facts */ }
}
```

Add it to `GAME_MODES` in `js/modes.js`. The mode menu reads the registry, and
selection resets the engine with that mode's stored best score. Classic keeps
the existing `slidey_best` key; other modes use `slidey_best_<modeId>`.
Use `createEngine({ modes, modeId })` to inject isolated mode fixtures in tests.

For a larger mode, put its policy in its own module and import it into the registry.
Reuse board primitives and scoring/setup functions only where the rules match.
Classic's spawn search specifically models Classic's gravity/rise turn order;
a mode with different rules should supply its own preview policy.

The current command is a horizontal `slide`. A genuinely new action (for example,
rotation) needs an explicit command validation/resolution path and tests. A new
kind of visible event needs a presenter handler; the engine still supplies only
the event's data. Extend those contracts when needed rather than placing new
gameplay conditions in input or animation callbacks.

The shared bounding grid is 8×10. Shaped uses `state.shape.rows`, one `{left, right}`
span per row, with an exclusive right edge. Shared primitives treat cells outside
these spans as unavailable, defaulting to the full rectangle for Classic. Each
mode keeps its own candidate generator and preview search. Engine reset reconstructs base state before
calling the mode, so shape and loss metadata cannot leak between modes.
Mode hooks initialize only their geometry and preview; Classic uses `setupClassic`.
All modes share `awardRows` bookkeeping. Shaped supplies playable row widths; the
entire clear batch scores at its pre-update level before lines and level advance.

### Shaped mode

By default, each reset independently selects Funnel, Hourglass, Diamond, or Winding
Corridor with equal probability using the injected gameplay RNG when `shapeId` is
`random` or omitted. The browser first run starts Funnel. The mode popup
also has a cycling shape selector below SHAPED; selecting a shape and pressing
SHAPED starts that configuration. Resume keeps the current run. The preference
lasts for the browser session and restarts retain a fixed selection, while Random
rerolls. The composition root passes `modeOptions: { shapeId }` to `engine.reset`;
the engine defensively copies options and passes them to the mode's reset hook.
Classic ignores these options. Shape IDs are `random`, `funnel`, `hourglass`,
`diamond`, and `corridor`.

The outline stays fixed for each run. All rows are contiguous, at least five cells
wide, and differ gradually; consecutive random runs may select the same shape.

- Horizontal movement stops at the row's span and neighboring blocks.
- Gravity requires the entire block to fit into empty playable cells below.
  A narrowing below acts as a ledge; falling never trims blocks.
- Rising intersects each existing block with the destination row. Discarded cells
  disappear without score; surviving blocks keep their ID/color and never regrow.
  Contiguous spans ensure a trim never splits a block.
- Gravity resolves before clearing. Filling all playable cells clears a row;
  points are `playable width × 10 × level × combo`, using the level before that
  clear batch's level update. Trimming itself awards no points or lines.
- Top-out matches Classic's timing: settle the player's move, then check the top
  before rising. A rise reaching the top still allows a rescue move.
- Empty boards refill. A nonempty board without slides ends with `no-moves`
  rather than stalling. Opening setup includes a bounded movable-seed fallback.
- Preview rows contain blocks of length 1–4, at least one occupied cell and one
  gap, wholly within the bottom span. The displayed preview is committed exactly.
  Search runs on detached copies with the same shaped rules, preferring a surviving
  preparation/response when its bounded search finds one; it is not a guarantee.

Rendering reads shape data directly, with no imports of shaped rule functions.
It draws the playable-silhouette outline on Classic and Shaped (full rectangle
on Classic) and the bottom-width preview, clips rising blocks to playable
cells, and marks current exposure to the next narrowing with a dark red outline
and matching chevrons that scale with the tile. Lifted and hovered tiles draw
above the board silhouette so pickup and hover scale are not clipped by cells
outside the shape.
During `shaped-rise`, the presenter temporarily shows pre-trim blocks, animates
them upward, emits particles for discarded spans, and snaps to the authoritative
survivors. Cancellation uses the same playback generation guard as other events.
Best scores use the existing `slidey_best_shaped` storage key.

### Optional Totems

Totems are an On/Off modifier for both Classic and Shaped, not a registered mode.
Normal blocks keep `{ row, col, len, color, id }`; totems add `kind: 'totem'`,
`height: 2..3`, and `cells: [{ row, col }]` offsets. `row`/`col` are the bounding-box
origin and `len` is its width. Spawned pieces are four-cell L/J, T, and S/Z shapes
in 2- or 3-row orientations. They move and clear as one rigid piece. Collision,
gravity, picking, particles, and rendering use occupied cells, so notches remain
empty and can contain other blocks. Gravity repeats bottom-up passes to settle
overhangs whose supports fall later in the traversal.

- After an accepted turn, sample height 2 or 3 and enumerate that height's shape/
  column placements. Keep one live totem, replacing it after whole-piece clearing.
  Every intermediate footprint from above the board must fit the
  playable outline and avoid other pieces. Landings need one row of top clearance.
- Settle each candidate on a detached board and reject any that produces a full
  row. Choose uniformly among safe shape/column placements; if none remain, defer
  until a later turn. Lower columns beside a higher stack are eligible. A drop
  cannot trigger a row clear or scoring cascade.
- On Shaped boards, a rise chips away Totem cells outside the destination outline,
  using the same particles as ordinary edge trimming. Remaining cells keep their
  world positions and piece ID with rebased bounds; fully trimmed pieces disappear.
  Trimming awards no score or spirit and never regrows cells.
- The entire starting footprint is above the board and the highest existing
  block. Only the landing snapshot is playable. Drops land with at least one row
  of top clearance.
- Filled rows count occupied Totem cells normally. In Tetris mode, clearing any
  row touching a Totem consumes the whole piece; only the selected rows score.
  Off-row cells become detached debris. In Totem Building, only the cells in the
  filled rows leave; leftovers compact into one pole. Gravity then resolves falls.
- A totem that reaches row zero does not clear extra rows. Ordinary top-out keeps
  the rescue-turn timing: settle the slide and check the ceiling before the next
  rise. Empty boards refill; immovable boards end with `no-moves`. The bottom-row
  preview is committed exactly.
- Both maps retain their board-aware previews, which use shared occupied-cell
  collision and row-clearing/removal rules.

`clear` supplies only the selected rows and their pre-removal blocks. For a touched
Totem, `displayBlocks` replaces it with temporary per-cell IDs; `blocks` contains
its in-row cells and `detached` contains its off-row cells. Only in-row cells
flash and shrink. Off-row faces stay unlit, fly apart when the row bursts, and
burst into particles without awarding points or lines. Detached faces render above
the board clip. Playback waits for their departure before adopting the clear state;
pause and reset apply to the same visual clock and cancellation generation.
Canvas rendering draws carved faces with the same dimensions, corner radius,
and gaps as normal one-cell blocks. Drag ghosts and hit testing follow occupied
cells rather than filling the bounding rectangle.
Pause and cancellation use the existing presenter lifecycle. Best scores belong
to the base mode; the retired Totem mode's score key is no longer read or written.

## Playback and lifecycle

- `state.phase` describes gameplay (`play` / `over`). Pause and mode menus live in
  `present.menu`, not in authoritative game state.
- The browser blocks new gestures during playback. Headless callers can immediately
  submit the next turn, since the engine never waits for animation completion.
- Before unlocking gestures, the presenter adopts the final turn snapshot and
  reconciles every block view to its grid position and visible geometry. Score
  feedback may continue afterward, but cannot replace board state; each award is
  banked only once even when consecutive turn completions overlap.
- Snapshot adoption resets cached positions and clear visibility. Slide playback
  explicitly preserves the released drag position, gravity pins its source row,
  and both rise variants start one row below their destination. Dragging identifies
  a block by ID and resolves its current shown geometry for rendering and release.
- Menus freeze the visual clock. Resume continues playback from the same point.
- Hover transitions continue in menus. The presenter reports visible changes;
  once hover settles, rendering skips unchanged menu frames. Input, resizing,
  font readiness and icon loading invalidate the paint. Active play retains its
  frame-driven decorations and feedback. Score digit widths are cached between
  invalidations. Input imports geometry directly, rather than through rendering.
- Restart clears instance-local effects and increments a playback generation.
  Cancelled promises settle; old continuations cannot modify a new game, including
  when restart falls between tween completion and its promise continuation.
- Browser best-score persistence happens after command resolution, independently
  of whether score feedback has finished playing.
- `window.__slidey.state` exposes shown state for inspection;
  `window.__slidey.logicalState` exposes a detached authoritative snapshot.

## Verification

Run `npm test`. Coverage includes existing board/spawn/score behavior, legal-command
validation, cascading combos, Classic loss timing, deterministic multi-turn parity
with the old logical sequence, mode injection, snapshot isolation, playback speed
independence, pause/resume, restart cancellation and dependency boundaries.
Totem tests cover notches/overhang collisions, row-only clears and off-row debris, safe drops,
seeded multi-turn geometry for both difficulties and every shape, play-mode persistence,
committed previews, no top-edge row blast, Totem Building spirit tiles,
and split clear/debris/drop playback including pause and restart cancellation.
Regression tests also cover mirrored drag thresholds, stationary/repeated pointer
events, direction reversal, board bounds, blocked-storage audio import, seeded
engine resets and per-mode best-score/options isolation.

## Design guidance consulted

NotebookLM notebook: **SME: Web Game Coding & Architecture Best Practices**.
Its response supported input-driven turn logic, separate frame-driven visuals,
simple data/algorithms and focused extension points. The concrete command/event
API here is this project's implementation choice.

- [MDN: Anatomy of a video game](https://developer.mozilla.org/en-US/docs/Games/Anatomy)
- [Game Programming Patterns: Architecture, Performance, and Games](https://gameprogrammingpatterns.com/architecture-performance-and-games.html)
