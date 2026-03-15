# mazegen

Engine-level dungeon generation, pathfinding, and spatial utilities for turn-based dungeon crawlers.

## Current API

| File | Exports |
|------|---------|
| `src/bsp.ts` | `generateBspDungeon(options)` → `BspDungeonOutputs` |
| `src/content.ts` | `generateContent(dungeon, options)` — per-cell callback, `ContentLogic`, `CellMasks` |
| `src/astar.ts` | `aStar8(dungeon, isWalkable, start, goal, opts)` → `AStarPath` |
| `src/bspHelpers.ts` | `MinHeap<T>`, `octile(ax, ay, bx, by)` |

The existing design centres on **callbacks over baked-in logic**: `generateContent` visits every cell and lets the consumer decide what goes there; `aStar8` exposes `isBlocked` and `cellCost` hooks; `ContentLogic.hasLineOfSight` is composable with any walkability predicate. Every new feature below follows this pattern.

---

## Implementation Plan

All new files live inside `src/`. No external runtime dependencies beyond what is already present.

---

### 1. Field of View — `src/fov.ts`

`hasLineOfSight` (Bresenham) already exists in `ContentLogic` but only answers point-to-point questions. A full FOV computation — which cells are visible from an origin — is required for fog-of-war, hiding monsters outside view range, and revealed-map tracking.

