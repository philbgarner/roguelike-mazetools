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
Encodes what exists at a tile.
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
Instance / circuit identifier (1..255).
All tiles sharing a featureId belong to the same logical entity or circuit.

IMPORTANT INVARIANTS:

featureType 9 (hidden passage) MUST have non-zero featureId

meta.secrets[] is the authoritative source for hidden passages

Mask: featureParam (Uint8)
Subtype or behavior flags (pattern-specific / debug-specific).

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

meta.seedUsed : number

meta.roomGraph : Map<roomId, Set<roomId>>

meta.roomDistance : Map<roomId, distance>

meta.entranceRoomId : number

meta.farthestRoomId : number

meta.mainPathRoomIds : number[]

meta.monsters : { id, x, y, roomId, danger }[]

meta.chests : { id, x, y, roomId, tier }[]

meta.secrets : { id, x, y, roomId }[]

meta.doors : { id, x, y, roomA, roomB, kind, depth }[]

meta.keys : { id, x, y, roomId }[]

meta.levers : { id, x, y, roomId }[]

Milestone 3 additions:

meta.plates : { id, x, y, roomId, activatedByBlock, inverted, ... }[]

meta.blocks : { id, x, y, roomId, weightClass }[]

meta.hazards : { id, x, y, roomId, hazardType, activeInitial }[]

Circuits:
meta.circuits : {
id: number,
logic: { type: "OR" | "AND" | "THRESHOLD", threshold?: number },
behavior: { mode: "TOGGLE" | "MOMENTARY" | "PERSISTENT" },
triggers: { kind, refId }[],
targets: { kind, refId, effect }[],
}[]

============================================================
RUNTIME STATE MODEL (MILESTONE 3)

DungeonRuntimeState is mutable and independent from generation.

Runtime buckets:

doors[id] : { kind, isOpen, forcedOpen? }

keys[id] : { collected }

levers[id] : { toggled }

plates[id] : { pressed } (DERIVED)

blocks[id] : { x, y, weightClass } (AUTHORITATIVE)

hazards[id] : { hazardType, enabled }

secrets[id] : { revealed }

circuits[id]: { active, lastSatisfied, lastSatisfiedCount }

Initialization flow:

initDungeonRuntimeState(contentMeta)

derivePlatesFromBlocks()

evaluateCircuits()

DERIVED PLATES:

Plate.pressed is computed from block occupancy

Plates cannot be toggled directly

Legacy plate click-toggling has been removed

WALKABILITY RULES (CENTRALIZED):

Walkability is now centralized in src/walkability.ts and shared by:

runtime pushing / movement checks (dungeonState.ts)

generation-time reachability validation in patterns (where applicable)

Rules:

Walls: never walkable

Doors: walkable only if open

Hidden passages (featureType 9):

unrevealed -> blocked

revealed -> walkable

Hazards: do not block movement (consequence-only later)

============================================================
CIRCUIT EVALUATION (CORE LOGIC)

evaluateCircuits(currentState, meta.circuits) is a pure function.

Evaluation steps:

Determine trigger satisfaction:

KEY -> collected

LEVER -> toggled

PLATE -> pressed (derived)

Apply logic: OR / AND / THRESHOLD

Apply behavior: MOMENTARY / PERSISTENT / TOGGLE (edge-based)

Apply targets:

DOOR -> open/close/toggle

HAZARD -> enable/disable/toggle

HIDDEN -> reveal/hide/toggle

Outputs:

next DungeonRuntimeState

per-circuit debug info for UI inspection

============================================================
PUZZLE PATTERNS (MILESTONE 3 CONTENT MACROS)

Puzzle patterns are generation-time content macros.

Module:

puzzlePatterns.ts

Key properties:

Patterns are best-effort: failure never aborts generation

Patterns may mutate geometry by carving dungeon.masks.solid

Each pattern returns a PatternResult { ok, didCarve }

Geometry mutations are reported explicitly via didCarve

Pattern runner:

runPatternsBestEffort(patterns)

Executes patterns sequentially

Logs failures

Aggregates didCarve across all patterns

