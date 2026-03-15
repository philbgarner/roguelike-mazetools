# Serialization — `src/serialize.ts`

Save and restore BSP dungeon state to/from JSON-safe plain objects. Textures hold all mutable state (solid mask, hazards, etc.); the BSP room graph is reconstructed deterministically from the seed when needed.

---

## Types

### `SerializedDungeon`

```ts
type SerializedDungeon = {
  version: 1;
  width: number;
  height: number;
  seed: number;
  startRoomId: number;
  endRoomId: number;
  /** Base64-encoded Uint8Array for each texture channel. */
  solid: string;
  regionId: string;
  distanceToWall: string;
  hazards: string;
};
```

---

## Functions

### `serializeDungeon(dungeon)`

```ts
function serializeDungeon(dungeon: BspDungeonOutputs): SerializedDungeon
```

Snapshot all mutable texture data into a JSON-safe object. Call **after** `generateContent()` to capture placed content (doors, hazards, etc.).

### `deserializeDungeon(data)`

```ts
function deserializeDungeon(data: SerializedDungeon): BspDungeonOutputs
```

Reconstruct a `BspDungeonOutputs` from a snapshot. The returned object is fully usable with `generateContent`, `aStar8`, `computeFov`, etc. The `rooms` map is **empty** — use `rehydrateDungeon()` if room graph data is needed.

### `rehydrateDungeon(data, originalOptions)`

```ts
function rehydrateDungeon(
  data: SerializedDungeon,
  originalOptions: Omit<BspDungeonOptions, "seed">,
): BspDungeonOutputs
```

Full rehydration: re-runs BSP with the stored seed (recovering the `rooms` map), then overwrites texture data with the serialized post-content state. Rooms are identical because generation is deterministic.

### `dungeonToJson(dungeon)`

```ts
function dungeonToJson(dungeon: BspDungeonOutputs): string
```

Convenience: serialize a dungeon to a JSON string (`JSON.stringify(serializeDungeon(dungeon))`).

### `dungeonFromJson(json)`

```ts
function dungeonFromJson(json: string): BspDungeonOutputs
```

Convenience: deserialize from a JSON string. The `rooms` map will be empty; use `rehydrateDungeon()` for full restoration.

---

## Examples

### Save to localStorage

```ts
import { dungeonToJson } from "./src/serialize";

// After generateContent():
localStorage.setItem("saved_dungeon", dungeonToJson(dungeon));
```

### Restore (texture state only)

```ts
import { dungeonFromJson } from "./src/serialize";

const saved = localStorage.getItem("saved_dungeon");
if (saved) {
  const dungeon = dungeonFromJson(saved);
  // dungeon.rooms is empty — only texture data is restored
}
```

### Full restore (including room graph)

```ts
import { rehydrateDungeon } from "./src/serialize";
import type { SerializedDungeon } from "./src/serialize";

const data: SerializedDungeon = JSON.parse(localStorage.getItem("saved_dungeon")!);

const dungeon = rehydrateDungeon(data, {
  width: 80,
  height: 60,
  maxDepth: 6,
  // ...all options except seed (seed is stored in SerializedDungeon)
});

// dungeon.rooms is populated, texture data matches post-content state
```

### Round-trip validation

```ts
import { serializeDungeon, deserializeDungeon } from "./src/serialize";

const snapshot = serializeDungeon(dungeon);
const restored = deserializeDungeon(snapshot);

// Both use identical texture data
console.assert(
  (restored.textures.solid.image.data as Uint8Array)[0] ===
  (dungeon.textures.solid.image.data as Uint8Array)[0]
);
```

---

## Notes

- Texture data is Base64-encoded using `btoa`/`atob` — available in all modern browsers and Node.js ≥ 16.
- `deserializeDungeon` skips BSP re-running and is faster than `rehydrateDungeon`. Use it when you don't need room metadata (e.g. rendering only).
- `serializeDungeon` captures the texture state at call time. Call it after all `generateContent` passes have run to include placed hazards and modified solid cells.
- Only `BspDungeonOutputs` is supported for serialization. `CellularDungeonOutputs` does not have a serialization function yet.
