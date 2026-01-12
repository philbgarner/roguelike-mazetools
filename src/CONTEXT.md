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
- BSP partitioning of the grid
- Room carving
- Corridor carving
- Wall preservation (optional outer wall retention)
- Distance-to-wall calculation
- Region (room) identification

This layer is pure geometry and has no gameplay knowledge.

Content Generation (Milestones 1–2 + early Milestone 3 wiring)
Entry: generateDungeonContent() in mazeGen.ts

Responsibilities:
- Place gameplay content on top of BSP geometry
- Encode progression, gating, and optional content
- Guarantee solvability by construction
- Remain deterministic from seed/options

This layer expresses gameplay intent but does not execute logic.

Runtime / Puzzle Logic (Milestone 3)
Core files:
- dungeonState.ts
- evaluateCircuits.ts
- App.tsx (debug/preview harness)

Responsibilities:
- Hold mutable gameplay state (doors, levers, plates, blocks, hazards, secrets, etc.)
- Derive sensor state (plates) from world occupancy (blocks, later player)
- Evaluate circuits based on runtime state
- Apply effects (open doors, toggle hazards, reveal passages)
- Drive interactive puzzle simulation

============================================================
STRUCTURAL MASKS (BSP OUTPUT)

All masks are Uint8Array with size width * height, indexed as:
index = y * width + x

Mask: solid
- 255 = wall
- 0 = floor

Mask: regionId
- 0 = not a room
- 1..255 = room id

Mask: distanceToWall
- Manhattan distance to nearest wall
- 0 means wall tile

Structural metadata:
- meta.rooms : Rect[]
- meta.corridors : { a, b }[]
- meta.bspDepth : number
- meta.seedUsed : number

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
9 = hidden passage (reserved)
10 = hazard (Milestone 3)

Mask: featureId (Uint8)
Instance / circuit identifier (1..255).
All tiles sharing a featureId belong to the same logical circuit.

Used for:
- Door + key relationships
- Lever/plate → multi-target circuits
- Hazard toggles
- Future multi-step puzzles

IMPORTANT:
- For push blocks, featureId identifies the block instance, but the block’s true position is runtime-driven.
  The masks are for initial placement / inspection only.

Mask: featureParam (Uint8)
Subtype or behavior flags.
Examples:
- Door kind: 1 = locked, 2 = lever-controlled
- Plate flags (mode, activatedByBlock, inverted, etc.)
- Block type/weightClass (future use; currently a simple 0..3)
- Hazard behavior (future)

Mask: danger (Uint8)
- Monster difficulty / danger value.

Mask: lootTier (Uint8)
- Chest tier scaling with room depth.

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
- meta.seedUsed : number

- meta.roomGraph : Map<roomId, Set<roomId>>
- meta.roomDistance : Map<roomId, distance>

- meta.entranceRoomId : number
- meta.farthestRoomId : number
- meta.mainPathRoomIds : number[]

- meta.monsters : { id, x, y, roomId, danger }[]
- meta.chests : { id, x, y, roomId, tier }[]
- meta.secrets : { id, x, y, roomId }[]
- meta.doors : { id, x, y, roomA, roomB, kind, depth }[]
- meta.keys : { id, x, y, roomId }[]
- meta.levers : { id, x, y, roomId }[]

Milestone 3 additions:
- meta.plates : { id, x, y, roomId, mode, activatedByPlayer, activatedByBlock, inverted }[]
- meta.blocks : { id, x, y, roomId, weightClass }[]   (pushable blocks)
- (existing/earlier) meta.hazards, meta.hidden etc. may be present depending on generator configuration

Circuits:
meta.circuits : {
  id: number,
  logic: { type: "OR" | "AND" | "THRESHOLD", threshold?: number },
  behavior: { mode: "TOGGLE" | "MOMENTARY" | "PERSISTENT" },
  triggers: { kind, refId }[],
  targets: { kind, refId, effect }[],
}[]

Milestone 3 fixture (for immediate testing):
- Content generation can optionally place a tiny test puzzle:
  - 1 pressure plate
  - 1 push block adjacent to it
  - 1 door (as a circuit target)
  - Circuit: PLATE → DOOR (toggle)

============================================================
RUNTIME STATE MODEL (MILESTONE 3)

DungeonRuntimeState is mutable and independent from generation.

