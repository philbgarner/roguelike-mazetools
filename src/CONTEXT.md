# PROJECT CONTEXT — BSP DUNGEON & CONTENT GENERATION

This project is an experimental procedural dungeon generator built in TypeScript
with a small React preview app.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system with
backtracking, secrets, puzzles, monsters, and loot.

The code is intentionally layered so that structural generation and gameplay
content generation are separated, and puzzle/state logic is built *on top*.


============================================================
HIGH-LEVEL ARCHITECTURE
============================================================

The system has three conceptual layers:

1) Structural Dungeon Generation (BSP)
   - Entry: generateBspDungeon() in mazeGen.ts

2) Content Generation (Milestones 1–2 + early Milestone 3 wiring)
   - Entry: generateDungeonContent() in mazeGen.ts

3) Stateful / Puzzle Logic (Milestone 3 and beyond)
   - Built on top of content metadata + feature circuits
   - Ultimately drives actual gameplay interactions

The React app (App.tsx) visualizes these layers using selectable debug views,
including composite content overlays and per-cell inspection tooltips.


============================================================
1) STRUCTURAL DUNGEON GENERATION (BSP)
============================================================

ENTRY POINT
generateBspDungeon(options)

RESPONSIBILITIES
- BSP partitioning of the grid
- Room carving
- Corridor carving
- Wall preservation (optional outer wall retention)
- Distance-to-wall calculation
- Region (room) identification

CORE MASKS (Uint8Array)
All masks are width * height arrays indexed as:
index = y * width + x

Mask: solid
- 255 = wall
- 0   = floor

Mask: regionId
- 0      = not a room
- 1..255 = room id

Mask: distanceToWall
- Manhattan distance to nearest wall
- 0 means wall tile

STRUCTURAL METADATA
meta.rooms        : Rect[] (carved rooms)
meta.corridors    : { a: Point, b: Point }[]
meta.bspDepth     : number
meta.seedUsed     : number

DEBUG OUTPUT
- ASCII map (# = wall, . = floor)
- Grayscale ImageData per mask
- PNG export support via imageDataToPngDataUrl()


============================================================
2) CONTENT GENERATION (MILESTONES 1–2)
============================================================

ENTRY POINT
generateDungeonContent(dungeon, options?)

This function does NOT modify dungeon structure.
It consumes the output of generateBspDungeon() and layers gameplay content on top.

DESIGN GOALS
- Metroidvania-friendly (supports backtracking)
- Deterministic from seed
- Solvable by construction
- Fully inspectable via debug layers and metadata


============================================================
CONTENT CONCEPTS IMPLEMENTED (MILESTONES 1–2)
============================================================

ROOM GRAPH
A graph is constructed from corridor connections.

Nodes:
- Room IDs (1..255)

Edges:
- Corridors connecting rooms

Derived data:
- Entrance room (default: bottom-most room)
- BFS room depth (distance from entrance)
- Farthest room (defines dungeon depth)
- Main path (entrance -> farthest)
- Side rooms (degree <= 1)

PROGRESSION GATING (MILESTONE 2)
- Locked doors placed on main-path edges
- Keys placed in reachable side or earlier rooms
- Lever doors linked via featureId circuits
- Backtracking is guaranteed by construction
- No door blocks progress without its solution


============================================================
CONTENT LAYERS (MASKS)
============================================================

MASK: featureType (Uint8)
Encodes what exists at a tile.

0  = none
1  = monster spawn
2  = loot chest
3  = secret door
4  = door
5  = key
6  = lever
7  = pressure plate                (Milestone 3)
8  = push block / movable object   (Milestone 3)
9  = hidden passage                (Milestone 3)
10 = hazard                         (Milestone 3)

MASK: featureId (Uint8)
Instance / circuit identifier (1..255).
All tiles sharing a featureId belong to the same logical circuit.

Used for:
- Door + key relationships
- Lever-door circuits
- Multi-target circuits (one trigger affects multiple doors/hazards)
- Future multi-tile puzzles

MASK: featureParam (Uint8)
Subtype / behavior flags.
Examples:
- Door kind (Milestone 2): 1 = locked, 2 = lever-controlled
- Future: plate mode, block type, hazard behavior, logic modes, etc.

