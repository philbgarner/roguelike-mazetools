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

Guarantee solvability by construction (increasingly)

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

NOTE:
Some puzzle patterns may CARVE additional geometry by mutating solid after BSP.
If a pattern carves geometry, distanceToWall becomes stale unless recomputed.

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

IMPORTANT INVARIANTS:

featureType 9 (hidden passage) MUST have non-zero featureId

meta.secrets[] contains the authoritative entries for hidden passages / secrets

Mask: featureParam (Uint8)
Subtype or behavior flags.

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

DERIVED PLATES:

Plate.pressed is computed from block occupancy

Plates cannot be toggled directly

WALKABILITY RULES (CURRENT):

Walls: never walkable

Doors: walkable only if open

Hidden passages (featureType 9):
unrevealed -> blocked
revealed -> walkable

Hazards: NEVER block movement (consequence-only later)

============================================================
CIRCUIT EVALUATION (CORE LOGIC)

evaluateCircuits(currentState, meta.circuits) is a pure function.

Evaluation steps:

Determine trigger satisfaction:
KEY -> collected
LEVER -> toggled
PLATE -> pressed (derived)
(future) player-on-plate, combat clear, interaction

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
DEBUG / PREVIEW UI (App.tsx)

The React app is a first-class debug harness.

Features:

Layered visualization of all masks

Composite content overlay with runtime-aware coloring

Hidden passage reveal is visible regardless of overlay toggle

Hazard enabled/disabled state is clearly visible

Hover tooltips show tile + feature + runtime state

Interactions:

key -> collect

lever -> toggle

block -> select + WASD/arrow push

plate -> read-only (derived)

door -> optional manual toggle (debug only)

Panels:

Stats panel: rooms, corridors, monsters, chests, secrets, doors, keys, levers, plates, blocks, hazards

Circuit panel: triggers, targets, live evaluation state

============================================================
RECENT PROGRESS (NEW)

Added a generalized “Puzzle Pattern” hook point

New module: puzzlePatterns.ts

Implemented first real pattern: Lever reveals hidden pocket connector (Variant A)

Implemented Pattern: Lever -> Hidden(REVEAL) opens an optional pocket

The pattern:

Scans for a reachable floor tile adjacent to a wall that can be carved into a small isolated pocket

Carves a connector tile + pocket area by mutating dungeon.masks.solid

Places a hidden passage fixture (featureType 9) on the connector tile with a new secretId

Places a lever fixture (featureType 6) in reachable space, far enough away from connector

Emits a circuit (PERSISTENT): LEVER(leverId) -> HIDDEN(secretId, REVEAL)

Validates by flood fill:

pocket unreachable before reveal

pocket reachable after reveal

Updated pattern to avoid non-existent helpers

No roomIdAtCell map is used.

Room membership is inferred from dungeon.masks.regionId at the placement tile (corridors use entranceRoomId fallback).

Generator wiring plan

ContentOptions additions:

includeLeverHiddenPocket?: boolean

leverHiddenPocketSize?: number (odd >= 3)

The pattern should be invoked during generateDungeonContent() once:

entranceRoomId is known

rooms[] exists

featureType/featureId/featureParam masks exist

circuitsById exists (pattern inserts its circuit there)

secrets/levers placement arrays exist (pattern appends to them)

NOTE ON CARVING:

The pattern mutates dungeon.masks.solid (carving connector/pocket).

This can stale distanceToWall. If downstream placements rely on distanceToWall,
recompute distanceToWall after pattern placement or run patterns after any clearance-sensitive placements.

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Completed:

Runtime state model

Circuit evaluator

Pressure plates as derived sensors

Pushable blocks with physical movement

Hidden passages (featureType 9) reveal driven by circuits

Hazards toggleable via circuits (consequence-only)

Debug harness supports state inspection and interactions

NEW: First generalized puzzle pattern (Lever -> Hidden reveal) with generation-time validation

In progress / next immediate step:

Wire the new pattern into generateDungeonContent() behind ContentOptions flags

Ensure circuits are inserted via circuitsById (or merged into meta.circuits)

Ensure secrets/levers meta arrays are returned correctly

Add option defaults and UI toggles if desired

============================================================
NEXT WORK (RECOMMENDED ORDER)

Immediate (finish this pattern integration)

Wire includeLeverHiddenPocket into generateDungeonContent()

Add ContentOptions fields + defaults

Import and invoke applyLeverRevealsHiddenPocketPattern()

Ensure pattern writes to circuitsById and to secrets/levers arrays

Confirm runtime sees the new secret in initDungeonRuntimeState()

Confirm lever toggling reveals the pocket connector in the debug app

Decide how to handle distanceToWall staleness

Option A: recompute distanceToWall after all pattern carving

Option B: run patterns after all placements that rely on distanceToWall

Option C: pattern-only carving avoids areas that matter to other placements

Near-term (expand pattern system)
3) Add more simple patterns (no block pushing required)

Lever opens door (PERSISTENT)

Plate reveals hidden (PERSISTENT)

Two triggers OR opens hidden

Threshold-based puzzles with multiple plates (later)

Add a lightweight pattern runner and failure strategy

best-effort placement with warnings vs hard-fail

per-pattern debug info (selected connector, lever position, goal tile)

Mid-term (true solvability-by-construction)
5) Generalized generation-time solvability validation

Graph reachability checks with state transitions

Validate required progression: keys/doors, reveals, toggles

Eventually incorporate block pushes and plate derivation rules

Unify walkability logic

Extract a single shared function used by both runtime movement and generation-time flood fills

Avoid drift between “simulation” and “validation”

Later milestone extensions
7) Player movement integration (beyond Milestone 3)

Player-on-plate derivation

Interact triggers, combat-clear triggers

Hazard consequences

Expand block mechanics

multiple blocks

weight classes

AND/THRESHOLD puzzles based on multi-block arrangements

============================================================
MENTAL MODEL SUMMARY

BSP decides where you can walk
Content decides why you care
featureId + circuits define logical wiring
Runtime state executes puzzle logic
Plates are sensors, not switches
Hidden passages are tiles that come into existence (from blocked -> revealed)
Hazards are consequences, not walls
evaluateCircuits is the only place logic happens
Puzzle patterns are content-level macros that place fixtures + circuits and validate reachability

This document is intended to allow fast onboarding in a new chat or IDE session without rereading the codebase.
