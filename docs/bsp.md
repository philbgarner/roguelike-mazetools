# BSP Dungeon Generator — `src/bsp.ts`

Binary space partitioning dungeon generator. Produces clean rectangular rooms connected by L-shaped or straight corridors, with structured room metadata and start/end room selection.

---

## Types

### `DungeonOutputs`

Minimum shape required by `generateContent`, `aStar8`, `computeFov`, and `generateCellularDungeon`.

```ts
type DungeonOutputs = {
  width: number;
  height: number;
  seed: number;
  textures: {
    solid: THREE.DataTexture;         // 255 = wall, 0 = floor
    regionId: THREE.DataTexture;      // room ID per cell (0 = corridor/wall)
    distanceToWall: THREE.DataTexture; // BFS Manhattan distance to nearest wall
    hazards: THREE.DataTexture;       // user-defined hazard values, initially 0
  };
};
```

### `RoomRect`

```ts
type RoomRect = { x: number; y: number; w: number; h: number };
```

### `RoomInfo`

```ts
type RoomInfo = {
  id: number;
  /** Bounding rect of the room (carved area, not the BSP leaf). */
  rect: RoomRect;
  /** Room IDs that share a corridor with this room. */
  connections: number[];
};
```

### `BspDungeonOptions`

```ts
type BspDungeonOptions = {
  width: number;
  height: number;
  seed?: number | string;         // default: 0x12345678

  maxDepth?: number;              // default: 6
  minLeafSize?: number;           // default: 12
  maxLeafSize?: number;           // default: 28
  splitPadding?: number;          // default: 2

  roomPadding?: number;           // default: 1
  minRoomSize?: number;           // default: 5
  maxRoomSize?: number;           // default: 14
  roomFillLeafChance?: number;    // default: 0.08 — chance room fills entire BSP leaf

  corridorWidth?: number;         // default: 1
  corridorStyle?: "straight-or-z"; // only supported style currently
  keepOuterWalls?: boolean;       // default: true
};
```

### `BspDungeonOutputs`

Extends `DungeonOutputs` with room graph data.

```ts
type BspDungeonOutputs = DungeonOutputs & {
  /** Room chosen as the dungeon exit — always has exactly 1 corridor connection. */
  endRoomId: number;
  /** Room furthest from endRoomId — used as the player spawn room. */
  startRoomId: number;
  /**
   * Map from roomId → RoomInfo for every carved room.
   * Rooms are identified by the same integer written into textures.regionId.
   * startRoomId and endRoomId are guaranteed keys.
   */
  rooms: Map<number, RoomInfo>;
};
```

---

## Functions

### `generateBspDungeon(options)`

```ts
function generateBspDungeon(options: BspDungeonOptions): BspDungeonOutputs
```

Generate a BSP dungeon. Throws if `width` or `height` ≤ 2, or `minLeafSize` < 4.

**Algorithm:**

1. Recursively split the grid into BSP leaves, preferring splits along the longer axis.
2. Carve one room inside each leaf (random position within padded bounds).
3. Connect sibling subtrees with L-shaped or straight corridors.
4. Label each room cell with a unique `regionId` (1–255, wrapping).
5. Run BFS from all walls to compute `distanceToWall`.
6. Select `startRoomId` and `endRoomId` by double-BFS (maximises graph diameter).
7. Build the `rooms` adjacency map from the corridor connections.

**Example:**

```ts
const dungeon = generateBspDungeon({
  width: 80,
  height: 60,
  seed: "my-level-1",
});

// Room graph
const shopCandidates = [...dungeon.rooms.values()]
  .filter(r => r.connections.length === 1 && r.id !== dungeon.endRoomId);

// Read solid mask
const solidData = dungeon.textures.solid.image.data as Uint8Array;
const isWall = (x: number, y: number) => solidData[y * dungeon.width + x] !== 0;
```

---

## Notes

- `seed` can be a string or number; strings are hashed with FNV-1a to a uint32.
- `regionId` values in `textures.regionId` are the same integers used as keys in the `rooms` map.
- Corridor cells are floor (`solid = 0`) but have `regionId = 0` (not tagged to any room).
- The `hazards` texture is zeroed on output — populate it via `generateContent`.
- Textures use `THREE.RedFormat` / `THREE.UnsignedByteType` with nearest-filter sampling.