**Algorithm:** Recursive shadowcasting (Björn Bergström's classic, octants). Produces correct penumbra handling and runs in O(r²) with no heap allocations.

```ts
export type FovOptions = {
  /**
   * Return true if the cell blocks light (usually: getSolid === "wall").
   * Called with every candidate cell during octant sweep.
   */
  isOpaque: (x: number, y: number) => boolean;

  /**
   * Called once per visible cell, including the origin itself.
   * Use this to write to a visibility mask, reveal map tiles, etc.
   */
  visit: (x: number, y: number) => void;

  /** Chebyshev radius. Cells beyond this distance are never visited. Default: unlimited. */
  radius?: number;
};

/**
 * Compute the set of cells visible from (originX, originY) using recursive
 * shadowcasting across all 8 octants.
 *
 * Example:
 *   computeFov(px, py, {
 *     isOpaque: (x, y) => masks.getSolid(x, y) === "wall",
 *     visit: (x, y) => visibilityMask[y * W + x] = 1,
 *     radius: 12,
 *   });
 */
export function computeFov(
  originX: number,
  originY: number,
  options: FovOptions,
): void
```

**Visibility mask helper** (convenience, not required):

```ts
/**
 * Allocate a zeroed Uint8Array of size width×height.
 * Pass its `set` method as `visit` then read results back.
 * Kept separate so callers that already maintain their own mask
 * don't pay the allocation cost.
 */
export function createVisibilityMask(width: number, height: number): Uint8Array
```

**Integration point:** `ContentLogic` gains an optional `computeFov` method in a future patch to `content.ts`, but `fov.ts` itself has zero imports from other engine files so it can be used standalone.

---

### 2. Spatial Queries — `src/spatial.ts`

AoE spells, screaming monsters, explosion radii, and patrol zones all need "which cells are within X of Y" answered efficiently. These are pure geometric functions with no dungeon state required.

```ts
import type { GridPos } from "./astar";

export type SpatialShape = "chebyshev" | "euclidean" | "manhattan";

/**
 * Returns all grid positions within `radius` of (cx, cy) using the chosen metric.
 * Does NOT perform bounds-checking — callers are responsible for clamping.
 *
 * "chebyshev"  — square neighbourhood, the standard roguelike "range"
 * "euclidean"  — circular neighbourhood
 * "manhattan"  — diamond neighbourhood
 */
export function tilesInRadius(
  cx: number,
  cy: number,
  radius: number,
  shape?: SpatialShape,     // default: "chebyshev"
): GridPos[]

/**
 * Returns all grid positions in a cone originating at (ox, oy).
 * directionRad: angle in radians (0 = east, increases counter-clockwise).
 * halfAngle: half-width of the cone in radians (e.g. Math.PI/4 for a 90° cone).
 * range: Chebyshev reach.
 */
export function tilesInCone(
  ox: number,
  oy: number,
  directionRad: number,
  halfAngle: number,
  range: number,
): GridPos[]

/**
 * Returns all grid cells intersected by a Bresenham line from `from` to `to`,
 * inclusive of both endpoints. Useful for projectile paths and area scans.
 */
export function tilesInLine(from: GridPos, to: GridPos): GridPos[]

/**
 * Callback variant of tilesInRadius — avoids allocating an array.
 * Calls visit(x, y) for each cell; return false from visit to stop early.
 */
export function visitTilesInRadius(
  cx: number,
  cy: number,
  radius: number,
  visit: (x: number, y: number) => boolean | void,
  shape?: SpatialShape,
): void
```

**Integration:** `aStar8`'s `cellCost` hook can be populated from a spatial query result (e.g. discourage cells inside an AoE), keeping pathfinding and spatial logic orthogonal.

---

### 3. Room Metadata — extend `src/bsp.ts`

The BSP generator already builds a full adjacency graph internally but discards it after choosing `startRoomId`/`endRoomId`. Exposing structured room data lets the consuming game tag rooms (shop, boss, secret) without re-deriving graph topology.

**New types added to `bsp.ts`:**

```ts
export type RoomRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RoomInfo = {
  id: number;
  /** Bounding rect of the room (carved area, not the BSP leaf). */
  rect: RoomRect;
  /** Room IDs that share a corridor with this room. */
  connections: number[];
};
```

**`BspDungeonOutputs` gains one new field:**

```ts
/**
 * Map from roomId → RoomInfo for every carved room.
 * Rooms are identified by the same integer written into textures.regionId.
 * startRoomId and endRoomId are guaranteed to be keys in this map.
 */
rooms: Map<number, RoomInfo>;
```

No new public functions — the map is populated during `generateBspDungeon` using the adjacency data already computed internally.

**Usage pattern:**

```ts
const shopCandidates = [...dungeon.rooms.values()]
  .filter(r => r.connections.length === 1 && r.id !== dungeon.endRoomId);
```

---

### 4. Additional Generator — `src/cellular.ts`

BSP produces clean rectangular rooms; many dungeon themes (caves, ruins, organic spaces) need irregular, connected open areas. Cellular automata is the standard complementary algorithm.

```ts
export type CellularOptions = {
  width: number;
  height: number;
  seed?: number | string;

  /** Initial wall fill probability. Default: 0.45 */
  fillProbability?: number;
  /** Number of smoothing passes. Default: 5 */
  iterations?: number;
  /**
   * A cell becomes wall if it has >= this many wall neighbours (Moore neighbourhood).
   * Default: 5
   */
  birthThreshold?: number;
  /**
   * A wall cell survives if it has >= this many wall neighbours. Default: 4
   */
  survivalThreshold?: number;

  keepOuterWalls?: boolean;
};

export type CellularDungeonOutputs = {
  width: number;
  height: number;
  seed: number;
  /**
   * The largest connected floor region, chosen as the playable area.
   * Cells outside it are re-solidified so the output is always fully connected.
   */
  textures: {
    solid: THREE.DataTexture;
    /** Region flood-fill ID per cell — 0 = wall, 1+ = connected region index. */
    regionId: THREE.DataTexture;
    distanceToWall: THREE.DataTexture;
    hazards: THREE.DataTexture;
  };
  /** Floor cell closest to the centroid of the largest region — good spawn point. */
  startPos: GridPos;
};

/**
 * Generate a cellular-automata cave dungeon.
 * Unlike BSP, there is no explicit room graph; use regionId for flood-fill regions.
 * Pass the output directly to generateContent() as it shares the same texture layout.
 */
export function generateCellularDungeon(options: CellularOptions): CellularDungeonOutputs
```

**`generateContent` compatibility:** `CellularDungeonOutputs` satisfies `BspDungeonOutputs` structurally (same `textures` shape, same `width`/`height`) so all existing content, A\*, and FOV code accepts it without changes. A shared `DungeonOutputs` base type will be extracted to `src/bsp.ts` to make this explicit:

```ts
/** Minimum shape required by generateContent, aStar8, and computeFov. */
export type DungeonOutputs = {
  width: number;
  height: number;
  seed: number;
  textures: {
    solid: THREE.DataTexture;
    regionId: THREE.DataTexture;
    distanceToWall: THREE.DataTexture;
    hazards: THREE.DataTexture;
  };
};
```

---

### 5. Serialization — `src/serialize.ts`

Dungeon state must survive page reloads, be written to localStorage, and be rehydrated without re-running generation. The textures hold all mutable state (solid, hazards); the rest is deterministic from the seed.

```ts
import type { BspDungeonOptions, BspDungeonOutputs } from "./bsp";

/**
 * Plain, JSON-safe snapshot of a dungeon's mutable texture data.
 * Immutable generation inputs are stored so the dungeon can be fully
 * reconstructed without the original options object.
 */
export type SerializedDungeon = {
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

/**
 * Snapshot all mutable texture data into a JSON-safe object.
 * Call after generateContent() to capture placed content (doors, hazards, etc.).
 */
export function serializeDungeon(dungeon: BspDungeonOutputs): SerializedDungeon

/**
 * Reconstruct a BspDungeonOutputs from a snapshot.
 * The returned object is fully usable with generateContent, aStar8, computeFov, etc.
 * The `rooms` map is NOT restored (it requires re-running BSP); pass the original
 * BspDungeonOptions to rehydrateDungeon() if room graph data is needed.
 */
export function deserializeDungeon(data: SerializedDungeon): BspDungeonOutputs

/**
 * Full rehydration: deserializes texture data AND reconstructs the room graph
 * by re-running BSP with the stored seed. Rooms will be identical because
 * generation is deterministic.
 */
export function rehydrateDungeon(
  data: SerializedDungeon,
  originalOptions: Omit<BspDungeonOptions, "seed">,
): BspDungeonOutputs
```

**Storage helper** (thin convenience wrapper, no opinion on storage backend):

```ts
export function dungeonToJson(dungeon: BspDungeonOutputs): string
export function dungeonFromJson(json: string): BspDungeonOutputs
```

---

### 6. Status Effects — `src/effects.ts`

Active buffs and debuffs are game-state, but their **data shape and tick semantics** belong in the engine so every consuming game doesn't re-invent poison stacking or duration math.

```ts
export type EffectId = string;

export type EffectTick = {
  /**
   * Called at the start of each affected actor's turn (or on each world tick).
   * Return a partial update to apply to the host, or undefined for no change.
   * The engine does not interpret the returned delta — the game applies it.
   */
  onTick?: (effect: ActiveEffect, stepIndex: number) => EffectDelta | undefined;
  /** Called when stepsRemaining reaches 0. */
  onExpire?: (effect: ActiveEffect) => EffectDelta | undefined;
};

export type EffectDelta = Record<string, number>;

export type ActiveEffect = {
  id: EffectId;
  /** Display name. */
  name: string;
  stepsRemaining: number;
  /** Arbitrary key-value payload (damage per tick, stat bonuses, etc.). */
  data: Record<string, number>;
  ticks: EffectTick;
};

/**
 * Advance all effects by one step. Returns updated effects list and
 * an array of deltas to apply (from onTick + onExpire for expired entries).
 * Pure function — does not mutate input.
 */
export function tickEffects(
  effects: ActiveEffect[],
  stepIndex: number,
): {
  updatedEffects: ActiveEffect[];
  deltas: EffectDelta[];
}

/**
 * Apply a new effect to a list, merging stacks if an effect with the same id
 * already exists. Stacking behaviour is controlled by StackMode.
 */
export type StackMode = "refresh" | "extend" | "ignore" | "stack";

export function applyEffect(
  effects: ActiveEffect[],
  incoming: ActiveEffect,
  stackMode?: StackMode,  // default: "refresh"
): ActiveEffect[]
```

**Integration:** The consuming game holds `ActiveEffect[]` on each actor. `tickEffects` is called from the turn scheduler's `onTimeAdvanced` hook (already present in the game's turn system) and the returned `deltas` are applied via the game's own stat system — the engine never touches actor stats directly.

