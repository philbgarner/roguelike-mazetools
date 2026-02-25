# Plan: Render monsters via `turnScheduler` into a runtime DataTexture overlay (Option A)

## Goal

Render monster glyphs from the **runtime turn system** (via `turnScheduler` / `TurnSystemState.actors`) by stamping them into a **mutable R8 `THREE.DataTexture`** (`uActorChar`) that is updated whenever monster positions change.

**Option A:** keep any generation-time monster markers as-is, but **ignore `FeatureType=1` in `buildCharMask()`** to prevent double-rendering.

---

## 1) Create a runtime “actor glyph overlay” mask module

### New file: `src/rendering/actorCharMask.ts`

**Symbols to add:**

* `export type ActorCharMask = { data: Uint8Array; tex: THREE.DataTexture }`

* `export function createActorCharMaskR8(W: number, H: number, name: string): ActorCharMask`

  * Allocate `const data = new Uint8Array(W * H)`
  * Create `const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType)`
  * Configure:

    * `tex.minFilter = THREE.NearestFilter`
    * `tex.magFilter = THREE.NearestFilter`
    * `tex.wrapS = THREE.ClampToEdgeWrapping`
    * `tex.wrapT = THREE.ClampToEdgeWrapping`
    * `tex.generateMipmaps = false`
    * `tex.needsUpdate = true`
    * `tex.name = name`
  * Return `{ data, tex }`

* `export function clearActorCharMask(data: Uint8Array): void`

  * `data.fill(0)`

* `export type ActorStamp = { id: string; x: number; y: number }`

* `export function stampMonstersToActorCharMask(args: {`

  * `data: Uint8Array; W: number; H: number;`
  * `monsters: ActorStamp[];`
  * `monsterTile: number;`
  * `avoidCell?: { x: number; y: number };`
  * `blocked?: (x: number, y: number) => boolean;`
  * `}): void`
  * Logic:

    * For each monster:

      * Bounds check `(x,y)`
      * If `avoidCell` matches `(x,y)`, skip (player wins)
      * If `blocked` returns true, skip (don’t draw on walls)
      * Write: `data[y * W + x] = monsterTile & 0xff`

---

## 2) Extend the tile shader with an actor overlay sampler

### Edit: `src/rendering/tileShader.ts`

**Add uniform:**

* `uniform sampler2D uActorChar;`

**Overlay behavior:**

* Sample `uActorChar` at the same UV used for `uChar`
* If the sampled tile index is non-zero, it replaces the base `ch` used for rendering the glyph
* Player remains top priority by ensuring the stamping step never writes onto the player cell

**Implementation shape (high level):**

* After computing `ch` from `uChar`, compute `aCh` from `uActorChar`
* If `aCh > 0`, set `ch = aCh` (and ensure `hasChar = 1` if your shader uses a separate flag)

---

## 3) Plumb `uActorChar` through the render view

### Edit: `src/rendering/DungeonRenderView.tsx`

**Props:**

* Add: `actorCharTex?: THREE.DataTexture | null`

**Fallback texture:**

* Create a 1×1 R8 “zero” DataTexture for cases where no actor overlay exists yet:

  * `Uint8Array([0])`
  * `THREE.RedFormat`, `THREE.UnsignedByteType`
  * `NearestFilter`, `ClampToEdge`, `generateMipmaps=false`

**Uniform wiring:**

* Add to `uniforms`:

  * `uActorChar: { value: props.actorCharTex ?? fallbackActorCharTex }`

Ensure the material/uniform update pattern matches how you already handle dynamic textures (like `uPathMask`).

---

## 4) Create + update the actor overlay mask from the turn system

### Edit: `src/examples/MinimalExample.tsx`

#### 4.1 Create the overlay texture once per dungeon size

Add:

* `const actorMaskRef = useRef<ActorCharMask | null>(null);`
* `const [actorCharTex, setActorCharTex] = useState<THREE.DataTexture | null>(null);`

In an effect keyed on dungeon dimensions:

* Dispose old `actorMaskRef.current?.tex`
* `actorMaskRef.current = createActorCharMaskR8(W, H, "actor_char_r8")`
* `setActorCharTex(actorMaskRef.current.tex)`
* Cleanup: dispose on unmount / regen

#### 4.2 Stamp monsters whenever the turn state changes

Add an effect keyed on:

* `turnState.actors` (or `turnState` if your updates aren’t structurally stable)
* player cell (`player.x`, `player.y`) so the avoidCell logic stays correct

Effect steps:

1. `clearActorCharMask(actorMaskRef.current.data)`
2. Extract monsters from `turnState.actors`

   * Filter: `kind === "monster"` and (if present) `alive === true`
3. Call `stampMonstersToActorCharMask({`

   * `data, W, H`
   * `monsters: monsters.map(m => ({ id: m.id, x: m.x, y: m.y }))`
   * `monsterTile: CP437_TILES.monster` (or whichever tile constant you use)
   * `avoidCell: { x: player.x, y: player.y }`
   * Optional `blocked: (x,y) => dungeon.masks.solid[y*W + x] === 255`
   * `})`
4. `actorMaskRef.current.tex.needsUpdate = true`

#### 4.3 Pass the overlay texture into the renderer

Update `<DungeonRenderView ... />`:

* Add: `actorCharTex={actorCharTex}`

---

## 5) Option A: Ignore static monster feature tiles to avoid double-rendering

### Edit: `src/rendering/tiles.ts`

In `buildCharMask(...)` (or wherever you map `content.masks.featureType` → tile index):

* For `FeatureType=1` (monster):

  * Set `t = 0` (no glyph)
  * Do **not** stamp any monster glyph into the base `uChar` from content generation

This ensures the only visible monsters are the runtime-stamped ones from `turnScheduler`.

---

## 6) Touch points checklist

### New

* `src/rendering/actorCharMask.ts`

  * `createActorCharMaskR8`
  * `clearActorCharMask`
  * `stampMonstersToActorCharMask`

### Modified

* `src/rendering/tileShader.ts`

  * add `uActorChar`
  * overlay selection logic (`uActorChar` overrides `uChar` when non-zero)

* `src/rendering/DungeonRenderView.tsx`

  * add prop `actorCharTex`
  * fallback R8 texture
  * bind uniform `uActorChar`

* `src/examples/MinimalExample.tsx`

  * create actor overlay texture once per dungeon size
  * stamp monsters into overlay whenever `turnState.actors` changes
  * pass `actorCharTex` into `DungeonRenderView`

* `src/rendering/tiles.ts`

  * Option A: ignore `FeatureType=1` in `buildCharMask()`

---

## Expected result

* Monster glyphs appear only when present in `turnState.actors`
* When a monster moves (scheduler tick / action), the overlay texture buffer updates and the shader renders the new positions immediately
* No double-rendering from generation-time feature masks (Option A)

---
