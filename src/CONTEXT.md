---

PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

This project is an experimental procedural dungeon generator built in TypeScript with a small React preview/debug app.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system with backtracking, secrets, puzzles, monsters, and loot.

The system is intentionally layered so that geometry, gameplay intent, and puzzle logic are cleanly separated. This separation is foundational and actively enforced in code.

============================================================
HIGH-LEVEL ARCHITECTURE

The system has three conceptual layers:

STRUCTURAL DUNGEON GENERATION (BSP)
Entry: generateBspDungeon() in mazeGen.ts

Responsibilities:

BSP partitioning of the grid
Room carving
Corridor carving
Wall preservation (optional outer wall retention)
Distance-to-wall calculation
Region (room) identification

This layer is pure geometry and has no gameplay knowledge.

---

CONTENT GENERATION (Milestones 1–2 + Milestone 3 wiring)
Entry: generateDungeonContent() in mazeGen.ts

Responsibilities:

Place gameplay content on top of BSP geometry
Encode progression, gating, and optional content
Guarantee solvability by construction (incrementally)
Remain deterministic from seed/options

This layer expresses gameplay intent but does not execute puzzle logic.

---

RUNTIME / PUZZLE LOGIC (Milestone 3)

Core files:

dungeonState.ts
evaluateCircuits.ts
walkability.ts (shared rules)
App.tsx (debug / preview harness)

Responsibilities:

Hold mutable gameplay state (doors, levers, plates, blocks, hazards, secrets, circuits)
Derive sensor state (plates) from world occupancy (blocks now, player later)
Evaluate circuits based on runtime state
Apply effects (open doors, toggle hazards, reveal passages)
Drive interactive puzzle simulation (debug harness first, player later)

============================================================
STRUCTURAL MASKS (BSP OUTPUT)

All masks are Uint8Array with size width * height, indexed as:
index = y * width + x

Mask: solid
255 = wall
0 = floor

Mask: regionId
0 = not a room (corridors, carved pockets, etc.)
1..255 = room id

Mask: distanceToWall
Manhattan distance to nearest wall
0 means wall tile

Structural metadata:

meta.rooms : Rect[]
meta.corridors : { a, b, bends? }[]
meta.bspDepth : number
meta.seedUsed : number

IMPORTANT POLICY (DECIDED — OPTION A)

Some puzzle patterns may carve additional geometry by mutating dungeon.masks.solid.
When this happens, distanceToWall becomes stale.

Chosen solution (Option A):

distanceToWall is recomputed after all puzzle patterns that may carve geometry

Content placement that relies on distanceToWall must occur before patterns,
or after recomputation

This policy is implemented in generator wiring via:

* runPatternsBestEffort() returning didCarve aggregate
* recomputeDungeonDistanceToWall(dungeon) when didCarve == true

============================================================
CONTENT MASKS (GAMEPLAY LAYERS)

Mask: featureType (Uint8)

0 = none
1 = monster spawn
2 = loot chest
3 = secret door (legacy wall-based)
4 = door
5 = key
6 = lever
7 = pressure plate (Milestone 3)
8 = push block (Milestone 3)
9 = hidden passage (Milestone 3)
10 = hazard (Milestone 3)

Mask: featureId (Uint8)

Instance / circuit identifier (1..255)

All tiles sharing a featureId belong to the same logical entity or circuit

IMPORTANT INVARIANTS:

featureType 9 (hidden passage) MUST have non-zero featureId
meta.secrets[] is the authoritative source for hidden passages

============================================================
CONTENT METADATA (AUTHORITATIVE)

Metadata is the authoritative source of gameplay intent.
Masks are for rendering and inspection only.

Key fields:

meta.seedUsed
meta.roomGraph
meta.roomDistance
meta.entranceRoomId
meta.farthestRoomId
meta.mainPathRoomIds

Placement records:

