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

CONTENT GENERATION (Milestones 1–2 + Milestone 3 wiring)
Entry: generateDungeonContent() in mazeGen.ts

Responsibilities:

Place gameplay content on top of BSP geometry
Encode progression, gating, and optional content
Guarantee solvability by construction (incrementally)
Remain deterministic from seed/options

This layer expresses gameplay intent but does not execute puzzle logic.

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

This policy is fully implemented in generator wiring.

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

Implemented patterns:

Lever reveals hidden pocket (carving + validated)
Lever opens door (non-carving)
Plate opens door (non-carving)

============================================================
REACHABILITY DIAGNOSTICS (IMPLEMENTED)

Hidden-pocket pattern computes explicit reachability diagnostics:

ReachabilityStats includes:

start / connector / pocketCenter / goal coordinates
reachablePre: goal reachable before reveal
reachablePost: goal reachable after reveal
shortestPathPost: scalar BFS distance post-reveal (or null)

A dedicated BFS helper computes shortest-path distance using shared walkability rules.

Reachability stats are attached to PatternResult on:

success
pre-reveal reachable failures
post-reveal unreachable failures

This allows distinguishing isolation failures from connectivity failures.

============================================================
BATCH VALIDATION HARNESS (IMPLEMENTED + FIXED)

Goal: quantify pattern reliability and diagnose failure modes across seeds.

Implemented:

App.tsx Batch Runner panel
Sequential seed runs (seedPrefix + index)
Collection of structural stats and patternDiagnostics
JSON export and in-app summary table

Utility module: src/batchStats.ts (framework-agnostic)

RECENT FIX (THIS SESSION):

A structural mismatch prevented batch aggregation from seeing reachability data.

Resolution:

batchStats.ts was updated to match the real diagnostics shape:

* reachability is read from PatternDiagnostics.reachability (top-level)
* door-site stats are read from stats.doorSites
* reachability counters are explicitly initialized to avoid NaN

Result:

Batch summaries can now correctly report:

* pre-reveal reachable rate
* post-reveal unreachable rate
* average shortest-path length post-reveal

This unblocks data-driven tuning.

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Status: FUNCTIONALLY COMPLETE, DIAGNOSTICALLY MEASURABLE

Geometry mutation ordering bugs fixed
Corridor-based door-site definition unified
Door-site selection fully instrumented
Reachability diagnostics implemented for carving patterns
Batch harness correctly aggregates structural, door-site, and reachability data

The system now answers “why did this pattern fail?” quantitatively.

============================================================
NEXT WORK (IMMEDIATE)

1. Verify reachability metrics via Batch Runner

* Run batch validation
* Confirm hidden-pocket pattern reports:

  * % reachablePre
  * % unreachablePost
  * avg shortestPathPost
* Use JSON export as the primary verification artifact

2. Tuning loop v1 for hidden-pocket pattern

When reachablePre === true:

* Try alternate connector candidates (bounded attempts)
* Bias pocket placement farther from corridors or room thresholds

When reachablePost === false:

* Try alternate connector orientation or tile
* Reject shallow pockets near thin walls

Goal: improve success rate without aborting generation.

3. Optional UI polish (non-blocking)

* Add reachability columns to the in-app batch table
* Or add expandable per-pattern diagnostic details

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
