# Row spawning

## Previous behavior

The previous spawner independently picked 1–5 empty columns and divided the remaining
cells into blocks 1–4 cells wide. Both gap count and block length were weighted by
level. At level 1 the gap-count weights were 3/22/34/28/13, so three empty cells
were most common. Higher levels increasingly favored dense rows and long blocks.
Colors were cosmetic, with different colors for adjoining blocks.

There was no board inspection, move search, or playability check.

## Block Blast reference

- [Hungry Studio's official App Store description](https://apps.apple.com/us/app/block-blast/id1617391485)
  describes planning placements, clearing rows/columns, and chasing combos on an
  8×8 board. It does not disclose piece-generation rules.
- [NextBigGames' industry analysis (November 2025)](https://nextbiggames.com/2025/11/19/how-block-blast-by-hungry-studio-dominated-the-block-puzzle-genre/)
  reports behavior-adaptive rules, extensive algorithm experiments, and a
  simulation tool used to evaluate gameplay. This is secondary reporting, not
  source code or a specification of its live spawner.

The transferable design idea is to evaluate possible gameplay rather than deal
pieces blindly. Slidey's algorithm below is an original, bounded-search
adaptation for sliding blocks, gravity, and rising rows. Its weights and search
limits are our tuning choices, not verified Block Blast parameters. It does not
assume that Block Blast always supplies solvable pieces.

## Current behavior

### Shared difficulty

The mode popup offers **Easy / Normal** below all mode buttons. The first run
starts on Normal. The preference is saved and applies to Classic and Shaped,
including opening rows, previews, and refills. Switching it restarts the current
game; the popup stays open. Restarting or selecting another mode retains the
difficulty.

Easy keeps each mode's original distribution. Normal uses one shared row factory
in `js/difficulty.js`, restricted to the incoming span for Shaped boards:

- Leave one or two adjacent empty cells, favoring one increasingly with level.
- Avoid positioning gaps where they force isolated occupied cells.
- Strongly favor lengths 2–4 and avoid splits that unnecessarily leave a singleton.
- Retain occasional single-tile blocks and the existing mode-specific preview
  search and survival checks. Shaped edge trimming can still create short pieces.

This raises density and reduces flexible one-cell fillers by the same spawning
rules across all modes; each mode's distinct mechanics still affect play balance.
The rules below describe Classic's board-aware selection in both difficulties.

### Optional Totems

Play modes are Standard, Tetris, and Totem Building, shared by both maps. The
browser first run loads Totem Building; switching restarts the game and persists across
maps and reloads. In Tetris, one rigid Tetris-style piece (L/J, T, or S/Z) can
drop after a turn. Height is randomly 2 or 3 rows. The spawner enumerates shapes
and columns with a clear entry path from above and at least one row of top
clearance, then settles each candidate on a detached board. Any landing that
completes a row is rejected. One safe shape/column placement is chosen randomly;
if none fit, spawning defers. Keep one live Totem, replacing it after it is
cleared.

Totem Building drops an independent 1×1 tile at opening. Resolve any completed
rows and collection immediately, scoring only Mode 2 ordinary-tile clears, then refill only if
needed to restore a legal first slide. Opening playback uses engine events
for the fall, clears, collection and refill. A collected opening tile waits until
the first player turn for replacement. Each turn allows at most
one replacement when no totems remain, plus **one level-up drop** when the Next
Junior bar fills. Cascaded levels in the same turn still share that one-drop
budget. The maximum is **two drops per turn including replacement**;
existing live totems do not count toward this spawn cap. Replacement is chosen
on its own and is not a recent column for later extras. Every drop spends its
allowance even if it immediately clears or collects, and further level-ups during
drop cascades cannot reset the cap. If all drops collect, replacement becomes
eligible again next turn. Drops wait until refill rows have risen and settled.
Among reachable below-ceiling columns, rank ordinary-tile landing height from
highest to lowest, including columns one row lower than the tallest tile stack.
Live totems do not add height, but a drop may still land on them. Break remaining
ties by greater distance from earlier level-up drops this turn. Pick randomly
among the matching columns, or between the two farthest when extras already
dropped. Resolve each tile before ranking the next drop. Mode 1 collects floor
drops; Mode 2 keeps them until stage 3, then collects before gravity or cascades.
Mode 2 levels use ordinary-tile score, with `1000 × current level` points needed
for each level; Mode 1 uses cleared-row progression. Creature collections award
no bonus points and cannot generate level-up drops.
Both rulesets share the same capped bonus-drop budget. Drops may complete
rows. No Building drop is deferred or left waiting for space. A landed tile or
row rise reaching row zero ends the game immediately, before clears; temporary
above-board drop positions do not count. Below-ceiling boards without slides
advance another row rather than ending with `no-moves`.

Building refills use one settled-board rule: rise at least once per turn, then
continue until three distinct rows contain ordinary tiles and a slide is available.
With no intervening clears, 0/1/2+ occupied tile rows get 3/2/1 incoming rows.
Totems do not count; smiling shards count only the rows their cells actually occupy.
Recheck after every rise and after drop-induced clears/collections, so gravity,
shaped trimming and cascades cannot leave a stale refill count. Ceiling contact
stops the refill immediately.

A completed row touching any Totem cell removes the entire piece in Tetris mode,
but clears and scores only the completed row. Cells outside that row detach and
burst away; neighbouring blocks in other rows remain. Totem Building only
removes the cells in the filled rows. Neither play mode blasts extra rows when
a totem reaches the top; a shaped rise that would cut into the piece leaves it
whole instead of trimming it.

Enabling Totems keeps the base map's board-aware row selection. Shared collision,
gravity and clearing routines handle occupied-cell geometry and row-only clears
in live turns and search.

`generateRowCandidate` is the random candidate factory and builds the four starting rows.
The level influence now caps at level 11 to prevent the distribution from
eventually collapsing toward almost exclusively one-gap rows. Sampling is bounded,
including with deterministic random sources.

`generateNextRow(state, random)` selects every preview, including the initial preview:

1. Clone and settle the board, including any pending clears. Account for pending
   level changes. Never mutate blocks, scores, IDs, or animation state in search.
2. Enumerate legal next slides and retain four promising surviving outcomes.
   This models the actual timing: the player moves **before** the preview rises.
3. Generate up to 20 random candidates, deduplicated by geometry and color.
4. For each candidate and preparation, simulate the rise, gravity, and cascades;
   then try every legal response slide and settle it too.
5. Favor earned clears, multi-line cascades, more surviving move choices, lower
   stacks, and fewer holes beneath blocks. Automatic clears get a smaller reward.
6. Below three cleared lines, favor accessible clears more strongly. At seven or
   more occupied rows of height, mix in level-1 candidates and increase the
   importance of recovery and reducing stack height.
7. If any candidate has a surviving continuation in the search, exclude candidates
   without one. Penalize a repeat of the previous preview, including its colors.
8. Randomly choose among the best five candidates (three under pressure), weighted
   toward higher scores. The game remains variable, rather than always dealing
   the single easiest row.

The displayed preview is committed: `rise` inserts it exactly as shown and chooses
only the following preview. Search settles a copy because the logical turn has
not yet resolved the incoming row's cascades at that point.

### Limits and tuning

- `js/board.js`: shared gravity, slides, row insertion, immediate settling, Totem activation, and
  level calculation. Setup and search reuse the same rules as live turns.
- `js/spawn.js`: candidate generation, move search, evaluation, and weighted
  selection. `SEARCH`, `DIFFICULTY`, and `SCORE` hold the tuning constants.
- `js/sim.js`: game state creation, scoring, Classic opening setup (`setupClassic`),
  and committing the displayed preview. The engine owns base-state resets.
  Every preview goes through `generateNextRow`; there is no legacy random-preview
  path or compatibility alias.
- `js/turn.js`: shared turn order and optional Totem drops; `js/engine.js`: headless command validation
  and detached event snapshots. Visual playback does not drive spawning or rules.

When no surviving preparation move exists, the selector returns a valid random
candidate without simulating an impossible no-op turn. Dead-end penalties apply
only to missing responses, rather than clamping the scores of difficult but
survivable responses.

The search considers four preparation moves, one incoming row, and one response.
It can miss deeper solutions and does not guarantee survival after an arbitrary
player move. If no sampled candidate has a surviving continuation, it still
returns a valid row. Starting rows retain their random layout; their preview is
board-aware. High-score history is not an input to difficulty.

Candidate count, preparation count, scoring weights, and shortlist size are in
`js/spawn.js` next to the search. Run `npm test` to verify board invariants, preview
commitment, deterministic generation, state isolation, and surviving continuations
on seeded opening/recovery fixtures. These checks verify behavior, not subjective
difficulty or long-session balance; those still benefit from playtesting.