meta.monsters
meta.chests
meta.secrets
meta.doors
meta.keys
meta.levers

Milestone 3 additions:

meta.plates
meta.blocks
meta.hazards

Circuits:

meta.circuits : {
id,
logic,
behavior,
triggers,
targets
}[]

Pattern diagnostics:

meta.patternDiagnostics : PatternDiagnostics[]

============================================================
PUZZLE PATTERNS (MILESTONE 3)

Puzzle patterns are generation-time content macros.

Module: puzzlePatterns.ts
Shared helpers: doorSites.ts

Key properties:

Patterns are best-effort; failure never aborts generation
Patterns may mutate geometry (explicitly reported)

Each pattern returns PatternResult {
ok,
didCarve,
reason?,
stats?,
reachability?
}

runPatternsBestEffort(patterns) executes patterns (legacy fn or named entry),
aggregates didCarve, and produces PatternDiagnostics[].

Implemented patterns (current repo state):

1. Lever reveals hidden pocket (carving + validated)

* Carves a pocket behind a connector tile
* Places featureType=9 (hidden passage) on connector tile (connector is FLOOR but blocked until revealed)
* Places a lever in reachable space
* Wires circuit: LEVER -> HIDDEN(REVEAL), PERSISTENT
* Includes reachability diagnostics (pre/post reveal + shortest path distance post)

2. Lever opens door (non-carving, “easy win”)

* Places a door at a corridor door-site
* Places a lever in one adjacent room
* Wires circuit: LEVER -> DOOR(TOGGLE), TOGGLE behavior

3. Plate opens door (non-carving, “easy win”)

* Places a door at a corridor door-site
* Places a plate in one adjacent room + a block adjacent to plate
* Wires circuit: PLATE -> DOOR(OPEN), MOMENTARY behavior

NOTE ON NAMING (CURRENT LIMITATION)

If mazeGen passes anonymous functions to runPatternsBestEffort(), diagnostics
may show name="pattern" (fallback). This makes batch aggregation unable to
separate results per-pattern without additional naming.

============================================================
REACHABILITY DIAGNOSTICS (IMPLEMENTED)

Hidden-pocket pattern computes explicit reachability diagnostics:

ReachabilityStats includes:

start / connector / pocketCenter / goal coordinates
reachablePre: goal reachable before reveal
reachablePost: goal reachable after reveal
shortestPathPost: scalar BFS distance post-reveal (or null)

A dedicated BFS helper computes shortest-path distance using shared walkability rules.

Reachability stats are attached to PatternResult (and thus PatternDiagnostics) on:

* success
* pre-reveal reachable failures
* post-reveal unreachable failures

This enables distinguishing:

* isolation failures (pocket already connected pre-reveal)
* connectivity failures (still unreachable post-reveal)
* “works but too trivial” / too-short paths (future tuning)

============================================================
BATCH VALIDATION HARNESS (IMPLEMENTED + VERIFIED)

Goal: quantify pattern reliability and diagnose failure modes across seeds.

Implemented:

App.tsx Batch Runner panel
Sequential seed runs (seedPrefix + index)
Collection of structural stats and patternDiagnostics
JSON export and in-app summary table

Utility module: src/batchStats.ts (framework-agnostic)

RECENT FIX (COMPLETED)

A structural mismatch prevented batch aggregation from seeing reachability data.

Resolution:

batchStats.ts updated to match diagnostics shape:

* reachability is read from PatternDiagnostics.reachability (top-level)
* door-site stats read from stats.doorSites
* reachability counters explicitly initialized to avoid NaN

Result:

Batch summaries can now correctly report:

* pre-reveal reachable rate
* post-reveal unreachable rate
* average shortest-path length post-reveal

============================================================
LATEST MEASUREMENTS (BATCH RUN)

Most recent user-reported batch JSON (300 runs):

* ok: 235 / 300 (78%)

* fail: 65 / 300 (22%)

