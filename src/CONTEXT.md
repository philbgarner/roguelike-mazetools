[============================================================
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
Encodes what exists at a tile.

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

Mask: featureParam (Uint8)

Subtype or behavior flags (pattern-specific / debug-specific)

Mask: danger (Uint8)
Mask: lootTier (Uint8)

Mask: hazardType (Uint8)
0 = none
1 = lava
2 = poison gas
3 = water
4 = spikes

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
RUNTIME STATE MODEL (MILESTONE 3)

DungeonRuntimeState is mutable and independent from generation.

Runtime buckets:

doors[id] : { kind, isOpen, forcedOpen? }
keys[id] : { collected }
levers[id] : { toggled }
plates[id] : { pressed } (DERIVED)
blocks[id] : { x, y, weightClass }
hazards[id] : { hazardType, enabled }
secrets[id] : { revealed }

circuits[id]: { active, lastSatisfied, lastSatisfiedCount }

Initialization flow:

initDungeonRuntimeState()
derivePlatesFromBlocks()
evaluateCircuits()

============================================================
WALKABILITY RULES (CENTRALIZED)

Implemented in src/walkability.ts and reused by:

runtime movement / pushing
generation-time validation in patterns

Rules:

Walls: never walkable

Doors: walkable only if open

Hidden passages:
unrevealed → blocked
revealed → walkable

Hazards: do not block movement (consequence-only, for now)

============================================================
CIRCUIT EVALUATION

evaluateCircuits(state, meta.circuits) is pure.

Flow:

Determine trigger satisfaction (KEY / LEVER / PLATE)
Apply logic (OR / AND / THRESHOLD)
Apply behavior (MOMENTARY / TOGGLE / PERSISTENT)
Apply targets (DOOR / HAZARD / HIDDEN)

============================================================
PUZZLE PATTERNS (MILESTONE 3)

Puzzle patterns are generation-time content macros.

Module: puzzlePatterns.ts
Shared helpers: doorSites.ts

Key properties:

Patterns are best-effort; failure never aborts generation
Patterns may mutate geometry (explicitly reported)

Each pattern returns PatternResult { ok, didCarve, stats? }

runPatternsBestEffort() aggregates diagnostics

Implemented patterns:

Lever reveals hidden pocket (carving + validated)
Lever opens door (non-carving)
Plate opens door (non-carving)

IMPORTANT FIX (COMPLETED)

Door sites are defined per corridor, not per tile

All door placement (patterns + budgeting) iterates dungeon.meta.corridors

Each corridor is mapped to (roomA, roomB) via nearest-room lookup

A door tile is selected along the corridor path

Placement prefers corridor tiles (regionId==0) but may fall back to floor

First and last N tiles of each corridor path are trimmed to avoid room thresholds

Shared logic lives in src/doorSites.ts and is reused everywhere

============================================================
NEW: DOOR-SITE DIAGNOSTICS (IMPLEMENTED)

Door-site selection is now instrumented with detailed statistics.

New API in src/doorSites.ts:

findDoorSiteCandidatesAndStatsFromCorridors()

Collected stats include:

Total corridors evaluated
Corridors with valid room pairs
Corridors rejected (no rooms / same room)
Points considered along corridor paths
Points rejected by wall / occupancy / distance-to-wall filters
Corridors with any valid candidate
Corridors yielding a final tile
Unique tiles produced
Prefer-corridor hit counts

These stats are:

Attached to pattern diagnostics (Lever→Door, Plate→Door)
Aggregated per pattern in batch runs
Used to distinguish structural scarcity from over-filtering/trimming

============================================================
NEW: BATCH VALIDATION HARNESS (IMPLEMENTED)

Goal: verify pattern success rates across many seeds and quantify failure modes.

Implemented:

App.tsx includes a “Batch Runner” panel in the debug UI

Runs N generations across sequential seeds (seedPrefix + index)

Collects per-run structural counts (rooms/corridors) and meta.patternDiagnostics

Aggregates results into a readable summary table in-app

Supports Copy JSON / exporting aggregated summaries

New utility module: src/batchStats.ts

Framework-agnostic aggregator (no React)

Outputs:

Per-pattern summaries (runs, success rate, carved rate, avg ms)
Top failure reasons
Average door-site statistics per pattern
Overall averages (roomsAvg, corridorsAvg)

This establishes a quantitative baseline for tuning patterns.

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Status: FUNCTIONALLY COMPLETE AND DIAGNOSTICALLY INSTRUMENTED

Geometry mutation ordering bugs fixed

Corridor-based door-site definition implemented and unified

Door-site selection is fully instrumented and measurable

Pattern diagnostics reflect real structural and filtering constraints

Runtime circuits, triggers, and targets behave deterministically

Batch validation harness quantifies reliability across seeds

Initial batch results show dominant failure modes are logical (reachability),
not structural scarcity.

============================================================
NEXT WORK (PLANNED)

Immediate (diagnostic depth & tuning):

Augment hidden-pocket pattern failures with reachability stats:

Record start / connector / goal coordinates
Record whether goal is reachable pre-reveal
Optionally record shortest-path length (scalar only)

Attach reachability stats to PatternResult diagnostics
Aggregate reachability failure rates in batch summaries

This answers:
“Are hidden pockets failing because they are not actually isolated?”

Pattern tuning (best-effort, non-aborting):

When pocket goal is reachable pre-reveal:

Try alternate connector tiles before failing
Bias pocket depth farther from connector
Reject pockets too close to existing corridors
Optionally downgrade to non-carving / cosmetic secret variant

Door-site tuning (now measurable):

Use door-site stats to tune trimming strategy:

Compare fixed trimEnds vs dynamic trimming
(dynamic: skip until regionId==0, then small buffer)

Use batch runner to A/B success rates and candidate collapse

Short-term (gameplay depth):

Add optional reachability validation for non-carving patterns
(best-effort, never abort)

Add additional non-carving patterns:

Hazard gates
Multi-trigger doors
Timed / resettable circuits

Medium-term (player integration):

Integrate player movement into runtime state
Allow player-triggered plates (in addition to blocks)
Add runtime hazard consequences (damage, status effects)
Expand circuit logic (thresholds, multi-target behaviors)

============================================================
MENTAL MODEL SUMMARY

BSP creates space

Content generation expresses intent

Patterns add structured puzzles

Runtime executes logic

Geometry mutation is explicit and repaired

Diagnostics quantify reliability and guide tuning

Batch harness turns design intuition into measurable data
](Note: the system is warning that **some older previously-uploaded files have expired**. That’s fine here because your CONTEXT text is in this chat, and the changes we’re recording are exactly the ones we just implemented (ReachabilityStats + shortest-path scalar + batch aggregation wiring).

Below is an updated **CONTEXT.md** (raw markdown style, no `#` headers) reflecting what changed and what’s next.

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
Encodes what exists at a tile.

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

Mask: featureParam (Uint8)

Subtype or behavior flags (pattern-specific / debug-specific)

Mask: danger (Uint8)
Mask: lootTier (Uint8)

Mask: hazardType (Uint8)
0 = none
1 = lava
2 = poison gas
3 = water
4 = spikes

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
RUNTIME STATE MODEL (MILESTONE 3)

DungeonRuntimeState is mutable and independent from generation.

Runtime buckets:

doors[id] : { kind, isOpen, forcedOpen? }
keys[id] : { collected }
levers[id] : { toggled }
plates[id] : { pressed } (DERIVED)
blocks[id] : { x, y, weightClass }
hazards[id] : { hazardType, enabled }
secrets[id] : { revealed }

circuits[id]: { active, lastSatisfied, lastSatisfiedCount }

Initialization flow:

initDungeonRuntimeState()
derivePlatesFromBlocks()
evaluateCircuits()

============================================================
WALKABILITY RULES (CENTRALIZED)

Implemented in src/walkability.ts and reused by:

runtime movement / pushing
generation-time validation in patterns

Rules:

Walls: never walkable

Doors: walkable only if open

Hidden passages:
unrevealed → blocked
revealed → walkable

Hazards: do not block movement (consequence-only, for now)

============================================================
CIRCUIT EVALUATION

evaluateCircuits(state, meta.circuits) is pure.

Flow:

Determine trigger satisfaction (KEY / LEVER / PLATE)
Apply logic (OR / AND / THRESHOLD)
Apply behavior (MOMENTARY / TOGGLE / PERSISTENT)
Apply targets (DOOR / HAZARD / HIDDEN)

============================================================
PUZZLE PATTERNS (MILESTONE 3)

Puzzle patterns are generation-time content macros.

Module: puzzlePatterns.ts
Shared helpers: doorSites.ts

Key properties:

Patterns are best-effort; failure never aborts generation
Patterns may mutate geometry (explicitly reported)

Each pattern returns PatternResult { ok, didCarve, reason?, stats?, reachability? }

runPatternsBestEffort() aggregates diagnostics

Implemented patterns:

Lever reveals hidden pocket (carving + validated)
Lever opens door (non-carving)
Plate opens door (non-carving)

IMPORTANT FIX (COMPLETED)

Door sites are defined per corridor, not per tile

All door placement (patterns + budgeting) iterates dungeon.meta.corridors

Each corridor is mapped to (roomA, roomB) via nearest-room lookup

A door tile is selected along the corridor path

Placement prefers corridor tiles (regionId==0) but may fall back to floor

First and last N tiles of each corridor path are trimmed to avoid room thresholds

Shared logic lives in src/doorSites.ts and is reused everywhere

============================================================
NEW: DOOR-SITE DIAGNOSTICS (IMPLEMENTED)

Door-site selection is now instrumented with detailed statistics.

New API in src/doorSites.ts:

findDoorSiteCandidatesAndStatsFromCorridors()

Collected stats include:

Total corridors evaluated
Corridors with valid room pairs
Corridors rejected (no rooms / same room)
Points considered along corridor paths
Points rejected by wall / occupancy / distance-to-wall filters
Corridors with any valid candidate
Corridors yielding a final tile
Unique tiles produced
Prefer-corridor hit counts

These stats are:

Attached to pattern diagnostics (Lever→Door, Plate→Door)
Aggregated per pattern in batch runs
Used to distinguish structural scarcity from over-filtering/trimming

============================================================
NEW: BATCH VALIDATION HARNESS (IMPLEMENTED)

Goal: verify pattern success rates across many seeds and quantify failure modes.

Implemented:

App.tsx includes a “Batch Runner” panel in the debug UI

Runs N generations across sequential seeds (seedPrefix + index)

Collects per-run structural counts (rooms/corridors) and meta.patternDiagnostics

Aggregates results into a readable summary table in-app

Supports Copy JSON / exporting aggregated summaries

New utility module: src/batchStats.ts

Framework-agnostic aggregator (no React)

Outputs:

Per-pattern summaries (runs, success rate, carved rate, avg ms)
Top failure reasons
Average door-site statistics per pattern
Overall averages (roomsAvg, corridorsAvg)

============================================================
NEW: REACHABILITY DIAGNOSTICS (IN PROGRESS / PARTIALLY IMPLEMENTED)

Goal: quantify why the hidden-pocket pattern fails (isolation vs connectivity).

Implemented in src/puzzlePatterns.ts:

ReachabilityStats payload:

start / connector / pocketCenter / goal coordinates
reachablePre (bool): goal reachable before reveal
reachablePost (bool): goal reachable after reveal
shortestPathPost (number|null): scalar shortest-path length post-reveal

Hidden-pocket pattern now computes these values during preview validation and (once the merge is cleaned up) returns reachability stats on:

* pre-reveal reachable failures
* post-reveal unreachable failures
* success

A helper BFS scalar path function was added:

computeShortestPathDistance(...)

runPatternsBestEffort() now forwards reachability into PatternDiagnostics as `reachability`.

Status note:
During implementation, puzzlePatterns.ts had a merge/copy-paste corruption in the reachability validation block and a duplicated PatternResult union.
Those are being corrected so reachability is always in-scope and the file compiles cleanly.

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Status: FUNCTIONALLY COMPLETE AND DIAGNOSTICALLY INSTRUMENTED

Geometry mutation ordering bugs fixed

Corridor-based door-site definition implemented and unified

Door-site selection is fully instrumented and measurable

Pattern diagnostics reflect real structural and filtering constraints

Runtime circuits, triggers, and targets behave deterministically

Batch validation harness quantifies reliability across seeds

============================================================
NEXT WORK (IMMEDIATE)

1. Finish Reachability Diagnostics end-to-end (Step 1 completion)

* Ensure src/puzzlePatterns.ts compiles cleanly:

  * PatternResult is a single union that includes optional reachability
  * Replace the corrupted hidden-pocket reachability validation block with the clean version
  * Ensure `reachability` is defined in-scope for the success return

* Wire aggregation in src/batchStats.ts:

  * Count failures where reachablePre=true
  * Count failures where reachablePost=false
  * Compute rates over runs that reported reachability
  * Compute shortestPathPostAvg over runs where it exists

* Verify via Batch Runner:

  * Copy JSON output should include reachability summary keys for the hidden-pocket pattern
  * Validate that “pre-reveal reachable” rate answers:
    “Are hidden pockets failing because they are not actually isolated?”

2. (After Step 1 is verified) Tuning loop v1

* When pocket goal is reachable pre-reveal:

  * Try alternate connector candidates (bounded attempts) before failing
  * Bias pocket depth farther from connector (optional)
  * Optionally reject pockets too close to existing carved corridors (later)

3. Optional UI enhancement (not required)

* Add columns or expandable per-pattern fields in the in-app batch summary view
  (but JSON export is sufficient for v1)

============================================================
MENTAL MODEL SUMMARY

BSP creates space

Content generation expresses intent

Patterns add structured puzzles

Runtime executes logic

Geometry mutation is explicit and repaired

Diagnostics quantify reliability and guide tuning

Batch harness turns design intuition into measurable data
)
