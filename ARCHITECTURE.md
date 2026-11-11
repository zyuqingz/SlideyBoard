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
| `js/play-mode.js` | Standard / Tetris / Totem Building identifiers and progression tuning |
| `js/turn.js` | Shared settling, scoring, rescue timing, refills and optional Totem drops |
| `js/board.js` | Shared rectangular/shaped collision, rigid gravity, row clears and Totem collection |
| `js/block-geometry.js` | Occupied-cell and face geometry shared by rules and presentation |
| `js/sim.js` | State creation, scoring, opening setup, preview commitment |
| `js/spawn.js` | Classic row generation and board-aware preview search |
| `js/shapes.js` | Four fixed outlines and per-run random shape selection |
| `js/shaped-board.js` | Shaped rise trimming and cell-counted search settling |
| `js/shaped-spawn.js` | Shaped candidate generation and bounded continuation search |
| `js/shaped-mode.js` | Shape selection, opening and shaped turn adapter |
| `js/totem-spawn.js` | Tetris piece placement and supported Building tile drops |
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
| `js/drag.js` | Distance-based drag gain, starting dead zone, reversal hysteresis and bounded landing preview |
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
const opening = game.opening(); // { accepted, events }, detached playback for the latest reset
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
`opening()` returns that reset's setup events, ending in `turn-complete`, or an
unaccepted empty result when setup emits nothing. The browser initializes the
presenter from the first event snapshot and plays the sequence through `play()`;
the engine snapshot already contains the fully resolved opening and score.

Classic and Shaped are maps (board outlines), registered in `GAME_MODES`. Play
modes are `standard`, `tetris`, and `totem-building`. Tetris keeps one live drop.
Totem Building drops independent 1×1 totems, replacing them and adding level-up extras
within a per-turn spawn budget.
Clears improve totem smiles; reaching the floor collects them for points. An
all-totem row immediately upgrades its totems to max smile and clears them in place.
Neither play mode blasts rows when a totem reaches the top.
Gameplay branches on `playMode`. Snapshots still expose `totemsEnabled` as
`playMode === 'tetris'` for older callers. Stored `'totem'` migrates to `'tetris'`.

`difficulty` and `playMode` are shared run options on `createEngine` and reset.
Unspecified engine calls default to Easy and Standard. The browser first run
loads Normal and Totem Building unless `slidey_difficulty_v2` / `slidey_play_mode` store a
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
| `clear` | `rows`, pre-removal `blocks`, `award`, optional `displayBlocks`, `collected`, `collectionAward` | Animate departing blocks and surviving Building faces; all-totem rows show max faces and bank individual awards when clearing finishes |
| `rise` | — | Animate the committed row and existing blocks upward |
| `shaped-rise` | `blocks` (pre-trim, destination coordinates), `trimmed` (discarded spans) | Animate original spans upward, emit chips, adopt surviving geometry |
| `totem-drop` | `id` | Introduce the incoming totem above the board; subsequent gravity animates its fall |
| `totem-collect` | collected `blocks`, `award` | Show individual scores while totems sink beneath the floor, then bank their points and adopt the snapshot |
| `game-over` | `blockIds` | Bank score, show danger feedback, reveal result |
| `turn-complete` | — | Finish score feedback and adopt final snapshot |

Events contain facts, not durations, easing curves, pixels, colors or drawing
instructions. Their snapshots are deliberately simple for this small board;
there is no global event bus or event-sourced persistence system.
Standard/Tetris row awards contain cumulative points for the current turn, so
successive clears replace the pending popup. Building collection awards contain
only that batch's points and `totems: [{ id, pts, mult }]` for individual popups.
An all-totem row supplies these in `collectionAward`, alongside its zero-point
row `award`; collection scoring uses the level after row progression.

## Adding a mode

A mode is a plain object with:

```js
{
  id: 'classic',
  label: 'CLASSIC',
  reset(state, random, options, emit) { /* construct an opening; optionally emit setup steps */ },
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
All modes share `awardRows` bookkeeping. Standard and Tetris clear batches score
at their pre-update level using playable row widths. Building clears advance
lines and level without awarding points; collections use `awardTotemCollect`.

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
- Gravity resolves before clearing. Standard and Tetris row-clear points are
  `playable width × 10 × level × combo`, using the level before that clear batch's
  level update. Building uses the collection rules below. Trimming itself awards
  no points or lines.
- Top-out matches Classic's timing: settle the player's move, then check the top
  before rising. A rise reaching the top still allows a rescue move.
- Empty boards refill. A nonempty board without slides ends with `no-moves`
  rather than stalling. Opening setup includes a bounded movable-seed fallback.
- Standard and Tetris preview rows contain blocks of length 1–4, at least one
  occupied cell and one gap, wholly within the bottom span. Building candidates
  use lengths 2–4 and omit isolated cells. The displayed preview is committed exactly.
  Search runs on detached copies with the same shaped rules, preferring a surviving
  preparation/response when its bounded search finds one; it is not a guarantee.

Rendering reads shape data directly, with no imports of shaped rule functions.
It draws the playable-silhouette outline on Classic and Shaped (full rectangle
on Classic) and the bottom-width preview, clips rising blocks to playable
cells, and marks current exposure to the next narrowing with a dark red outline
and matching chevrons that scale with the tile. A totem whose cells sit on the
ceiling or in that exposed band shakes and draws a >_< face instead of the
outline and chevrons. Lifted and hovered tiles draw
above the board silhouette so pickup and hover scale are not clipped by cells
outside the shape.
During `shaped-rise`, the presenter temporarily shows pre-trim blocks, animates
them upward, emits particles for discarded spans, and snaps to the authoritative
survivors. Cancellation uses the same playback generation guard as other events.
Best scores use the existing `slidey_best_shaped` storage key.

### Tetris pieces

Tetris is a play mode that selects the Classic map. Shared geometry also supports
shaped outlines for custom callers and tests.
Normal blocks keep `{ row, col, len, color, id }`; totems add `kind: 'totem'`,
`height: 2..3`, and `cells: [{ row, col }]` offsets. `row`/`col` are the bounding-box
origin and `len` is its width. Spawned pieces are four-cell L/J, T, and S/Z shapes
in 2- or 3-row orientations. They move and clear as one rigid piece. Collision,
gravity, picking, particles, and rendering use occupied cells, so notches remain
empty and can contain other blocks. Gravity repeats bottom-up passes to settle
overhangs whose supports fall later in the traversal.

- After an accepted turn, level 1 waits 5 slides between drops (`tetrisDropIn`);
  later levels wait 4. A counter at the top of the board shows the wait.
  Sample height 2 or 3 and enumerate that height's shape/column placements. Keep
  one live totem, replacing it after the piece is cleared.
  Every intermediate footprint from above the board must fit the
  playable outline and avoid other pieces. Landings need one row of top clearance.
- Settle each candidate on a detached board and reject any that produces a full
  row. Choose uniformly among safe shape/column placements; if none remain, defer
  until a later turn. Lower columns beside a higher stack are eligible. A drop
  cannot trigger a row clear or scoring cascade.
- On Shaped boards, a rise chips away Totem cells outside the destination outline,
  using the same particles as ordinary edge trimming. Remaining cells keep their
  world positions and piece ID with rebased bounds; fully trimmed pieces disappear.
  Trimming awards no score or lines and never regrows cells.
- The entire starting footprint is above the board and the highest existing
  block. Only the landing snapshot is playable. Drops land with at least one row
  of top clearance.
- Filled rows count occupied Totem cells normally. In Tetris mode, only cells in
  the filled rows leave; leftover cells stay in orthogonally connected groups as
  smiling shards (intact tetrominos keep a grimace). A new tetromino can still
  spawn. Only the selected rows score. Gravity then resolves falls.
- A totem that reaches row zero does not clear extra rows. Ordinary top-out keeps
  the rescue-turn timing: settle the slide and check the ceiling before the next
  rise. Empty boards refill with three rows (one on Shaped). A live tetromino
  with no ordinary tiles still gets a single rise, not the empty-board dump.
  Immovable boards end with
  `no-moves`. The bottom-row preview is committed exactly.
- Both maps retain their board-aware previews, which use shared occupied-cell
  collision and row-clearing/removal rules.

`clear` supplies only the selected rows and their pre-removal blocks. For a touched
Tetris piece, `displayBlocks` shows in-row cells as temporary fragments and leftover
cells as smiling shards grouped by remaining orthogonal connections. `blocks`
contains only the in-row cells. Those flash and shrink. Intact tetrominos draw a
grimace plus rear connectors; leftover shards smile and keep connectors on cells
that still touch.
Pause and reset apply to the same visual clock and cancellation generation.
Canvas rendering draws carved faces with the same dimensions, corner radius,
and gaps as normal one-cell blocks. Drag ghosts and hit testing follow occupied
cells rather than filling the bounding rectangle.
Pause and cancellation use the existing presenter lifecycle. Best scores belong
to the base mode; the retired Totem mode's score key is no longer read or written.

### Totem Building

- Reset drops one independent 1×1 totem with `smile: 1`. Opening drops resolve
  clears, smile upgrades and floor collections with normal scoring before input.
  Refill only if needed to restore a legal first slide; an immediately
  collected opening face is not repeatedly replaced. The presenter plays the
  engine's opening events, including the fall, clears, collections and refill.
- When no totems remain, allow one replacement per turn after refilling/settling.
  This is separate from level-up extras. Clearing or collecting a drop spends its
  allowance; an exhausted replacement allowance becomes available again next turn.
- Every five cleared rows advances a level. New levels grant `min(level, 4)` extras,
  capped at four level-up drops across the entire turn (five with replacement).
  The budget is calculated from the turn's starting level to its current level,
  with already-spawned extras deducted. Refill and drop cascades cannot renew it.
  Each drop lands and resolves before the next is chosen. There is no persistent
  spawn queue or waiting-for-space state; the cap limits drops, not live totems.
- Drops choose reachable, below-ceiling columns with the greatest distance from
  existing totem columns and earlier drops this turn, randomly breaking ties.
  Turn-local spacing includes already-collected drops. Stacks, shaped ledges and
  direct floor landings remain eligible; restricted entry paths can still force
  stacking. Floor drops collect normally. Row-completing
  drops resolve normal clears and smile upgrades. If only ceiling landings remain,
  the tile lands and ends the game instead of deferring.
- Full rows containing ordinary tiles clear those tiles and improve each touched
  totem's smile, up to stage 3. Totem-only rows immediately set every participating
  totem to stage 3 and collect them in place. Rows still advance level progression;
  points come from the collected totems.
- After gravity and row clears finish, floor totems are collected for
  `50 × smile × level` points each. Collection can release another totem or cascade;
  each totem has its own score popup and banks its points as its collection
  animation finishes, before the rest of the chain completes.
- Incoming candidates use lengths 2–4. Rise at least once, then refill to four
  distinct occupied ordinary-tile rows: 0/1/2/3+ rows normally get 4/3/2/1 rises.
  Totems are excluded; shards count their actual occupied cell rows. Recount after
  every settled rise and drop-induced clear/collection, including shaped trimming.
  Fragmented candidates with no usable run fall back to a contiguous-gap row.
  A rise or landed drop touching row zero immediately ends the game, before clears
  can erase that contact. Incoming tiles above the board are not checked until they
  land. If a resolved board has no slides below the ceiling, advance rows until a
  move becomes available or the ceiling is reached; Building has no `no-moves` loss.
- Both preview searches retain `playMode` in every detached board copy, so clears
  preserve Building faces and floor collections remove them during simulation.
  Classic candidates use the Building five-line progression curve. Both searches
  reject Building rises that touch the ceiling before simulating a response slide.
- Sand, jade, and gold faces blend through ordinary smile upgrades. Floor
  collections compress and rebound, then sink beneath the board mask. All-totem
  row clears show gold faces immediately and pop away in a left-to-right wave,
  with side confetti and a centered, scale-only “GOD CLEAR!” celebration. The
  celebration shares the pause/reset clock and can outlive board motion. Individual score
  popups originate beside each totem and fly toward the total during its animation.
  Their collected smile stage sets the styling: small white, medium pale gold,
  and large gold for stages 1–3, including max-stage god clears.

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
Totem tests cover notches/overhang collisions, row-only clears and leftover smiling tiles, safe drops,
seeded multi-turn geometry for both difficulties and every shape, play-mode persistence,
committed previews, no top-edge row blast, Building smile upgrades and floor collection,
and split clear/shard/drop playback including pause and restart cancellation.
Building regressions cover individual collection score presentation and immediate
banking, max-smile all-totem row clears, deferred
drop retries, rule-preserving board copies, level pacing, and usable row runs.
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