* top failure reason:
  "Pocket goal already reachable pre-reveal (preview)." (65)

* reachabilityPreReachableRate: 0.22

* reachabilityPostUnreachableRate: 0.00

* shortestPathPostAvg: ~77 tiles

Interpretation:

The pattern reliably produces a reachable pocket after reveal (post-unreachable 0%),
but ~22% of attempts are rejected because the pocket goal is already reachable
pre-reveal. This suggests “thin wall / accidental connectivity” or “connector
choice already on a path that leaks into the pocket region,” and indicates the
pattern currently does not sufficiently search alternate candidates.

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Status: FUNCTIONALLY COMPLETE, DIAGNOSTICALLY MEASURABLE

* Geometry mutation ordering bugs fixed (Option A distance field recompute)
* Corridor-based door-site definition unified and instrumented
* Reachability diagnostics implemented for carving patterns
* Batch harness correctly aggregates structural, door-site, and reachability data

The system now answers “why did this pattern fail?” quantitatively.

============================================================
NEXT WORK (IMMEDIATE)

1. Make batch results distinguish patterns (naming)

Problem:
Batch summaries can collapse patterns into a single bucket (“pattern”) when
anonymous functions are used.

Patch plan:

* In mazeGen.ts, build patterns as named PatternEntry objects:
  patterns.push({ name: "leverHiddenPocket", run: () => applyLeverRevealsHiddenPocketPattern(...) })
  patterns.push({ name: "leverOpensDoor", run: () => applyLeverOpensDoorPattern(...) })
  patterns.push({ name: "plateOpensDoor", run: () => applyPlateOpensDoorPattern(...) })
* Ensure batchStats groups by diagnostics.name and surfaces per-pattern reachability.

Goal:
Per-pattern success/failure rates in one batch run without ambiguity.

---

2. Tuning loop v1 for hidden-pocket pattern (reduce pre-reveal reachable failures)

Observed issue:
~22% of runs fail because pocket goal is already reachable pre-reveal.

Likely root cause:
Hidden-pocket pattern currently picks a single candidate connector/pocket after
scanning, and does not retry alternate candidates when pre-reveal reachability fails.

Patch plan:

* Add an attempt budget to LeverHiddenPocketPatternOptions:
  options.maxAttempts (default e.g. 60)
* Instead of picking one random candidate:

  * shuffle candidate list deterministically via rng
  * iterate up to maxAttempts candidates
  * for each candidate:

    * preview carve + fixture placement
    * compute reachabilityPre / reachabilityPost
    * accept first candidate that satisfies:
      reachablePre == false AND reachablePost == true
  * if all attempts fail, return best diagnostic (or last diagnostic) with reason

Candidate-quality bias plan (to further reduce reachablePre):

* Prefer connector candidates with thicker surrounding walls:

  * increase pocketSolidnessScore threshold (or add a “ring score”)
* Bias pocket placement farther from corridor thresholds / room boundaries:

  * reject pocket centers too close to any regionId != 0
* Prefer connector tiles derived from corridor door-site statistics:

  * reuse doorSites trimming (ignore first/last N tiles of corridor paths)
  * ensure minDistToWall >= 1 (or 2) on connector-adjacent walkable

Goal:
Raise hidden-pocket ok rate above 90% without aborting generation.

---

3. Optional: Expand diagnostics surfaced in UI (non-blocking)

Patch plan:

* Add reachability columns to the in-app batch table:

  * preReachableRate
  * postUnreachableRate
  * shortestPathPostAvg
* Add expandable per-run “why failed” view (top reason + example coordinates)

Goal:
Data-driven iteration without leaving the debug app.

============================================================
MENTAL MODEL SUMMARY

BSP creates space
Content generation expresses intent
Patterns add structured puzzles
Runtime executes logic
Geometry mutation is explicit and repaired
Diagnostics quantify reliability
Batch harness turns design intuition into measurable data

---
