# mazegen — Engine Reference

Engine-level dungeon generation, pathfinding, spatial utilities, and game-logic primitives for turn-based dungeon crawlers.

---

## Modules

| Module | File | Purpose |
|--------|------|---------|
| [BSP Generator](./bsp.md) | `src/bsp.ts` | Binary space partitioning dungeon generator |
| [Cellular Generator](./cellular.md) | `src/cellular.ts` | Cellular-automata cave generator |
| [Content](./content.md) | `src/content.ts` | Per-cell content placement callback system |
| [A\* Pathfinding](./astar.md) | `src/astar.ts` | 8-directional A\* with octile heuristic |
| [Field of View](./fov.md) | `src/fov.ts` | Recursive shadowcasting FOV |
| [Spatial Queries](./spatial.md) | `src/spatial.ts` | Radius, cone, and line tile queries |
| [Serialization](./serialize.md) | `src/serialize.ts` | Save/load dungeon state to JSON |
| [Status Effects](./effects.md) | `src/effects.ts` | Buff/debuff tick and stack system |
| [Factions](./factions.md) | `src/factions.ts` | Configurable stance registry |
| [Action Middleware](./actions.md) | `src/actions.ts` | Pre-action interceptor pipeline |
| [BSP Helpers](./bsp-helpers.md) | `src/bspHelpers.ts` | `MinHeap<T>` and octile distance |

---

## Dependency Map

```
bspHelpers.ts   (no deps)
    ↑
bsp.ts          → bspHelpers.ts, three
astar.ts        → bspHelpers.ts, bsp.ts
content.ts      → bsp.ts
cellular.ts     → bspHelpers.ts, three
serialize.ts    → bsp.ts, three
fov.ts          (no deps — pure geometry)
spatial.ts      → astar.ts (GridPos only)
effects.ts      (no deps — pure data)
factions.ts     (no deps — pure data)
actions.ts      (no deps — pure middleware)
```

`fov.ts`, `effects.ts`, `factions.ts`, and `actions.ts` have zero internal dependencies and can be consumed standalone without pulling in the dungeon generator or Three.js.

---

## Core Pattern

The engine favours **callbacks over baked-in logic**:

- `generateContent` visits every cell and delegates all decisions to the caller
- `aStar8` exposes `isBlocked` and `cellCost` hooks for runtime overrides
- `computeFov` calls `isOpaque` and `visit` per cell — no global state written
- `tickEffects` returns deltas that the caller applies — the engine never touches actor stats

Every module follows this pattern so consuming games can compose engine pieces without forking the source.

---

## Quick Example

```ts
import { generateBspDungeon } from "./src/bsp";
import { generateContent } from "./src/content";
import { aStar8 } from "./src/astar";
import { computeFov } from "./src/fov";

// 1. Generate geometry
const dungeon = generateBspDungeon({ width: 80, height: 60, seed: 42 });

// 2. Place content (doors, monsters, etc.)
generateContent(dungeon, {
  seed: 42,
  callback: ({ x, y, masks, logic, rng }) => {
    if (masks.getSolid(x, y) === "floor" && rng.chance(0.02)) {
      masks.setHazard(x, y, 1);
    }
  },
});

// 3. Pathfind
const path = aStar8(
  dungeon,
  (x, y) => dungeon.textures.solid.image.data[y * dungeon.width + x] === 0,
  { x: 5, y: 5 },
  { x: 40, y: 30 },
);

// 4. Compute FOV
const W = dungeon.width;
const solidData = dungeon.textures.solid.image.data as Uint8Array;
computeFov(5, 5, {
  isOpaque: (x, y) =>
    x < 0 || y < 0 || x >= W || y >= dungeon.height || solidData[y * W + x] !== 0,
  visit: (x, y) => { /* mark visible */ },
  radius: 10,
});
```