---

### 7. Factions & Allegiance — `src/factions.ts`

Hard-coded monster-vs-player logic belongs in the game, but a reusable **faction registry** with configurable stance rules lets the engine answer "can A attack B?" without knowing actor types.

```ts
export type FactionId = string;

export type FactionStance = "hostile" | "neutral" | "friendly";

export type FactionRegistry = {
  /**
   * Register a relationship. Relationships are directional:
   * setStance("orc", "player", "hostile") does not automatically
   * set player→orc. Call symmetrically if needed.
   */
  setStance(from: FactionId, to: FactionId, stance: FactionStance): void;

  /** Returns the stance of `from` toward `to`. Default: "neutral". */
  getStance(from: FactionId, to: FactionId): FactionStance;

  /** Returns true if `from` treats `to` as hostile. */
  isHostile(from: FactionId, to: FactionId): boolean;
};

/** Create a new empty faction registry. */
export function createFactionRegistry(): FactionRegistry

/**
 * Convenience: build a registry from a stance table.
 *
 * Example:
 *   createFactionRegistryFromTable([
 *     ["player", "monster", "hostile"],
 *     ["monster", "player", "hostile"],
 *     ["merchant", "player", "neutral"],
 *   ])
 */
export function createFactionRegistryFromTable(
  table: Array<[FactionId, FactionId, FactionStance]>,
): FactionRegistry
```

