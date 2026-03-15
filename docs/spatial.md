# Spatial Queries — `src/spatial.ts`

Pure geometric spatial query functions. No dungeon state required. All functions operate in grid coordinates; callers are responsible for clamping results to valid dungeon bounds.

---

## Types

### `SpatialShape`

```ts
type SpatialShape = "chebyshev" | "euclidean" | "manhattan";
```

| Shape | Description | Use case |
|-------|-------------|----------|
| `"chebyshev"` | Square neighbourhood — max of |dx|, |dy| | Standard roguelike range check |
| `"euclidean"` | Circular neighbourhood — Pythagorean distance | Explosion radii, AoE spells |
| `"manhattan"` | Diamond neighbourhood — |dx| + |dy| | Grid-locked movement range |

---

## Functions

### `tilesInRadius(cx, cy, radius, shape?)`

```ts
function tilesInRadius(
  cx: number,
  cy: number,
  radius: number,
  shape?: SpatialShape, // default: "chebyshev"
): GridPos[]
```

Returns all grid positions within `radius` of `(cx, cy)`. Does **not** bounds-check — clamp to dungeon dimensions if needed.

### `tilesInCone(ox, oy, directionRad, halfAngle, range)`

```ts
function tilesInCone(
  ox: number,
  oy: number,
  directionRad: number,
  halfAngle: number,
  range: number,
): GridPos[]
```

Returns all grid positions in a cone. `directionRad` is the cone's central angle in radians (0 = east, counter-clockwise positive). `halfAngle` is the half-width in radians (e.g. `Math.PI / 4` for a 90° cone). `range` is Chebyshev reach.

### `tilesInLine(from, to)`

```ts
function tilesInLine(from: GridPos, to: GridPos): GridPos[]
```

Returns all grid cells intersected by a Bresenham line from `from` to `to`, inclusive of both endpoints. Useful for projectile paths and LOS traces.

### `visitTilesInRadius(cx, cy, radius, visit, shape?)`

```ts
function visitTilesInRadius(
  cx: number,
  cy: number,
  radius: number,
  visit: (x: number, y: number) => boolean | void,
  shape?: SpatialShape, // default: "chebyshev"
): void
```

Callback variant of `tilesInRadius` — avoids allocating an array. Return `false` from `visit` to stop early.

---

## Examples

### AoE explosion

```ts
import { tilesInRadius } from "./src/spatial";

const blastCells = tilesInRadius(epicenter.x, epicenter.y, 3, "euclidean");

for (const { x, y } of blastCells) {
  if (x >= 0 && y >= 0 && x < dungeon.width && y < dungeon.height) {
    // Apply damage to any actor at (x, y)
  }
}
```

### Cone breath attack

```ts
import { tilesInCone } from "./src/spatial";

// Dragon faces east (0 rad), 90° spread, 6 cells range
const breathCells = tilesInCone(dragon.x, dragon.y, 0, Math.PI / 4, 6);
```

### Projectile path with LOS

```ts
import { tilesInLine } from "./src/spatial";

const line = tilesInLine({ x: attacker.x, y: attacker.y }, { x: target.x, y: target.y });

// First solid cell blocks the projectile
for (const cell of line) {
  if (solidData[cell.y * W + cell.x] !== 0) break;
  // Check for actors at cell...
}
```

### Early-exit radius scan

```ts
import { visitTilesInRadius } from "./src/spatial";

let nearestEnemy: GridPos | null = null;

visitTilesInRadius(player.x, player.y, 8, (x, y) => {
  const actor = actorAt(x, y);
  if (actor?.kind === "monster") {
    nearestEnemy = { x, y };
    return false; // stop scanning
  }
});
```

### Discourage A* from entering AoE

```ts
import { tilesInRadius } from "./src/spatial";
import { aStar8 } from "./src/astar";

const dangerCells = new Set(
  tilesInRadius(boss.x, boss.y, 4).map(({ x, y }) => `${x},${y}`)
);

const path = aStar8(dungeon, isWalkable, start, goal, {
  cellCost: (x, y) => dangerCells.has(`${x},${y}`) ? 100 : 0,
});
```

---

## Notes

- `tilesInRadius` and `visitTilesInRadius` include the centre cell `(cx, cy)` itself.
- `tilesInCone` excludes the origin cell.
- Results are unordered (row-major scan order internally).
- None of these functions perform bounds checking — always clamp `x`/`y` against `dungeon.width` / `dungeon.height` before reading textures.
