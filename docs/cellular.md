# Cellular Dungeon Generator — `src/cellular.ts`

Cellular-automata cave generator. Produces irregular, organic floor regions suited for cave and ruin themes. Output shares the same `DungeonOutputs` texture layout as `BspDungeonOutputs`, so it works directly with `generateContent`, `aStar8`, `computeFov`, and `serialize`.

---

## Types

### `CellularOptions`

```ts
type CellularOptions = {
  width: number;
  height: number;
  seed?: number | string;       // default: 0x12345678

  /** Initial wall fill probability. Default: 0.45 */
  fillProbability?: number;
  /** Number of smoothing passes. Default: 5 */
  iterations?: number;
  /**
   * A floor cell becomes wall when it has >= this many wall neighbours
   * (Moore neighbourhood). Default: 5
   */
  birthThreshold?: number;
  /**
   * A wall cell survives when it has >= this many wall neighbours. Default: 4
   */
  survivalThreshold?: number;

  keepOuterWalls?: boolean;     // default: true
};
```

### `CellularDungeonOutputs`

Extends `DungeonOutputs` (see [bsp.md](./bsp.md)).

```ts
type CellularDungeonOutputs = DungeonOutputs & {
  textures: {
    solid: THREE.DataTexture;
    /** All cells in the surviving region have regionId = 1; walls = 0. */
    regionId: THREE.DataTexture;
    distanceToWall: THREE.DataTexture;
    hazards: THREE.DataTexture;
  };
  /** Floor cell closest to the centroid of the largest connected region. */
  startPos: GridPos;
};
```

---

## Functions

### `generateCellularDungeon(options)`

```ts
function generateCellularDungeon(options: CellularOptions): CellularDungeonOutputs
```

Generate a cellular-automata cave dungeon. Throws if `width` or `height` ≤ 2.

**Algorithm:**

1. Fill grid randomly with walls/floor at `fillProbability`.
2. Run `iterations` smoothing passes using Moore-neighbourhood rules (`birthThreshold`, `survivalThreshold`).
3. Flood-fill all connected floor regions (4-connected BFS).
4. Keep only the largest region — all other floor cells are re-solidified, guaranteeing full connectivity.
5. Set `regionId = 1` for surviving cells.
6. Compute `startPos` as the floor cell nearest to the centroid of the surviving region.
7. Compute `distanceToWall` by BFS from all wall cells.

**Example:**

```ts
import { generateCellularDungeon } from "./src/cellular";
import { generateContent } from "./src/content";

const cave = generateCellularDungeon({
  width: 80,
  height: 60,
  seed: "cave-1",
  fillProbability: 0.48,
  iterations: 6,
});

// Spawn player at the centroid of the cave
console.log(cave.startPos); // { x: 40, y: 30 } (approximately)

// Use with generateContent — textures share the same layout as BSP
generateContent(cave, {
  seed: "cave-1-content",
  callback: ({ x, y, masks, rng }) => {
    if (masks.getSolid(x, y) === "floor" && rng.chance(0.01)) {
      masks.setHazard(x, y, 1); // place lava or spikes
    }
  },
});
```

---

## Notes

- Unlike BSP, there is no room graph — `regionId` is always 0 (wall) or 1 (floor).
- Use `tilesInRadius` or `computeFov` to define patrol zones and visibility, since there are no room IDs.
- `CellularDungeonOutputs` satisfies `DungeonOutputs` structurally, so all existing engine functions accept it without changes.
- Default parameters (`fillProbability: 0.45`, `iterations: 5`) produce cave-like layouts with scattered pillars. Increase `fillProbability` for tighter caves; decrease `iterations` for rougher walls.
