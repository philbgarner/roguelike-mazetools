# Secret Passages — Implementation Prompt

## Context

This is the **mazegen** roguelike dungeon engine (TypeScript + React + Three.js).
The codebase uses a BSP dungeon generator, an 8-dir A* pathfinder, and a
priority-queue turn system (RogueBasin-style absolute timestamps).

Key files:
- 'src/examples/hidden/Hidden.tsx` - Example demonstrating the usage and features of the hidden passages code.
- `src/content.ts` — dungeon content generation (objects, mobiles, RNG helpers)
- `src/astar.ts` — `aStar8(dungeon, isWalkable, start, goal, opts)` — 8-dir A*
- `src/turn/turnSystem.ts` — `TurnSystemDeps`, `commitPlayerAction`, `tickUntilPlayer`
- `src/turn/turnTypes.ts` — `TurnAction`, `TurnActionKind`, `ActorBase`
- `src/turn/actionCosts.ts` — `BASE_TIME=100`, `actionDelay(speed, action)`
- `src/turn/playerAutoWalk.ts` — auto-walk step-loop pattern (model for passage traversal)
- `src/bsp.ts` — `maskToDataTextureR8` helper, `DungeonOutputs.textures`
- `src/rendering/PerspectiveDungeonView.tsx` — main 3-D canvas, receives per-cell mask data
- `src/rendering/InstancedTileMesh.tsx` — floor/wall/ceiling mesh with highlight overlay uniform

### Rendering mask conventions

All spatial masks are `Uint8Array(width × height)`, row-major (`idx = y * W + x`), backed
by a `THREE.DataTexture` created via `maskToDataTextureR8` (RedFormat, UnsignedByteType,
NearestFilter). After any write, set `texture.needsUpdate = true` to upload to GPU.

The existing **highlight mask** (`Uint8Array`, values 0–3) demonstrates the end-to-end
pattern: it is created in the game component, stamped each turn, and passed through
`PerspectiveDungeonView` → `InstancedTileMesh` as a uniform, where the fragment shader
reads the per-cell value and blends an overlay effect.

---

## Design Decisions

1. **Player-only** — monsters, NPCs, and merchant wagons cannot use secret passages.
2. **Lever/button-activated** — each passage has an `enabled: boolean` state.
   Only enabled passages can be entered. Levers/buttons are standard `interact` objects.
3. **Step-by-step animation** — entering a passage does NOT teleport the player.
   Instead, a traversal state (modelled on `AutoWalkState`) drives the player one
   cell at a time through `passage.cells`, committing one standard `move` action
   per cell. This is handled by the same `useEffect` step-loop that drives auto-walk.
   The time cost is therefore naturally correct: each step costs one move-tick, and
   monsters advance in lockstep between each player step.
   This useEffect will live inside the src/examples/hidden/Hidden.tsx file.
4. **Hidden passages mask** — a `Uint8Array(W × H)` runtime mask (separate from the
   static dungeon textures, managed in the game component like `runtimeRef`) encodes
   passage visibility per cell. This drives both the 3-D renderer (shader overlay) and
   the minimap cyan line.
5. **Visual** — passage cells are shown as a cyan line on the minimap; the 3-D view
   gets a subtle passage-wall tint when the passage is enabled.

---

## What Needs to Be Built

### 1. `ContentHiddenPassages` interface — `src/content.ts`

Fill in the stub at line 35:

```ts
export interface HiddenPassage {
  /** Unique id within this dungeon floor. */
  id: number;
  /** Entry cell (floor cell adjacent to the tunnel entrance). */
  start: { x: number; y: number };
  /** Exit cell (floor cell at the far end of the tunnel). */
  end: { x: number; y: number };
  /**
   * Ordered list of cells from start to end (inclusive of both endpoints).
   * These are the wall cells the player walks through during traversal.
   * Length drives the time cost.
   */
  cells: Array<{ x: number; y: number }>;
  /** Whether the passage can currently be used. Toggled by lever/button. */
  enabled: boolean;
}

export interface ContentHiddenPassages {
  passages: HiddenPassage[];
}
```

Also add `hiddenPassages: ContentHiddenPassages` to `ContentOutputs`.

---

### 2. `generateHiddenPassages` — new function in `src/content.ts`

```ts
export function generateHiddenPassages(
  dungeon: DungeonOutputs,
  rng: ContentRng,
  count?: number,    // default: 1–2 passages per dungeon
): ContentHiddenPassages
```

**Algorithm:**

1. Collect wall cells that have floor neighbours in at least two different region IDs
   (use `masks.getRegionId` to identify distinct rooms on opposite sides).