Current runtime buckets:
- doors[id]   : { kind, isOpen, forcedOpen? }
- keys[id]    : { collected }
- levers[id]  : { toggled }
- plates[id]  : { pressed }         (DERIVED; do not directly toggle for gameplay)
- blocks[id]  : { x, y, weightClass }   (AUTHORITATIVE position for push blocks)
- hazards[id] : { hazardType, enabled }
- secrets[id] : { revealed }
- circuits[id]: { active, lastSatisfied, lastSatisfiedCount }

Initialization:
- initDungeonRuntimeState(contentMeta)
- then derive sensor state (plates) from occupancy
- then evaluateCircuits()

DERIVED PLATES (IMPORTANT):
- Plate.pressed is computed from block occupancy (and plate config flags).
- Click-to-toggle plates has been removed from the main debug harness to keep puzzles honest.

Runtime actions (debug + gameplay):
- collectKey()
- toggleLever()
- tryPushBlock(blockId, dx, dy)    (Milestone 3)
- derivePlatesFromBlocks()         (Milestone 3; run after moves / at init)
- (debug convenience retained) door manual toggle may exist; plates should remain derived

============================================================
CIRCUIT EVALUATION (CORE LOGIC)

evaluateCircuits(currentState, meta.circuits) is a pure function.

Evaluation steps:
- Determine trigger satisfaction:
  - KEY   → collected
  - LEVER → toggled
  - PLATE → pressed (DERIVED from occupancy)
  - (future) combat clear, interaction, player-on-plate, etc.

- Apply logic:
  - OR / AND / THRESHOLD
  - Optional inversion

- Apply behavior:
  - MOMENTARY
  - PERSISTENT
  - TOGGLE (edge-based)

- Apply targets:
  - DOOR   → open / close / toggle
  - HAZARD → enable / disable / toggle
  - HIDDEN → reveal / hide / toggle

The evaluator outputs:
- next DungeonRuntimeState
- debug info per circuit (for UI inspection)

============================================================
DEBUG / PREVIEW UI (App.tsx)

The React app is a first-class debug harness for Milestone 3.

Features:
- Layered visualization of all masks
- Composite content overlay with state-aware coloring
- Hover tooltip showing per-cell data + circuit hints + runtime state

Click / input interactions:
- key   → collect
- lever → toggle
- block → click to select, then WASD/arrow keys to push (Milestone 3)
- plate → read-only state display (pressed is derived; no manual toggling)
- door  → manual toggle may exist as debug convenience

Stats panel shows counts of:
- rooms, corridors
- monsters, chests, secrets
- doors, keys, levers, plates, blocks

Circuit panel lists:
- all circuits
- triggers and targets
- live circuit debug output

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Phase 2 (Stateful Puzzle Execution)

Completed:
- Runtime state model (doors, keys, levers, plates, hazards, secrets, circuits)
- Circuit evaluator
- Pressure plate support (as a trigger)
- Pushable blocks runtime support:
  - runtime.blocks bucket
  - block selection + push input in App.tsx
  - tryPushBlock() action
- Derived plates:
  - plate pressed state derives from block occupancy via derivePlatesFromBlocks()
  - removed plate click-toggle from main harness
- Content-side “fixture” puzzle for testing:
  - generator can place block + plate + door
  - circuit PLATE → DOOR wired automatically
- Door state overlay + circuit debug visualization (kept working with derived plates)

Next to complete Milestone 3 (recommended order):
1) Hazard activation visuals + interaction rules
   - show hazard enabled/disabled clearly in composite render
   - decide whether hazards block movement, damage on entry, etc. (likely “consequence”, not “wall”)
2) Hidden passage reveal visuals + behavior
   - implement target effects for HIDDEN in UI overlay (and walkability changes if applicable)
3) Generalized puzzle pattern generation (beyond the fixture)
   - place multiple plates/levers/doors/blocks by grammar
   - incorporate room depth/main-path constraints
4) Generation-time solvability validation (by construction + checks)
   - ensure required progression remains possible under puzzle mechanics
5) Expand block mechanics (optional stretch within Milestone 3)
   - multiple blocks, weight classes, multiple-plate thresholds, “AND” puzzles, etc.
6) (Later milestone) Player movement / pathing through the runtime-walkability model
   - player-on-plate derivation
   - richer interaction triggers (INTERACT, COMBAT_CLEAR)

============================================================
MENTAL MODEL SUMMARY

BSP decides where you can walk
Content decides why you care
featureId + circuits define logical wiring
Runtime state executes puzzle logic
Plates are sensors: derived from occupancy (blocks now, player later)
evaluateCircuits is the only place logic happens
UI exists to prove puzzles are wired and solvable

This document is intended to allow fast onboarding in a new chat or IDE session without rereading the codebase.
