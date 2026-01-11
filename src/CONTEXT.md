PROJECT CONTEXT — BSP DUNGEON & CONTENT GENERATION

This project is an experimental procedural dungeon generator built in TypeScript
with a small React preview app.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system with
backtracking, secrets, puzzles, monsters, and loot.

The code is intentionally layered so that structural generation and gameplay
content generation are separated.


============================================================
HIGH-LEVEL ARCHITECTURE
============================================================

The system has three conceptual layers:

1) Structural Dungeon Generation
   Function: generateBspDungeon() in mazeGen.ts

2) Content Generation (Milestones 1–2)
   Function: generateDungeonContent() in mazeGen.ts

3) Stateful / Puzzle Logic (Milestone 3 and beyond)
   Built on top of content metadata and feature circuits

The React app (App.tsx) visualizes all layers using selectable debug views,
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
- Wall preservation
- Distance-to-wall calculation
- Region (room) identification

CORE MASKS (Uint8Array)
All masks are width * height arrays indexed as:
index = y * width + x

Mask: solid
- 255 = wall
- 0 = floor

Mask: regionId
- 0 = not a room
- 1..255 = room id

Mask: distanceToWall
- Manhattan distance from nearest wall
- 0 means wall tile

STRUCTURAL METADATA
meta.rooms        : Rect[] (carved rooms)
meta.corridors    : { a: Point, b: Point }[]
meta.bspDepth     : number
meta.seedUsed     : number

DEBUG OUTPUT
- ASCII map (# = wall, . = floor)
- Grayscale ImageData per mask
- PNG export support


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
- Fully inspectable via debug layers


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


============================================================
CONTENT LAYERS (MASKS)
============================================================

MASK: featureType (Uint8)
Encodes what exists at a tile.

0 = none
1 = monster spawn
2 = loot chest
3 = secret door
4 = door (locked or lever)
5 = key
6 = lever

MASK: featureId (Uint8)
Instance / circuit identifier (1..255).
All tiles sharing a featureId belong to the same logical circuit.

Used for:
- Door + key relationships
- Lever-door circuits
- Future multi-tile puzzles

MASK: featureParam (Uint8)
Subtype or behavior flags.
Examples:
- Door kind (locked vs lever)
- Puzzle mode (toggle, momentary, etc)

MASK: danger (Uint8)
Used for monster spawns only.
- Scales with room depth
- Higher value = more dangerous encounter

MASK: lootTier (Uint8)
Used for chests only.
- Scales with room depth
- Interpreted later by gameplay logic


============================================================
CONTENT PLACEMENT RULES
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


============================================================
CONTENT METADATA OUTPUT
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

This metadata is the authoritative source for all gameplay logic.


============================================================
DEBUG & VISUALIZATION
============================================================

ASCII OVERLAY SYMBOLS
M = monster spawn
$ = loot chest
? = secret door
D = door
K = key
L = lever
E = entrance room center

REACT PREVIEW LAYERS
- solid
- regionId
- distanceToWall
- content (composited)
- featureType
- featureId
- featureParam
- danger
- lootTier

HOVER TOOLTIP
- Shows per-cell terrain, room, feature, and circuit data
- Used for generator debugging and puzzle validation


============================================================
KEY INVARIANTS & CONSTRAINTS
============================================================

- Dungeon carving must occur before content generation
- Content generation must occur before puzzle/state logic
- inBounds(x, y, width, height) argument order is critical
- All masks are Uint8Array for GPU-friendly textures
- Content generation is deterministic from seed
- No unsolvable progression gates are allowed


============================================================
PLANNED NEXT MILESTONE — MILESTONE 3
============================================================

MILESTONE 3: STATEFUL / PHYSICAL PUZZLES

GOAL
Introduce puzzles that depend on persistent state, spatial reasoning,
and multi-step interactions rather than simple possession of items.

CORE FEATURES

PRESSURE PLATES
- Floor tiles that activate when weighted
- Activated by player or pushable blocks
- Can be momentary or toggle-based
- Linked to doors or other features via featureId

PUSHABLE BLOCKS / FURNITURE
- Grid-aligned, collision-aware objects
- Can rest on pressure plates
- Used for spatial and timing puzzles

MULTI-DOOR CIRCUITS
- One trigger controls multiple doors
- AND / OR style logic
- Implemented via shared featureId and featureParam flags

HIDDEN PASSAGES
- Illusion walls or breakable walls
- Revealed by triggers, combat, or interaction
- May be temporary or permanent

ENVIRONMENTAL HAZARDS
- Lava, poison gas, water, etc
- Toggled or mitigated via puzzle logic
- Adds time pressure and movement constraints

PUZZLE GRAMMAR
- Generator places complete puzzle patterns, not random objects
- Examples:
  [ plate + block ] -> [ door ] -> [ reward ]
  [ lever ] -> [ multiple doors ]
  [ combat clear ] -> [ reveal passage ]

All puzzles must be solvable by construction and support backtracking.


============================================================
MENTAL MODEL SUMMARY
============================================================

- BSP decides where you can walk
- Content generation decides why you care
- Room graph defines progression and backtracking
- featureId defines logical circuits
- Masks are for rendering and debugging
- Metadata drives actual gameplay
- Milestone 3 adds state and memory to the dungeon

This separation is intentional and foundational.