2. For each candidate, trace a straight (or L-shaped) path of wall cells connecting
   the two adjacent floor cells. The path must stay entirely inside wall cells.  The candidate start points should be near to the end room id while leading to an area far from end room id.  This will help make the maze shorter to walk, because you can take the shortcuts.
3. Pick `count` candidates randomly (favour shorter tunnels, max ~8 wall cells).
4. `start` and `end` are the floor cells at each mouth; `cells` is the wall-only
   interior segment between them (start and end inclusive).
5. Return with `enabled: false`. Do **not** modify the solid mask.

---

### 3. Hidden passages mask — new runtime mask

Create `src/rendering/hiddenPassagesMask.ts`:

```ts
/**
 * Per-cell byte values for the hidden passages mask:
 *   0 = no passage
 *   1 = passage cell, disabled (locked, not yet usable)
 *   2 = passage cell, enabled (active, enterable by player)
 */
export const PASSAGE_NONE     = 0;
export const PASSAGE_DISABLED = 1;
export const PASSAGE_ENABLED  = 2;

/**
 * Write all cells of a passage into the mask.
 * Call with PASSAGE_NONE to erase.
 */
export function stampPassageToMask(
  mask: Uint8Array,
  width: number,
  passage: HiddenPassage,
  value: 0 | 1 | 2,
): void {
  for (const cell of passage.cells) {
    mask[cell.y * width + cell.x] = value;
  }
}

/**
 * Enable a passage in the mask (stamp with PASSAGE_ENABLED).
 */
export function enablePassageInMask(
  mask: Uint8Array,
  width: number,
  passage: HiddenPassage,
): void {
  stampPassageToMask(mask, width, passage, PASSAGE_ENABLED);
}

/**
 * Disable a passage in the mask (stamp with PASSAGE_DISABLED).
 */
export function disablePassageInMask(
  mask: Uint8Array,
  width: number,
  passage: HiddenPassage,
): void {
  stampPassageToMask(mask, width, passage, PASSAGE_DISABLED);
}

/**
 * Build the initial mask from a full ContentHiddenPassages object.
 * All passages start disabled.
 */
export function buildPassageMask(
  width: number,
  height: number,
  hiddenPassages: ContentHiddenPassages,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const passage of hiddenPassages.passages) {
    stampPassageToMask(mask, width, passage, PASSAGE_DISABLED);
  }
  return mask;
}
```

In the game component:
- Allocate `passageMaskRef = useRef(buildPassageMask(W, H, content.hiddenPassages))`.
- Create a `THREE.DataTexture` from it via `maskToDataTextureR8` (same as other masks).
- Pass `passageMaskRef.current` + its `DataTexture` through `PerspectiveDungeonView`
  as a new `passageMask` prop.
- After toggling a passage (lever interact), call `enablePassageInMask` /
  `disablePassageInMask`, then set `passageTex.needsUpdate = true`.

---

### 4. Shader integration — `src/rendering/InstancedTileMesh.tsx`

Add `passageMask` as a new uniform (`sampler2D uPassageMask`) alongside the existing
highlight mask uniform. In the fragment shader, sample the passage mask at the cell's
UV:

```glsl
float passageVal = texture2D(uPassageMask, vCellUV).r * 255.0;
// 1.0 = disabled (faint cyan tint to hint passage exists but is locked)
// 2.0 = enabled  (brighter cyan tint — passage is open)
if (passageVal > 1.5) {
  finalColor = mix(finalColor, vec3(0.0, 0.9, 0.9), 0.35);
} else if (passageVal > 0.5) {
  finalColor = mix(finalColor, vec3(0.0, 0.4, 0.5), 0.2);
}
```

Exact blend amounts can be tuned; the key point is that enabled passages are visibly
distinct from disabled ones, giving the player feedback when the lever is pulled.

---

### 5. Traversal state — modelled on `AutoWalkState`

Create `src/turn/passageTraversal.ts`:

```ts
export type PassageTraversalState =
  | { kind: "idle" }
  | {
      kind: "active";
      passageId: number;
      /** Remaining cells to walk (index 0 = next cell to step into). */
      remainingCells: Array<{ x: number; y: number }>;
    };

/** Begin a traversal from passage.start (or .end if player is at end). */
export function startPassageTraversal(
  passage: HiddenPassage,
  playerPos: { x: number; y: number },
): PassageTraversalState | null {
  // Determine direction based on player position
  const fromStart =
    passage.start.x === playerPos.x && passage.start.y === playerPos.y;
  const fromEnd =
    passage.end.x === playerPos.x && passage.end.y === playerPos.y;
  if (!fromStart && !fromEnd) return null;
  const cells = fromStart ? passage.cells.slice(1) : [...passage.cells].reverse().slice(1);
  if (cells.length === 0) return null;
  return { kind: "active", passageId: passage.id, remainingCells: cells };
}

/** Consume the next step. Returns the next cell and updated state. */
export function consumePassageStep(state: PassageTraversalState & { kind: "active" }): {
  cell: { x: number; y: number };
  next: PassageTraversalState;
} {
  const [cell, ...rest] = state.remainingCells;
  const next: PassageTraversalState =
    rest.length > 0
      ? { kind: "active", passageId: state.passageId, remainingCells: rest }
      : { kind: "idle" };
  return { cell, next };
}

export function cancelPassageTraversal(): PassageTraversalState {
  return { kind: "idle" };
}
```