MASK: danger (Uint8)
Used for monster spawns only.
- Scales with room depth
- Higher value = more dangerous encounter

MASK: lootTier (Uint8)
Used for chests only.
- Scales with room depth
- Interpreted later by gameplay logic

MASK: hazardType (Uint8)
Used for hazard tiles only.
- 0 = none
- 1 = lava
- 2 = poison gas
- 3 = water
- 4 = spikes
(Exact mapping is debug-facing and can evolve; the mask exists so hazards can be
visualized and later simulated.)


============================================================
CONTENT PLACEMENT RULES (CURRENT)
============================================================

MONSTERS
- Never placed in the entrance room
- Placed only on floor tiles
- Require minimum distance from walls
- Count per room is randomized
- Danger scales with BFS depth

LOOT CHESTS
- Biased toward side rooms (dead ends)
- Deeper rooms yield higher tiers
- One chest per room (best-effort)

SECRET DOORS
- Placed on wall tiles adjacent to floor
- Only in side rooms
- Never placed on outer boundary walls
- Intended to hide optional content

DOORS / KEYS / LEVERS (MILESTONE 2)
- Doors are placed on main-path corridor tiles
- Keys / levers are placed in reachable rooms
- No door blocks progress without its solution
- featureId links all components of a circuit

MILSTONE 3 WIRES (EARLY)
- The system already reserves featureType slots for:
  pressure plates, push blocks, hidden passages, and hazards
- hazardType mask exists as a dedicated debug layer


============================================================
CONTENT METADATA OUTPUT (AUTHORITATIVE)
============================================================

meta.seedUsed : number

meta.roomGraph       : Map<roomId, Set<roomId>>
meta.roomDistance    : Map<roomId, distance>

meta.entranceRoomId  : number
meta.farthestRoomId  : number
meta.mainPathRoomIds : number[]

meta.monsters : array of
  { id, x, y, roomId, danger }

meta.chests : array of
  { id, x, y, roomId, tier }

meta.secrets : array of
  { id, x, y, roomId }

meta.doors : array of
  { id, x, y, roomA, roomB, kind, depth }

meta.keys   : array of { id, x, y, roomId }
meta.levers : array of { id, x, y, roomId }

meta.circuits : array of
  {
    id: number,
    logic: { type: "ANY" | "ALL" | "THRESHOLD", threshold?: number },
    behavior: { mode: "TOGGLE" | "MOMENTARY" | "LATCH" },
    triggers: { kind: string, refId: number }[],
    targets:  { kind: string, refId: number, effect: string }[],
  }

NOTE
- Metadata is the authoritative source for gameplay logic.
- Masks are for rendering/debugging and for compact “field maps”.


============================================================
DEBUG & VISUALIZATION (React Preview)
============================================================

APP OVERVIEW
App.tsx runs:
- generateBspDungeon(opts)
- generateDungeonContent(out)
…and visualizes the outputs.

LAYER TABS (current)
- content (composited overlay view)
- solid
- regionId
- distanceToWall
- featureType
- featureId
- featureParam
- danger
- lootTier
- hazardType

COMPOSITE CONTENT VIEW
Walls/floors base + feature overlay colors:
- red   = monsters
- green = chests/loot
- brown = doors + secret doors
- yellow= keys/levers/other feature types
(Composite is a *human-friendly* debug view; numeric masks remain authoritative.)

HOVER TOOLTIP
- Per-cell terrain + room + distance data
- Feature identity:
  - featureType → human name
  - featureId (circuit/instance id)
  - featureParam (door kind / future subtype)
  - hazardType when relevant
- Circuit hints (best-effort):
  - key/lever → “controls/unlocks circuit X”
  - door → “Circuit: door id X”

EXPORT
- “Download PNG” exports the current selected layer’s ImageData


============================================================
KEY INVARIANTS & CONSTRAINTS
============================================================

- Dungeon carving must occur before content generation
- Content generation must occur before puzzle/state logic
- All masks are Uint8Array (GPU-friendly, compact)
- Content generation is deterministic from seed/options
- No unsolvable progression gates are allowed
- featureId defines logical circuits (links triggers ↔ targets)
- Debug layers must remain consistent with metadata


