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

Each pattern returns PatternResult { ok, didCarve }

runPatternsBestEffort() aggregates diagnostics

Implemented patterns:

Lever reveals hidden pocket (carving + validated)

Lever opens door (non-carving)

Plate opens door (non-carving)

IMPORTANT FIX (COMPLETED)

ROOT CAUSE (FORMER):

Non-carving door patterns (Lever→Door, Plate→Door) attempted to find door sites by
scanning for a single tile adjacent to two different rooms (via neighboring regionIds).

With current geometry (rooms labeled, corridors regionId==0), this condition was often
never met, even though corridors clearly connected rooms.

FIX (IMPLEMENTED):

Door sites are defined per corridor, not per tile

All door placement (patterns + budgeting) iterates dungeon.meta.corridors

Each corridor is mapped to (roomA, roomB) via nearest-room lookup

A door tile is selected along the corridor path

Placement prefers corridor tiles (regionId==0) but may fall back to floor

First and last N tiles of each corridor path are trimmed to avoid room thresholds

Shared logic lives in src/doorSites.ts and is reused everywhere

This aligns:

pattern logic

gate budgeting

player expectations of corridor chokepoints

============================================================
GENERATOR WIRING (CURRENT STATE)

generateDungeonContent():

Structural dungeon generated

Content metadata initialized

Milestone 2 gates placed using corridor-based door-site budgeting

Puzzle patterns collected and executed

If any pattern carved geometry:

recomputeDungeonDistanceToWall() (Option A)

Pattern diagnostics stored in meta.patternDiagnostics

meta.circuits built after all ensureCircuit() calls

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — Stateful Puzzle Execution

Status: FUNCTIONALLY COMPLETE AND LOGICALLY CONSISTENT

Geometry mutation ordering bugs fixed

Corridor-based door-site definition implemented and unified

Pattern diagnostics now reflect real structural constraints

Runtime circuits, triggers, and targets behave deterministically

============================================================
NEXT WORK (PLANNED)

Immediate (polish & validation):

Verify pattern success rates across many seeds (batch runs)

Tune corridor trimming strategy (fixed N vs dynamic “skip until regionId==0”)

Improve pattern diagnostics with candidate counts (pre/post filtering)

Short-term (gameplay depth):

Add reachability validation for non-carving patterns (optional)

Introduce additional non-carving patterns:

hazard gates

multi-trigger doors

timed / resettable circuits

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

All systems are deterministic, inspectable, and debuggable