**Integration:** The consuming game passes `factionRegistry.isHostile(actor.faction, target.faction)` as a guard inside its action validation middleware (see §8). The registry itself is a plain object with no ties to dungeon state.

---

### 8. Action Validation Middleware — `src/actions.ts`

The turn system already calls `commitPlayerAction` synchronously. Adding a middleware layer lets the game register pre-action interceptors (trap triggers, door auto-open, teleport pads, action vetoes) without forking the engine commit path.

```ts
export type ActionKind = string;

export type ActionContext<TAction = { kind: ActionKind }, TActor = unknown, TState = unknown> = {
  action: TAction;
  actorId: string;
  actor: TActor;
  state: TState;
};

export type ActionMiddlewareResult<TState> =
  | { pass: true; state?: TState }       // allow, optionally with side-effected state
  | { pass: false; reason?: string };    // veto

export type ActionMiddleware<TAction = { kind: ActionKind }, TActor = unknown, TState = unknown> = (
  ctx: ActionContext<TAction, TActor, TState>,
  next: () => ActionMiddlewareResult<TState>,
) => ActionMiddlewareResult<TState>;

export type ActionPipeline<TAction, TActor, TState> = {
  /** Append a middleware. Middlewares run in registration order. */
  use(middleware: ActionMiddleware<TAction, TActor, TState>): void;

  /**
   * Run all registered middlewares for the given context.
   * Returns the final result after all middlewares have run (or the first veto).
   */
  run(ctx: ActionContext<TAction, TActor, TState>): ActionMiddlewareResult<TState>;
};

/** Create a new empty action pipeline. */
export function createActionPipeline<
  TAction = { kind: ActionKind },
  TActor = unknown,
  TState = unknown,
>(): ActionPipeline<TAction, TActor, TState>
```

**Integration pattern (consuming game):**

```ts
const pipeline = createActionPipeline<TurnAction, PlayerActor, TurnSystemState>();

// Trap middleware — fires a trap when player steps on a hazard cell
pipeline.use((ctx, next) => {
  if (ctx.action.kind === "move") {
    const hazard = masks.getHazard(ctx.action.x, ctx.action.y);
    if (hazard !== 0) triggerTrap(hazard, ctx.actorId);
  }
  return next();
});

// Replace direct commitPlayerAction calls:
const result = pipeline.run({ action, actorId: "player", actor, state: turnState });
if (result.pass) setTurnState(commitPlayerAction(result.state ?? turnState, deps, action));
```

---

## Dependency Map

```
bspHelpers.ts   (no deps)
    ↑
bsp.ts          → bspHelpers.ts, three
astar.ts        → bspHelpers.ts, bsp.ts
content.ts      → bsp.ts
fov.ts          (no deps — pure geometry)
spatial.ts      → astar.ts (GridPos only)
cellular.ts     → bspHelpers.ts, three
serialize.ts    → bsp.ts
effects.ts      (no deps — pure data)
factions.ts     (no deps — pure data)
actions.ts      (no deps — pure middleware)
```

`fov.ts`, `effects.ts`, `factions.ts`, and `actions.ts` have zero internal dependencies and can be consumed individually without pulling in the dungeon generator or Three.js.

---

## Implementation Order

| Priority | File | Rationale |
|----------|------|-----------|
| 1 | `src/fov.ts` | Blocks fog-of-war, monster visibility, revealed-map — most game features depend on it |
| 2 | `src/spatial.ts` | Unlocks AoE, patrol zones, ranged splash — simple pure functions |
| 3 | Room metadata in `src/bsp.ts` | Low-cost change (data already computed internally), high downstream value |
| 4 | `DungeonOutputs` base type in `src/bsp.ts` | Required for `cellular.ts` compatibility |
| 5 | `src/cellular.ts` | Adds a second generator archetype (organic caves) |
| 6 | `src/serialize.ts` | Enables save/load; depends on stable texture layout |
| 7 | `src/effects.ts` | Pure data layer; consuming game can adopt incrementally |
| 8 | `src/factions.ts` | Pure data layer; consuming game can adopt incrementally |
| 9 | `src/actions.ts` | Middleware pattern; consuming game adopts when ready to centralise validation |
