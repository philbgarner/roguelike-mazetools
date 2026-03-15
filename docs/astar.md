# A* Pathfinding — `src/astar.ts`

8-directional A\* using the octile distance heuristic. Integer-scaled costs: orthogonal = 10, diagonal = 14 (≈ 10√2). Diagonal movement through wall corners is blocked.

---

## Types

### `GridPos`

```ts
type GridPos = { x: number; y: number };
```

### `AStarPath`

```ts
type AStarPath = { path: GridPos[]; cost: number } | null;
```

`path` runs from `start` to `goal` inclusive. Returns `null` if the goal is unreachable or either endpoint is not walkable.

### `AStar8Options`

```ts
type AStar8Options = {
  /**
   * Extra predicate: return true to treat (x,y) as impassable at runtime.
   * Applied on top of the base isWalkable predicate.
   */
  isBlocked?: (x: number, y: number) => boolean;

  /**
   * Extra movement cost added when entering cell (x, y).
   * Use positive values to discourage but not forbid cells.
   * Return 0 (or omit) for normal cost.
   */
  cellCost?: (x: number, y: number) => number;
};
```

---

## Functions

### `aStar8(dungeon, isWalkable, start, goal, opts?)`

```ts
function aStar8(
  dungeon: DungeonOutputs,
  isWalkable: (x: number, y: number) => boolean,
  start: GridPos,
  goal: GridPos,
  opts?: AStar8Options,
): AStarPath
```

Find the shortest 8-directional path from `start` to `goal`.

**Parameters:**

| Parameter | Description |
|-----------|-------------|
| `dungeon` | Any `DungeonOutputs` — used for grid dimensions only |
| `isWalkable` | Base walkability predicate |
| `start` | Starting cell |
| `goal` | Target cell |
| `opts` | Optional runtime blockers and per-cell costs |

**Returns** `{ path, cost }` with `path` from `start` to `goal` inclusive, or `null` if unreachable.

---

## Examples

### Basic pathfinding

```ts
import { aStar8 } from "./src/astar";

const solidData = dungeon.textures.solid.image.data as Uint8Array;
const W = dungeon.width;

const result = aStar8(
  dungeon,
  (x, y) => solidData[y * W + x] === 0, // 0 = floor
  { x: 5, y: 5 },
  { x: 40, y: 30 },
);

if (result) {
  console.log(`Path length: ${result.path.length}, cost: ${result.cost}`);
  // result.path[0] === start, result.path[result.path.length - 1] === goal
}
```

### With runtime blockers (other actors)

```ts
const actorPositions = new Set(actors.map(a => `${a.x},${a.y}`));

const result = aStar8(
  dungeon,
  (x, y) => solidData[y * W + x] === 0,
  playerPos,
  targetPos,
  {
    isBlocked: (x, y) => actorPositions.has(`${x},${y}`),
  },
);
```

### With cell costs (discourage hazard cells)

```ts
const hazardData = dungeon.textures.hazards.image.data as Uint8Array;

const result = aStar8(
  dungeon,
  (x, y) => solidData[y * W + x] === 0,
  start,
  goal,
  {
    cellCost: (x, y) => hazardData[y * W + x] !== 0 ? 50 : 0,
  },
);
```

---

## Notes

- Uses `Int32Array` for g-scores and `Int16Array` for parent pointers — efficient for grids up to ~65K wide/tall.
- The open set is a binary `MinHeap<number>` (cell indices), heap-allocated once per call.
- Diagonal moves are blocked if either of the two orthogonal neighbours is impassable (no cutting corners through walls).
- `cellCost` is added on top of the directional movement cost (10 or 14), not in place of it.
