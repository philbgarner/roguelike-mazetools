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

Content Generation (Milestones 1–2 + early Milestone 3 wiring)
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

App.tsx (debug/preview harness)

Responsibilities:

Hold mutable gameplay state (doors, levers, plates, hazards, etc.)

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
8 = push block (reserved)
9 = hidden passage (reserved)
10 = hazard (Milestone 3)

Mask: featureId (Uint8)
Instance / circuit identifier (1..255).
All tiles sharing a featureId belong to the same logical circuit.

Used for:

Door + key relationships

Lever/plate → multi-target circuits

Hazard toggles

Future multi-step puzzles

Mask: featureParam (Uint8)
Subtype or behavior flags.
Examples:

Door kind: 1 = locked, 2 = lever-controlled

Future: plate mode, hazard behavior, block type

Mask: danger (Uint8)
Monster difficulty / danger value.

Mask: lootTier (Uint8)
Chest tier scaling with room depth.

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
meta.plates : { id, x, y, roomId, mode, activatedByPlayer, activatedByBlock, inverted }[]

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

Current runtime buckets:

doors[id] : { kind, isOpen, forcedOpen? }

keys[id] : { collected }

levers[id] : { toggled }

plates[id] : { pressed }

hazards[id] : { hazardType, enabled }

secrets[id] : { revealed }

circuits[id] : { active, lastSatisfied, lastSatisfiedCount }

Initialization:

initDungeonRuntimeState(contentMeta)

All runtime state is derived deterministically from content metadata

Runtime actions (debug + gameplay):

collectKey()

toggleLever()

togglePlate()

============================================================
CIRCUIT EVALUATION (CORE LOGIC)

evaluateCircuits(currentState, meta.circuits) is a pure function.

Evaluation steps:

Determine trigger satisfaction

KEY → collected

LEVER → toggled

PLATE → pressed

(future) blocks, combat clear, interaction

Apply logic

OR / AND / THRESHOLD

Optional inversion

Apply behavior

MOMENTARY

PERSISTENT

TOGGLE (edge-based)

Apply targets

DOOR → open / close / toggle

HAZARD → enable / disable / toggle

HIDDEN → reveal / hide / toggle

The evaluator outputs:

next DungeonRuntimeState

debug info per circuit (for UI inspection)

============================================================
DEBUG / PREVIEW UI (App.tsx)

The React app is a first-class debug harness for Milestone 3.

Features:

Layered visualization of all masks

Composite content overlay with state-aware coloring

Hover tooltip showing per-cell data + circuit hints

Click interactions to mutate runtime state:

key → collect

lever → toggle

plate → toggle pressed

door → manual toggle (debug convenience)

Stats panel shows counts of:

rooms, corridors

monsters, chests, secrets

doors, keys, levers, plates

Circuit panel lists:

all circuits

triggers and targets

live circuit debug output

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Phase 2 (Stateful Puzzle Execution)

Completed:

Runtime state model

Circuit evaluator

Plate runtime support

UI interaction harness

Door state overlay

Circuit debug visualization

In progress / next:

Pushable blocks

Hazard activation visuals

Hidden passage reveal visuals

Puzzle pattern generation (by grammar)

Generation-time solvability validation

============================================================
MENTAL MODEL SUMMARY

BSP decides where you can walk

Content decides why you care

featureId + circuits define logical wiring

Runtime state executes puzzle logic

evaluateCircuits is the only place logic happens

UI exists to prove puzzles are wired and solvable

This document is intended to allow fast onboarding in a new chat or IDE session without rereading the codebase.
