PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

This project is an experimental procedural dungeon generator built in TypeScript with a small React preview/debug app.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system with backtracking, secrets, puzzles, monsters, and loot.

The system is intentionally layered so that geometry, gameplay intent, and puzzle logic are cleanly separated. This separation is foundational and already enforced in code.

============================================================
HIGH-LEVEL ARCHITECTURE

The system has three conceptual layers:

Structural Dungeon Generation (BSP)
Entry: generateBspDungeon() in mazeGen.ts

Responsibilities:

BSP partitioning of the grid

Room carving

Corridor carving

Wall preservation (optional outer wall retention)

Distance-to-wall calculation

Region (room) identification

This layer is pure geometry and has no gameplay knowledge.

Content Generation (Milestones 1–2 + Milestone 3 wiring)
Entry: generateDungeonContent() in mazeGen.ts

Responsibilities:

Place gameplay content on top of BSP geometry

Encode progression, gating, and optional content

Guarantee solvability by construction

Remain deterministic from seed/options

This layer expresses gameplay intent but does not execute logic.

Runtime / Puzzle Logic (Milestone 3)
Core files:

dungeonState.ts

evaluateCircuits.ts

App.tsx (debug / preview harness)

Responsibilities:

Hold mutable gameplay state (doors, levers, plates, blocks, hazards, secrets, circuits)

Derive sensor state (plates) from world occupancy (blocks now, player later)

Evaluate circuits based on runtime state

Apply effects (open doors, toggle hazards, reveal passages)

Drive interactive puzzle simulation

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

============================================================
CONTENT MASKS (GAMEPLAY LAYERS)

Mask: featureType (Uint8)
Encodes what exists at a tile.

0 = none
1 = monster spawn
2 = loot chest
3 = secret door
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

Used for:

Door ↔ key / lever relationships

Lever / plate → multi-target circuits

Hazard toggles

Hidden passage reveal

Future multi-step puzzles

IMPORTANT INVARIANTS:

featureType 9 (hidden passage) MUST have a non-zero featureId

featureId for featureType 9 must correspond to meta.secrets[id]

Push blocks use featureId only for identity; their true position is runtime-driven

Mask: featureParam (Uint8)
Subtype or behavior flags.

Examples:

Door kind: 1 = locked, 2 = lever-controlled

Plate flags: activatedByBlock, inverted, etc.

Block weight class (future)

Hazard behavior (future)

Mask: danger (Uint8)

Monster difficulty / danger value

Mask: lootTier (Uint8)

Chest tier scaling with room depth

Mask: hazardType (Uint8)
Hazard subtype:
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

meta.plates : { id, x, y, roomId, activatedByBlock, inverted }[]

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

Milestone 3 fixture (debug / test harness):

Generator can place:

1 pressure plate

1 push block adjacent to it

1 door

1 hidden passage tile (featureType 9)

1 hazard tile + lever

Circuits:

PLATE → DOOR (toggle)

PLATE → HIDDEN (reveal)

LEVER → HAZARD (toggle)

============================================================
RUNTIME STATE MODEL (MILESTONE 3)

DungeonRuntimeState is mutable and independent from generation.

Current runtime buckets:

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

DERIVED PLATES (IMPORTANT):

Plate.pressed is computed from block occupancy

Plates cannot be toggled directly

This enforces physical puzzle honesty

WALKABILITY RULES (CURRENT):

Walls: never walkable

Doors: walkable only if open

Hidden passages (featureType 9):

unrevealed → blocked (wall-like)

revealed → walkable (floor-like)

Hazards:

NEVER block movement

Consequence-only (damage/effects later)

============================================================
CIRCUIT EVALUATION (CORE LOGIC)

evaluateCircuits(currentState, meta.circuits) is a pure function.

Evaluation steps:

Determine trigger satisfaction:

KEY → collected

LEVER → toggled

PLATE → pressed (derived)

(future) player-on-plate, combat clear, interaction

Apply logic:

OR / AND / THRESHOLD

Apply behavior:

MOMENTARY

PERSISTENT

TOGGLE (edge-based)

Apply targets:

DOOR → open / close / toggle

HAZARD → enable / disable / toggle

HIDDEN → reveal / hide / toggle

Outputs:

next DungeonRuntimeState

per-circuit debug info for UI inspection

============================================================
DEBUG / PREVIEW UI (App.tsx)

The React app is a first-class debug harness.

Features:

Layered visualization of all masks

Composite content overlay with runtime-aware coloring

Hidden passage reveal is visible regardless of overlay toggle

Hazard enabled/disabled state is clearly visible

Hover tooltips show tile + feature + runtime state

Interactions:

key → collect

lever → toggle

block → select + WASD/arrow push

plate → read-only (derived)

door → optional manual toggle (debug only)

Panels:

Stats panel: rooms, corridors, monsters, chests, secrets, doors, keys, levers, plates, blocks, hazards

Circuit panel: triggers, targets, live evaluation state

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Completed:

Runtime state model

Circuit evaluator

Pressure plates as derived sensors

Pushable blocks with physical movement

Hidden passages (featureType 9):

blocked until revealed

reveal driven by circuits

correct visual + walkability behavior

Hazards:

consequence-only (never block movement)

toggleable via circuits

visually reflect enabled/disabled state

Multi-fixture debug puzzles validating all of the above

NEXT WORK (RECOMMENDED ORDER):

Generalized puzzle pattern generation

Multiple plates, levers, doors, hazards, hidden passages

Grammar-based placement

Main-path vs optional-path constraints

Generation-time solvability validation

Ensure required progression is always possible

Validate toggle order and reveal dependencies

Unify walkability logic

Extract a shared walkability function

Prepare for player movement integration

Expand block mechanics (optional)

Multiple blocks

Weight classes

Threshold / AND puzzles

Player movement & interaction (later milestone)

Player-on-plate derivation

Hazard consequences

Combat-clear triggers

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
The UI exists to prove puzzles are wired and solvable

This document is intended to allow fast onboarding in a new chat or IDE session without rereading the codebase.
