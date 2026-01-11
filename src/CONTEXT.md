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

The system has two major generation stages:

1) Structural Dungeon Generation
   Function: generateBspDungeon() in mazeGen.ts

2) Content Generation (Milestone 1)
   Function: generateDungeonContent() in mazeGen.ts

The React app (App.tsx) visualizes both stages using selectable debug layers.


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
2) CONTENT GENERATION (MILESTONE 1)
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
CONTENT CONCEPTS IMPLEMENTED (MILESTONE 1)
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


============================================================
CONTENT LAYERS (NEW MASKS)
============================================================

MASK: featureType (Uint8)
Encodes what exists at a tile.

0 = none
1 = monster spawn
2 = loot chest
3 = secret door

MASK: featureId (Uint8)
Instance identifier (1..255).
Allows multiple tiles to belong to the same feature later
(for puzzles, linked doors, etc).

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
- One chest per room in Milestone 1

SECRET DOORS
- Placed on wall tiles adjacent to floor
- Only in side rooms
- Never placed on outer boundary walls
- Intended to hide optional bonus rooms later


============================================================
CONTENT METADATA OUTPUT
============================================================

meta.seedUsed : number

meta.roomGraph      : Map<roomId, Set<roomId>>
meta.roomDistance   : Map<roomId, distance>

meta.entranceRoomId : number
meta.farthestRoomId : number
meta.mainPathRoomIds: number[]

meta.monsters : array of
  { id, x, y, roomId, danger }

meta.chests : array of
  { id, x, y, roomId, tier }

meta.secrets : array of
  { id, x, y, roomId }

This metadata is the authoritative source for gameplay systems
(monsters, loot tables, puzzles, etc).


============================================================
DEBUG & VISUALIZATION
============================================================

ASCII OVERLAY SYMBOLS
M = monster spawn
$ = loot chest
? = secret door
E = entrance room center

REACT PREVIEW LAYERS
- solid
- regionId
- distanceToWall
- featureType
- featureId
- danger
- lootTier

STATS PANEL
Displays:
- BSP depth
- Room count
- Corridor count
- Entrance room id
- Farthest room id
- Main path length
- Monster count
- Chest count
- Secret count


============================================================
KEY INVARIANTS & CONSTRAINTS
============================================================

- Dungeon carving must occur before content generation
- inBounds(x, y, width, height) argument order is critical
- All masks are Uint8Array for GPU-friendly textures
- Content generation is deterministic from seed
- No progression-blocking gates yet (Milestone 1 only)


============================================================
PLANNED NEXT MILESTONES
============================================================

MILESTONE 2
- Key / lock gating
- Lever-door circuits
- Multi-tile features via featureId
- Puzzle dependency guarantees

MILESTONE 3
- Pushable blocks
- Pressure plates
- Stateful puzzle logic
- Environmental hazards
- Optional boss rooms


============================================================
MENTAL MODEL SUMMARY
============================================================

- BSP decides where you can walk
- Content generation decides why you care
- Room graph is the backbone of progression
- Masks are for rendering and debugging
- Metadata drives actual gameplay

This separation is intentional and foundational.
