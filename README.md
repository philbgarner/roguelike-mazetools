# mazegen

Engine-level dungeon generation, pathfinding, and spatial utilities for turn-based dungeon crawlers.

**Full API reference → [docs/index.md](./docs/index.md)**

The engine is designed around callbacks over baked-in logic: generators produce texture data, content placement visits every cell and delegates all decisions to the caller, pathfinding exposes walkability and cost hooks, and FOV calls `isOpaque`/`visit` per cell without writing any global state. This lets consuming games compose engine pieces independently without forking the source.

---

## Modules

| Module | File | Summary |
|--------|------|---------|
| [BSP Generator](./docs/bsp.md) | `src/bsp.ts` | Rectangular rooms + corridors, room graph, start/end selection |
| [Cellular Generator](./docs/cellular.md) | `src/cellular.ts` | Organic cave layouts via cellular automata |
| [Content](./docs/content.md) | `src/content.ts` | Per-cell callback, mask accessors, seeded RNG, LOS helper |
| [A\* Pathfinding](./docs/astar.md) | `src/astar.ts` | 8-directional A\* with octile heuristic, runtime blockers, cell costs |
| [Field of View](./docs/fov.md) | `src/fov.ts` | Recursive shadowcasting, O(r²), no heap allocations |
| [Spatial Queries](./docs/spatial.md) | `src/spatial.ts` | Radius (chebyshev/euclidean/manhattan), cone, Bresenham line |
| [Serialization](./docs/serialize.md) | `src/serialize.ts` | Save/load dungeon state to JSON via Base64-encoded textures |
| [Status Effects](./docs/effects.md) | `src/effects.ts` | Buff/debuff tick, stack modes, pure deltas |
| [Factions](./docs/factions.md) | `src/factions.ts` | Directional stance registry (hostile/neutral/friendly) |
| [Action Middleware](./docs/actions.md) | `src/actions.ts` | Pre-action interceptor pipeline (trap triggers, vetoes) |
| [BSP Helpers](./docs/bsp-helpers.md) | `src/bspHelpers.ts` | `MinHeap<T>`, octile distance heuristic |

---

## Quick Start

```ts
import { generateBspDungeon } from "./src/bsp";
import { generateContent } from "./src/content";
import { aStar8 } from "./src/astar";
import { computeFov } from "./src/fov";

// 1. Generate geometry
const dungeon = generateBspDungeon({ width: 80, height: 60, seed: 42 });

// 2. Place content
generateContent(dungeon, {
  seed: 42,
  callback: ({ x, y, masks, rng }) => {
    if (masks.getSolid(x, y) === "floor" && rng.chance(0.02)) {
      masks.setHazard(x, y, 1);
    }
  },
});

// 3. Pathfind
const solidData = dungeon.textures.solid.image.data as Uint8Array;
const W = dungeon.width;
const path = aStar8(
  dungeon,
  (x, y) => solidData[y * W + x] === 0,
  dungeon.rooms.get(dungeon.startRoomId)!.rect,
  dungeon.rooms.get(dungeon.endRoomId)!.rect,
);

// 4. Compute FOV
computeFov(player.x, player.y, {
  isOpaque: (x, y) =>
    x < 0 || y < 0 || x >= W || y >= dungeon.height || solidData[y * W + x] !== 0,
  visit: (x, y) => { visibilityMask[y * W + x] = 1; },
  radius: 12,
});
```

See [docs/index.md](./docs/index.md) for the full reference including the cellular generator, serialization, status effects, factions, and action middleware.