============================================================
PLANNED NEXT MILESTONE — MILESTONE 3
============================================================

MILESTONE 3: STATEFUL / PHYSICAL PUZZLES

GOAL
Introduce puzzles that depend on persistent state, spatial reasoning, and multi-step
interactions (not just possession checks), while remaining solvable by construction
and supporting backtracking.

CORE FEATURE SET
- Pressure plates (momentary/toggle/latch)
- Pushable blocks / movable objects (grid + collision)
- Multi-door & multi-target circuits (AND/OR/THRESHOLD logic)
- Hidden passages (revealable / permanent or temporary)
- Environmental hazards (toggled or mitigated via circuits)


============================================================
MILESTONE 3 — PHASED IMPLEMENTATION PLAN
============================================================

PHASE 1 (FOUNDATION / WIRING) — Mostly complete / in-progress
- Reserve featureType slots for new puzzle features (7..10)
- Add hazardType mask + debug layer
- Extend preview UI to show new layers and inspect per-cell data
- Ensure featureId/circuit concept is generalized enough for multi-target puzzles

PHASE 2 (MILSTONE 3) — NEXT UP (IMPLEMENTATION TARGET)
This phase focuses on making puzzles *real*, not just painted onto masks.

A) PUZZLE STATE MODEL (RUNTIME)
- Introduce a dungeon “state” object independent from generation:
  - doorState[doorId] = open/closed/locked
  - circuitState[circuitId] = active/inactive (and/or partial counts)
  - plateState[plateId] = pressed/not pressed
  - blockState[blockId] = x,y (and any type flags)
  - hazardState[hazardId or circuitId] = active/inactive
  - revealState[hiddenPassageId] = revealed/not revealed
- Define how state is initialized from metadata (deterministic).

B) CIRCUIT EVALUATOR
- Implement a single “evaluateCircuits(state, meta)” pass that:
  1) computes trigger satisfaction (plates pressed, levers toggled, keys consumed, etc.)
  2) applies logic (ANY / ALL / THRESHOLD)
  3) updates targets (doors open/close, hazards toggle, passages reveal)
- Keep it data-driven from meta.circuits:
  - triggers[] and targets[] are the source of truth
  - featureId ties mask cells to circuit membership

C) NEW GENERATOR PATTERNS (PUZZLE GRAMMAR, NOT RANDOM SPAM)
Add deterministic “puzzle patterns” placed by construction:
- Plate + Block → Door → Reward
- Lever → Multiple Doors (gate + shortcut)
- Plate(s) → Hazard Toggle (timed corridor / safe window)
- Hidden Passage reveal behind optional trigger
Rules:
- Patterns are placed as a *set* with internal validity checks.
- Placement must respect path solvability (main path never becomes impossible).
- Side content can be optional/harder but still solvable.

D) VALIDATION / SOLVABILITY CHECKS (OFFLINE, GENERATION-TIME)
- Add a lightweight solver/validator that checks:
  - The main path remains traversable with required interactions.
  - Each gated element has reachable triggers (and blocks if required).
  - No “softlocks” (e.g., block trapped permanently, plate impossible to press).
- Validator can be conservative (over-approximations acceptable) but must catch obvious
  invalid layouts.

E) DEBUG VISUALIZATION UPGRADES (APP)
- Add a “state overlay mode” (optional) showing:
  - active circuits
  - open/closed doors
  - pressed plates
  - block positions
  - active hazards
- Add tooltip lines for:
  - current state values at (x,y) when relevant
  - circuit evaluation results (active/inactive + reason)

OUTPUT OF PHASE 2
- You can generate a dungeon *and* simulate puzzle interactions via state changes.
- Circuits become executable logic rather than just metadata.
- The debug UI can prove (visually) that puzzles are wired correctly and solvable.


============================================================
MENTAL MODEL SUMMARY
============================================================

- BSP decides where you can walk
- Content generation decides why you care
- Room graph defines progression and backtracking
- featureId + circuits define logical wiring
- Masks are for rendering + quick inspection
- Metadata drives authoritative gameplay intent
- Milestone 3 adds state, interactions, and simulation on top of the content layer

This separation is intentional and foundational.