---

### 6. Step-loop integration in the game component

The existing `useEffect` that drives auto-walk fires whenever
`[turnState.awaitingPlayerInput, turnState.actors, autoWalk, ...]` changes.
Extend it to also handle passage traversal:

```ts
// In the step-loop useEffect (runs after each player turn):
if (!turnState.awaitingPlayerInput) return;

// Passage traversal takes priority over auto-walk.
if (passageTraversal.kind === "active") {
  const { cell, next } = consumePassageStep(passageTraversal);
  setPassageTraversal(next);
  const player = turnState.actors[turnState.playerId];
  const dx = cell.x - player.x;
  const dy = cell.y - player.y;
  // commitPlayerAction with a standard move — monsters tick between each step.
  setTurnState(prev =>
    commitPlayerAction(prev, deps, { kind: "move", dx, dy })
  );
  return;
}

// ... existing auto-walk logic ...
```

**Walkability during traversal:** while `passageTraversal.kind === "active"`, the
`isWalkable` callback passed to `TurnSystemDeps` must allow the current passage cells.
The cleanest approach: when building `deps` inside the component, check
`passageTraversalRef.current` and whitelist those cell coordinates. Since `deps` is
rebuilt via `useMemo` on `[turnState, passageTraversal, ...]`, this happens automatically.

**No new `TurnActionKind` needed** — traversal is just a series of regular `move` actions,
so the turn system needs no changes. The `use_passage` action kind from the original draft
is **removed**.

---

### 7. Lever interaction

When the player interacts with a lever whose `meta.passageId` matches a passage:

1. Find the passage in `passagesRef.current` (a `useRef` holding the mutable array).
2. Flip `passage.enabled`.
3. Call `enablePassageInMask` or `disablePassageInMask` on `passageMaskRef.current`.
4. Set `passageTex.needsUpdate = true`.

The passages ref must be declared before `turnState` useState so it is available in
the `buildDeps` closure.

---

### 8. Minimap

Feed passage cells into the minimap canvas draw loop:

```ts
// After drawing floor/wall cells:
for (const passage of hiddenPassages.passages) {
  const color = passage.enabled ? "#00ffff" : "#006666";
  ctx.fillStyle = color;
  for (const cell of passage.cells) {
    ctx.fillRect(cell.x * cellPx, cell.y * cellPx, cellPx, cellPx);
  }
}
```

---

## Integration Checklist

- [ ] Fill in `ContentHiddenPassages` + `HiddenPassage` in `content.ts`
- [ ] Add `hiddenPassages` to `ContentOutputs`
- [ ] Implement `generateHiddenPassages` in `content.ts`
- [ ] Create `src/rendering/hiddenPassagesMask.ts` with stamp/enable/disable/build helpers
- [ ] Allocate `passageMaskRef` + `DataTexture` in game component; pass as prop to renderer
- [ ] Add `uPassageMask` uniform to `InstancedTileMesh` fragment shader
- [ ] Create `src/turn/passageTraversal.ts` with traversal state machine
- [ ] Extend step-loop `useEffect` to drive traversal (priority over auto-walk)
- [ ] Make `isWalkable` in `deps` whitelist active passage cells during traversal
- [ ] Ensure A* `isWalkable` never treats passage cells as walkable (no special case needed — they remain walls in the solid mask)
- [ ] Wire lever `interact` to toggle `passage.enabled`, update mask, set `needsUpdate`
- [ ] Draw passage cells in minimap loop (cyan = enabled, dark cyan = disabled)

---

## What NOT to change

- Passage cells must remain solid (`getSolid` returns `"wall"`) — no solid mask edits.
- Monsters/NPCs are never whitelisted in the walkability override — only the player's
  traversal state triggers the exception.
- A* pathfinding needs no changes — passage cells stay impassable for all path queries.
- The turn system core (`turnSystem.ts`) needs no changes — traversal uses plain `move`
  actions and the existing scheduler handles timing naturally.
