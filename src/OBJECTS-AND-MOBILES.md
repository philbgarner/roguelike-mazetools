# Objects and Mobiles — Design Plan

## Context

The engine already has a clean separation between dungeon generation (`generateContent`) and
rendering (`PerspectiveDungeonView` / `InstancedTileMesh`).  The content callback receives per-cell
contextual data (solid state, region ID, distance-to-wall, hazards, LOS) and a seeded RNG.  The
rendering side uses instanced quads driven by solid data textures.

Objects and mobiles need to sit in that same seam: decided during content generation, rendered as
separate Three.js scene objects alongside (not inside) the instanced tile mesh.

---

## 1. Content-Side: Declaring Objects and Mobiles

### 1a. Return value from the callback

`generateContent` currently calls a `void` callback.  It should instead collect **placement
records** that the callback emits.  The callback gains an `emit` helper on its args:

```ts
interface ContentCallbackArgs {
  // existing fields …
  emit: {
    object(placement: ObjectPlacement): void;
    mobile(placement: MobilePlacement): void;
  };
}
```

This keeps the callback signature additive (no breaking changes) and makes the data flow explicit.

### 1b. ObjectPlacement

```ts
interface ObjectPlacement {
  /** Grid cell. The renderer will centre the object at (x+0.5, 0, z+0.5) by default. */
  x: number;
  z: number;
  /**
   * Developer-supplied factory key that the front-end resolves to a Three.js Object3D.
   * Decouples content logic from rendering assets.
   */
  type: string;
  /**
   * Optional fine-grained transform overrides (world-space offsets from cell centre,
   * yaw rotation in radians, uniform scale multiplier).
   */
  offsetX?: number;
  offsetZ?: number;
  offsetY?: number;
  yaw?: number;
  scale?: number;
  /** Arbitrary key/value bag for game-level metadata (e.g. isLocked, lootTable). */
  meta?: Record<string, unknown>;
}
```

### 1c. MobilePlacement

```ts
interface MobilePlacement {
  x: number;
  z: number;
  type: string;
  /**
   * Atlas tile ID for the billboard sprite (indexes into whatever SpriteAtlas the
   * renderer is given).  The content layer only picks the ID; the renderer handles UVs.
   */
  tileId: number;
  meta?: Record<string, unknown>;
}
```

### 1d. generateContent return value

```ts
interface ContentOutputs {
  objects: ObjectPlacement[];
  mobiles: MobilePlacement[];
}

// generateContent now returns ContentOutputs instead of void
```

The caller (your game component) stores these arrays and passes them into the renderer.

---

## 2. Renderer-Side: Resolving Types to Geometry

### 2a. Object registry

The game component (or a shared module) owns an **object registry**:

```ts
type ObjectFactory = () => THREE.Object3D;

interface ObjectRegistry {
  [type: string]: ObjectFactory;
}
```

Each factory is a plain function that returns a ready-to-use Three.js object — a `Mesh`, a
`Group`, whatever the asset needs.  Objects are instantiated once per placement (not shared, because
they may have independent state like door open/closed).

The registry is passed to the renderer as a prop:

```tsx
<PerspectiveDungeonView
  objectRegistry={myRegistry}
  objects={contentOutputs.objects}
  // …
/>
```

### 2b. Rendering objects

Inside the R3F scene a dedicated `<SceneObjects>` component iterates `objects`, looks up the
factory, calls it, and mounts the result via `<primitive object={…} />`.  Position and rotation are
applied from the placement record (cell centre + offsets + yaw).

Objects are standard Three.js scene nodes so they participate in lighting automatically.  The
existing `AmbientLight` + `PointLight` torchlight setup will shade them without extra work.

Because objects are real geometry they can cast/receive shadows if enabled later, and can be
click-hit-tested for interaction.

### 2c. Rendering mobiles (billboards)

Mobiles use a **single shared `InstancedMesh`** of `PlaneGeometry(1, 1)` (same primitive the tile
mesh already uses) facing the camera — a Y-axis billboard.

Each mobile is one instance.  Per-instance data:
- `Matrix4` — position at cell centre, billboard rotation updated every frame to face the camera.
- `aTileId` attribute — sprite tile index into a separate `SpriteAtlas` texture.

A `<SceneMobiles>` component owns this instanced mesh.  Every frame it:
1. Reads camera position/yaw from context.
2. For each mobile, constructs a `Matrix4` that places the quad at world position and rotates it to
   face the camera (billboard rotation around Y only).
3. Writes matrices and flags `instanceMatrix.needsUpdate = true`.

The sprite shader is a simplified version of the existing tile shader — UV-clamped atlas sampling,
fog, torchlight tint — but without bump mapping.  Alpha-test or alpha-blend is used to cut out the
sprite silhouette.

---

## 3. Interface Summary (Props Flow)

```
generateContent(dungeon, options)
  └─ returns ContentOutputs { objects[], mobiles[] }

Game component holds:
  contentOutputs.objects  ──► PerspectiveDungeonView objects prop
  contentOutputs.mobiles  ──► PerspectiveDungeonView mobiles prop
  objectRegistry          ──► PerspectiveDungeonView objectRegistry prop
  spriteAtlas             ──► PerspectiveDungeonView spriteAtlas prop (Texture + column count)

Inside the R3F canvas:
  <SceneObjects registry={objectRegistry} placements={objects} />
  <SceneMobiles atlas={spriteAtlas} placements={mobiles} />
```

---

## 4. Lifecycle and Re-generation

- Content generation (and thus placement) is **static at dungeon load time** — same seeded RNG
  always produces the same layout.
- Runtime state (e.g. a chest that has been opened, a mobile that has moved) is the game layer's
  responsibility and lives in a separate runtime state structure, not in the placement records.
- If a floor changes, the parent component remounts the dungeon (it already keys on seed+floor),
  which re-runs content generation and produces fresh placement arrays.

---

## 5. Developer Experience

A content callback that wants to place a barrel in every room with distance-to-wall >= 2:

```ts
callback({ x, z, masks, rng, emit }) {
  if (masks.getSolid(x, z) === "wall") return;
  if (masks.getDistanceToWall(x, z) < 2) return;
  if (!rng.chance(0.05)) return;
  emit.object({ x, z, type: "barrel", yaw: rng.next() * Math.PI * 2 });
}
```

A content callback that spawns a rat mobile near entrance cells:

```ts
callback({ x, z, masks, rng, emit }) {
  if (masks.getRegionId(x, z) !== startRegion) return;
  if (!rng.chance(0.03)) return;
  emit.mobile({ x, z, type: "rat", tileId: SPRITE_RAT });
}
```

The developer never touches Three.js.  Object geometry is authored separately in the registry;
sprite sheets are authored as image assets.  The callback is pure data.

---

## 6. Out of Scope (Future Work)

- Animated objects (e.g. spinning coin, flickering torch flame) — factories can return objects with
  their own animation mixers; a render loop hook would need to tick them.
- Mobile pathfinding / turn system integration — the placement record is just a spawn point; the
  turn system consumes it to create `MonsterActor` / `NpcActor` instances as it already does.
- Collision against placed objects — would require the walkability callback to check runtime object
  state, not the placement record.
