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

walkability.ts

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

0 = not a room

1..255 = room id

Mask: distanceToWall

Manhattan distance to nearest wall

0 means wall tile

Structural metadata:

meta.rooms : Rect[]

meta.corridors : { a, b }[]

meta.bspDepth : number

meta.seedUsed : number

IMPORTANT POLICY (DECIDED — OPTION A):

Some puzzle patterns may carve additional geometry by mutating dungeon.masks.solid.
When this happens, distanceToWall becomes stale.

Chosen solution (Option A):

distanceToWall is recomputed after all puzzle patterns that may carve geometry

Content placement that relies on distanceToWall must occur before patterns, or after recomputation

This policy is fully implemented in generator wiring.

============================================================
CONTENT MASKS (GAMEPLAY LAYERS)

Mask: featureType (Uint8)

0 = none

1 = monster spawn

2 = loot chest

3 = secret door (legacy)

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

meta.monsters[]

meta.chests[]

meta.secrets[]

meta.doors[]

meta.keys[]

meta.levers[]

Milestone 3 additions:

meta.plates[]

meta.blocks[]

meta.hazards[]

Circuits:
meta.circuits[] = {
id,
logic: OR | AND | THRESHOLD,
behavior: MOMENTARY | TOGGLE | PERSISTENT,
triggers[],
targets[],
}

NEW (Milestone 3 tooling):

meta.patternDiagnostics[]
Per-pattern execution diagnostics returned by the pattern runner:

name

ok

didCarve

reason (on failure)

ms (execution time)

============================================================
RUNTIME STATE MODEL (MILESTONE 3)

DungeonRuntimeState is mutable and independent from generation.

Runtime buckets:

doors[id]

keys[id]

levers[id]

plates[id] (DERIVED)

blocks[id] (AUTHORITATIVE)

hazards[id]

secrets[id]

circuits[id]

Initialization flow:

initDungeonRuntimeState(contentMeta)

derivePlatesFromBlocks()

evaluateCircuits()

DERIVED PLATES:

Plate.pressed is computed from block occupancy

Plates cannot be toggled directly

Legacy plate click-toggling has been removed

============================================================
WALKABILITY RULES (CENTRALIZED)

Walkability is centralized in src/walkability.ts and shared by:

runtime pushing / movement checks

generation-time reachability validation in puzzle patterns

Rules:

Walls: never walkable

Doors: walkable only if open

Hidden passages:

unrevealed → blocked

revealed → walkable

Hazards: do not block movement (consequence-only)

============================================================
CIRCUIT EVALUATION (CORE LOGIC)

evaluateCircuits(currentState, meta.circuits) is a pure function.

Steps:

Determine trigger satisfaction (KEY, LEVER, PLATE)

Apply logic (OR / AND / THRESHOLD)

Apply behavior (MOMENTARY / PERSISTENT / TOGGLE)

Apply targets (DOOR, HAZARD, HIDDEN)

Outputs:

next DungeonRuntimeState

per-circuit debug info (used by UI)

============================================================
PUZZLE PATTERNS (MILESTONE 3 CONTENT MACROS)

Puzzle patterns are generation-time content macros.

Module:
puzzlePatterns.ts

Key properties:

Patterns are best-effort: failure never aborts generation

Patterns may mutate geometry

Geometry mutations are explicitly reported (didCarve)

Patterns validate on preview copies before committing

Pattern runner:

runPatternsBestEffort(patterns)

Executes patterns sequentially

Logs failures

Aggregates didCarve

Returns per-pattern diagnostics:
{ name, ok, didCarve, reason, ms }

Implemented patterns:

Carving:

Lever reveals hidden pocket (validated + wired)

Carves isolated pocket

Connector tile is FLOOR but blocked by hidden passage

Lever placed in reachable space

Circuit: LEVER → HIDDEN(REVEAL), PERSISTENT

Non-carving (easy wins, now wired):

Lever opens door (TOGGLE)

Places a door on an existing corridor

Places a lever in a reachable room

Circuit: LEVER → DOOR(TOGGLE)

Plate opens door (MOMENTARY)

Places a door on an existing corridor

Places a plate + adjacent push-block

Circuit: PLATE → DOOR(OPEN)

Pattern execution model:

Patterns can be executed N times (best-effort)

Each pattern has an internal attempt budget (patternMaxAttempts)

All results are captured in diagnostics

============================================================
GENERATOR WIRING (CURRENT STATE)

generateDungeonContent():

Structural dungeon already generated

Content metadata initialized

Puzzle patterns collected based on options

Patterns executed via runPatternsBestEffort()

If any pattern carved geometry:

distanceToWall is recomputed (Option A)

patternDiagnostics stored in meta.patternDiagnostics

============================================================
DEBUG / PREVIEW UI (App.tsx)

The React app is a first-class debug harness.

Features:

Layered visualization of all masks

Composite content overlay with runtime-aware coloring

Hidden passage reveal always reflects runtime

Hazard enabled/disabled state visible

Hover tooltips with tile + runtime info

Interactions:

Key → collect

Lever → toggle

Block → select + push (WASD / arrows)

Plates → read-only (derived)

Door → manual toggle (debug-only)

NEW UI FEATURES:

Pattern enable toggles

Pattern count (N times) controls

Pattern maxAttempts control

Pattern diagnostics panel

Stats summary of:

patterns run

patterns ok / failed

patterns that carved geometry

total pattern execution time (ms)

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution
Status: COMPLETE & STABILIZED

Recently completed:

Option A distance-to-wall recomputation fully wired

Pattern runner diagnostics end-to-end (generator → meta → UI)

N-times execution model for non-carving patterns

Easy-win patterns fully wired and configurable

Diagnostics summary in Stats panel

Plates fully derived (no legacy toggling)

Walkability centralized and used consistently

============================================================
NEXT WORK (PLANNED)

Near-term (content breadth):

OR-logic puzzles (multiple levers OR opens hidden/door)

THRESHOLD puzzles (multiple plates required)

Multi-target circuits (one trigger affecting several targets)

Milestone 4 — Solvability by Construction:

Generation-time state-space reachability checks

Required-progression verification

Block-aware flood-fill (push mechanics)

“Can the player get stuck?” analysis

Later:

Player movement integration

Player-on-plate derivation

Hazard consequences (damage, status)

Expanded block mechanics (multiple blocks, weight classes)

More pattern families (loops, detours, optional rewards)

============================================================
MENTAL MODEL SUMMARY

BSP decides where you can walk

Content decides why you care

featureId + circuits define logical wiring

Runtime state executes puzzle logic

Plates are sensors, not switches

Hidden passages are tiles that come into existence

Hazards are consequences, not walls

evaluateCircuits is the only place logic happens

Puzzle patterns are validated content macros

This document is intended to allow fast onboarding in a new chat or IDE session without rereading the codebase.
