PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

This project is an experimental procedural dungeon generator built in TypeScript with a small React preview/debug app.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system with backtracking, secrets, puzzles, monsters, and loot.

The system is intentionally layered so that geometry, gameplay intent, and puzzle logic are cleanly separated. This separation is foundational and enforced in code.

============================================================
HIGH-LEVEL ARCHITECTURE

The system has three conceptual layers:

1) Structural Dungeon Generation (BSP)
Entry: generateBspDungeon() in mazeGen.ts

Responsibilities:
- BSP partitioning of the grid
- Room carving
- Corridor carving
- Wall preservation (optional outer wall retention)
- Distance-to-wall calculation
- Region (room) identification

This layer is pure geometry and has no gameplay knowledge.

2) Content Generation (Milestones 1–2 + Milestone 3 wiring)
Entry: generateDungeonContent() in mazeGen.ts

Responsibilities:
- Place gameplay content on top of BSP geometry
- Encode progression, gating, and optional content
- Guarantee solvability by construction (increasingly)
- Remain deterministic from seed/options

This layer expresses gameplay intent but does not execute puzzle logic.

3) Runtime / Puzzle Logic (Milestone 3)
Core files:
- dungeonState.ts
- evaluateCircuits.ts
- App.tsx (debug / preview harness)

Responsibilities:
- Hold mutable gameplay state (doors, levers, plates, blocks, hazards, secrets, circuits)
- Derive sensor state (plates) from world occupancy (blocks now, player later)
- Evaluate circuits based on runtime state
- Apply effects (open doors, toggle hazards, reveal passages)
- Drive interactive puzzle simulation (debug harness first, player later)

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

IMPORTANT POLICY (DECIDED):
Some puzzle patterns may carve additional geometry by mutating dungeon.masks.solid.
When this happens, distanceToWall becomes stale.

Chosen solution (Option A):
- distanceToWall is recomputed after all puzzle patterns that carve geometry.
- Content placement that relies on distanceToWall must occur before patterns,
  or after recomputation.

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
- featureType 9 (hidden passage) MUST have non-zero featureId
- meta.secrets[] contains the authoritative entries for hidden passages / secrets

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
- meta.plates : { id, x, y, roomId, activatedByBlock, inverted }[]
- meta.blocks : { id, x, y, roomId, weightClass }[]
- meta.hazards : { id, x, y, roomId, hazardType, activeInitial }[]

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
- doors[id]   : { kind, isOpen, forcedOpen? }
- keys[id]    : { collected }
- levers[id]  : { toggled }
- plates[id]  : { pressed } (DERIVED)
- blocks[id]  : { x, y, weightClass } (AUTHORITATIVE)
- hazards[id] : { hazardType, enabled }
- secrets[id] : { revealed }
- circuits[id]: { active, lastSatisfied, lastSatisfiedCount }

Initialization flow:
- initDungeonRuntimeState(contentMeta)
- derivePlatesFromBlocks()
- evaluateCircuits()

DERIVED PLATES:
- Plate.pressed is computed from block occupancy
- Plates cannot be toggled directly
- Legacy plate click-toggling has been removed

WALKABILITY RULES (CURRENT):
- Walls: never walkable
- Doors: walkable only if open
- Hidden passages (featureType 9):
  - unrevealed -> blocked
  - revealed   -> walkable
- Hazards: never block movement (consequence-only later)

============================================================
CIRCUIT EVALUATION (CORE LOGIC)

evaluateCircuits(currentState, meta.circuits) is a pure function.

Evaluation steps:
1) Determine trigger satisfaction:
   - KEY   -> collected
   - LEVER -> toggled
   - PLATE -> pressed (derived)
   - (future) player-on-plate, combat clear, interaction triggers
2) Apply logic: OR / AND / THRESHOLD
3) Apply behavior: MOMENTARY / PERSISTENT / TOGGLE (edge-based)
4) Apply targets:
   - DOOR   -> open/close/toggle
   - HAZARD -> enable/disable/toggle
   - HIDDEN -> reveal/hide/toggle

Outputs:
- next DungeonRuntimeState
- per-circuit debug info for UI inspection

============================================================
DEBUG / PREVIEW UI (App.tsx)

The React app is a first-class debug harness.

Features:
- Layered visualization of all masks
- Composite content overlay with runtime-aware coloring
- Hidden passage reveal is visible regardless of overlay toggle
- Hazard enabled/disabled state is clearly visible
- Hover tooltips show tile + feature + runtime state

Interactions:
- key   -> collect
- lever -> toggle
- block -> select + WASD/arrow push
- plate -> read-only (derived)
- door  -> optional manual toggle (debug only)

============================================================
PUZZLE PATTERNS (MILESTONE 3 CONTENT MACROS)

Puzzle patterns are generation-time content macros.

Module:
- puzzlePatterns.ts

Patterns:
- Place fixtures (levers / plates / doors / hidden passages / hazards / blocks)
- Emit circuits wiring triggers to targets
- Optionally carve geometry (mutating solid)
- Validate local solvability via flood-fill (best-effort)

Implemented Pattern:
1) Lever reveals hidden pocket connector (Variant A)
   - Carves a small isolated pocket
   - Connector tile is FLOOR but blocked by featureType=9 hidden passage
   - Places a lever in reachable space
   - Emits circuit:
       LEVER(leverId) -> HIDDEN(secretId, REVEAL)
   - Validates:
       pocket unreachable before reveal
       pocket reachable after reveal

Room membership:
- Inferred from dungeon.masks.regionId at placement tile
- Corridors may fall back to entranceRoomId

============================================================
GENERATOR WIRING

ContentOptions:
- includeLeverHiddenPocket?: boolean
- leverHiddenPocketSize?: number (odd >= 3)

generateDungeonContent(dungeon, opts?):
- Invokes puzzle patterns after:
  - entranceRoomId is known
  - rooms[] exist
  - feature masks exist
  - circuitsById exists
  - secrets / levers arrays exist
- Recomputes distanceToWall after pattern carving (Option A)

App.tsx:
- Exposes Content / Puzzle options
- Passes options into generateDungeonContent()
- Allows end-to-end interactive validation

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Status: FUNCTIONALLY COMPLETE

Completed:
- Runtime state model
- Circuit evaluator (OR / AND / THRESHOLD + behavior modes)
- Pressure plates as derived sensors
- Pushable blocks with physical movement
- Hidden passages revealed by circuits
- Hazards toggleable via circuits
- Debug harness for full state inspection
- Puzzle pattern system
- First validated puzzle pattern
- End-to-end wiring via generator + UI
- distanceToWall policy decided (Option A)
- Legacy plate toggling removed

============================================================
NEXT WORK (PLANNED)

Immediate (quality & structure):
1) Add a lightweight pattern runner:
   - Try patterns in sequence
   - Best-effort (never fail generation)
   - Centralized warning/logging
   - Optional per-pattern debug info

Near-term (easy-win patterns):
2) Lever opens door (PERSISTENT)
3) Plate opens door (MOMENTARY)
4) OR logic puzzle (two levers OR opens hidden)
5) Simple THRESHOLD puzzle (multiple plates)

Mid-term (Milestone 4: solvability-by-construction):
6) Generalized generation-time solvability validation:
   - Graph reachability with state transitions
   - Required progression checks
   - Later: integrate block pushing rules

7) Unify walkability logic:
   - Single shared walkability function
   - Used by runtime movement and generation-time flood fill

Later:
8) Player movement integration
9) Player-on-plate derivation
10) Hazard consequences
11) Expanded block mechanics (multi-block, weight classes)

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
