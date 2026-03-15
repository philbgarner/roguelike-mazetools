# Content Placement — `src/content.ts`

Per-cell content placement system. Visits every grid cell and calls a consumer-supplied callback that decides what to place. No placement logic is baked in — the engine only provides mask accessors, a seeded RNG, and game logic helpers.

---

## Types

### `SolidState`

```ts
type SolidState = "wall" | "floor";
```

### `CellMasks`

Read/write accessors for the dungeon's texture channels.

```ts
interface CellMasks {
  getSolid(x: number, y: number): SolidState;
  setSolid(x: number, y: number, state: SolidState): void;

  /** Raw numeric value — use for custom states beyond "wall"/"floor". */
  getSolidRaw(x: number, y: number): number;
  setSolidRaw(x: number, y: number, value: number): void;

  getRegionId(x: number, y: number): number;
  getDistanceToWall(x: number, y: number): number;

  /** 0 = no hazard; non-zero values are user-defined. */
  getHazard(x: number, y: number): number;
  setHazard(x: number, y: number, value: number): void;
}
```

### `ContentLogic`

Walkability and line-of-sight helpers.

```ts
interface ContentLogic {
  /** Returns true if the cell is not a wall (or the custom isWalkable predicate passes). */
  isWalkable(x: number, y: number): boolean;

  /**
   * Bresenham ray from (x1,y1) to (x2,y2).
   * Blocked by any intermediate cell where !isWalkable.
   * The destination cell is always considered visible.
   */
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean;
}
```

### `ContentRng`

Seeded RNG provided to the callback.

```ts
type ContentRng = {
  next(): number;                        // [0, 1)
  int(min: number, max: number): number; // inclusive both ends
  chance(p: number): boolean;            // true with probability p
};
```

### `ContentCallbackArgs`

Arguments passed to the callback on each cell visit.

```ts
interface ContentCallbackArgs {
  x: number;
  y: number;
  masks: CellMasks;
  logic: ContentLogic;
  rng: ContentRng;
}
```

### `ContentCallback`

```ts
type ContentCallback = (args: ContentCallbackArgs) => void;
```

### `ContentOptions`

```ts
interface ContentOptions {
  callback: ContentCallback;
  seed?: number | string;

  /**
   * Override the default walkability predicate used by isWalkable and hasLineOfSight.
   * Default: getSolid(x, y) !== "wall"
   */
  isWalkable?: (x: number, y: number, masks: CellMasks) => boolean;
}
```

---

## Functions

### `generateContent(dungeon, options)`

```ts
function generateContent(dungeon: DungeonOutputs, options: ContentOptions): void
```

Iterate over every cell in `dungeon` (row-major, top-to-bottom) and call `options.callback` once per cell. Mutates `dungeon.textures.solid` and `dungeon.textures.hazards` in place; marks both as `needsUpdate = true` for Three.js after the pass completes.

Accepts any `DungeonOutputs`-compatible value — both `BspDungeonOutputs` (BSP) and `CellularDungeonOutputs` (cellular) work.

---

## Examples

### Place monsters in rooms, away from walls

```ts
const monsterPositions: { x: number; y: number }[] = [];

generateContent(dungeon, {
  seed: dungeon.seed,
  callback: ({ x, y, masks, rng }) => {
    if (
      masks.getSolid(x, y) === "floor" &&
      masks.getRegionId(x, y) !== 0 &&      // inside a room, not a corridor
      masks.getDistanceToWall(x, y) >= 2 && // not hugging a wall
      rng.chance(0.03)
    ) {
      monsterPositions.push({ x, y });
    }
  },
});
```

### Place hazards with LOS culling

```ts
generateContent(dungeon, {
  seed: dungeon.seed + 1,
  callback: ({ x, y, masks, logic, rng }) => {
    if (masks.getSolid(x, y) === "floor" && rng.chance(0.015)) {
      // Only place if the spawn point has LOS to the room centre
      const room = dungeon.rooms.get(masks.getRegionId(x, y));
      if (room && logic.hasLineOfSight(x, y, room.rect.x + room.rect.w / 2 | 0, room.rect.y + room.rect.h / 2 | 0)) {
        masks.setHazard(x, y, 1);
      }
    }
  },
});
```

### Custom walkability (treat hazard cells as impassable)

```ts
generateContent(dungeon, {
  seed: dungeon.seed,
  isWalkable: (x, y, masks) =>
    masks.getSolid(x, y) === "floor" && masks.getHazard(x, y) === 0,
  callback: ({ x, y, masks, logic }) => {
    // logic.isWalkable now respects hazard cells
  },
});
```

---

## Notes

- The callback args object is **reused** across all cells to avoid per-cell allocation. Do not store a reference to `args` — copy the values you need.
- `rng` state is shared across the entire pass. Call order is row-major (left→right, top→bottom).
- Out-of-bounds coordinates return safe defaults: `getSolid` → `"wall"`, `getRegionId` / `getHazard` / `getDistanceToWall` → `0`.