NEW: returns per-pattern diagnostics (name, ok, didCarve, reason, ms)

Implemented pattern (carving + validated):

Lever reveals hidden pocket (Variant A)

Carves a small isolated pocket

Connector tile is FLOOR but blocked by featureType=9 hidden passage

Places a lever in reachable space

Emits circuit: LEVER -> HIDDEN(REVEAL), PERSISTENT

Performs preview validation on copies before committing:

Pocket unreachable before reveal

Pocket reachable after reveal

Commits carving only if validation passes

Implemented patterns (non-carving, not yet wired into generator UI/options):

Lever opens door (easy win)

Places a door (featureType=4) on an existing corridor connector tile

Places a lever in a nearby room

Circuit: LEVER -> DOOR(TOGGLE), TOGGLE

Plate opens door (easy win)

Places a door on an existing corridor connector tile

Places a plate in a room plus an adjacent push-block

Circuit: PLATE -> DOOR(OPEN), MOMENTARY

Plate pressed state is derived from block occupancy at runtime

============================================================
GENERATOR WIRING (CURRENT STATE)

generateDungeonContent(dungeon, options):

Structural dungeon already generated

Content metadata arrays initialized

Puzzle patterns collected based on options

runPatternsBestEffort() executes patterns

If any pattern reports didCarve:

recomputeDungeonDistanceToWall(dungeon) is called (Option A)

Current wiring status:

Lever hidden pocket (Variant A) is wired and executed via generator options.

Pattern runner diagnostics exist, but are not yet plumbed into meta for UI display.

Non-carving patterns (lever opens door / plate opens door) exist in puzzlePatterns.ts
but are not yet added to the generator’s pattern list or exposed via options.

============================================================
DEBUG / PREVIEW UI (App.tsx)

The React app is a first-class debug harness.

Features:

Layered visualization of all masks

Composite content overlay with runtime-aware coloring

Hidden passage reveal visible regardless of overlay toggle

Hazard enabled/disabled state clearly visible

Hover tooltips show tile + feature + runtime state

Interactions:

key -> collect

lever -> toggle

block -> select + WASD / arrow push

plate -> read-only (derived)

door -> optional manual toggle (debug-only)

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Status: COMPLETE & STABILIZED

Recently completed / verified in code:

Pattern runner best-effort execution + didCarve aggregation

Option A distance-to-wall recomputation fully wired

Safe preview validation before geometry mutation (hidden pocket pattern)

Removal of legacy plate toggling (plates are derived sensors only)

Centralized walkability rules in walkability.ts and used by runtime pushing

Added pattern runner diagnostics return structure (name/ok/reason/ms)

Implemented two easy non-carving patterns in puzzlePatterns.ts
(lever opens door, plate opens door) — pending wiring

============================================================
NEXT WORK (PLANNED)

Immediate (quality & structure) — PARTIALLY DONE / NEXT STEPS

Per-pattern debug diagnostics
DONE in puzzlePatterns.ts (runner returns diagnostics)
LEFT:

Store diagnostics into content meta (meta.patternDiagnostics)

Display diagnostics in App.tsx (panel / console / inspector)

Centralize walkability rules into a shared helper
DONE (src/walkability.ts)
LEFT:

Ensure any generation-time flood-fill / validation helpers also route through it
(some validation code still uses local reachability rules; align as needed)

Add simple non-carving patterns (lever opens door, plate opens door)
DONE in puzzlePatterns.ts
LEFT:

Add generator options to enable them

Add them to the generator’s pattern list in mazeGen.ts

Add UI toggles / controls in App.tsx if desired

Near-term (content breadth)

OR-logic puzzle (two levers OR opens hidden)

Simple THRESHOLD puzzle (multiple plates)

Mid-term (Milestone 4 — solvability by construction)

Generation-time state-space reachability checks

Required-progression verification

Block-aware flood-fill (push mechanics)

Later

Player movement integration

Player-on-plate derivation

Hazard consequences

Expanded block mechanics (multi-block, weight classes)

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
Puzzle patterns are content-level macros with validation

This document is intended to allow fast onboarding in a new chat or IDE session without rereading the codebase.
