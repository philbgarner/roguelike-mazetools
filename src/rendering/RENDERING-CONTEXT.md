# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-25 (rev B)**  
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane  
**STATUS:** **PHASE R1 FIRST-PIXEL ONLINE (CP437 ATLAS) + CAMERA SMOOTHING INTEGRATED; HOOKS-OUTSIDE-CANVAS BUG FIXED VIA WRAPPER/SCENE SPLIT**

---

## GOAL

Add a **Render** view mode inside `InspectionShell` that hosts a **React Three Fiber** scene. The R3F scene draws a **single 2D plane** (one quad) and uses a **shader** to render the dungeon as a **tileset**, driven by the generator’s `THREE.DataTexture` outputs.

The result is a first-pass “GPU view” of the dungeon that can later grow into:

* animated sprites
* richer shading / lighting
* overlays and debug visualizations
* true runtime-driven visual state

---

## NON-GOALS (FOR NOW)

* No new generation controls (Step 7 remains inspection-only).
* No batch rendering mode.
* No 3D meshes for rooms/walls; it is a **single-plane tileset renderer**.
* No full sprite animation system yet (we will start with static tile indices).
* No complicated scene graph; just one plane + camera + shader.

---

## RENDER VIEW CONTRACT

### Location

The render component lives **inside `InspectionShell`** as an alternate view alongside the current content/canvas inspection view.

### View Mode

`InspectionShell` provides a local toggle:

* `pane = "content"` → existing 2D canvas inspection (layer selection, tooltip, legend, click-to-interact runtime controls)
* `pane = "render"` → new R3F render pipeline

### Inputs

Render view consumes the same single-seed data already present in Step 7:

* `dungeon: BspDungeonOutputs`
* `content: ContentOutputs`
* `runtime: DungeonRuntimeState` (optional initially, but intended to drive door open/closed, key collected, block moved, etc.)

### Player / Camera

We now treat the render view as having a minimal “player” concept:

* A local **player cell** `{x,y}` exists (Step 7 local inspection state).
* Player is initialized to the **start tile** (entrance tile) when a new dungeon result is loaded.
* The render camera is orthographic and targets the player:
  * Render view accepts `focusX, focusY` in **cell coordinates**
  * Initial camera focus = player position
  * When player `{x,y}` changes, the camera receives a new target and smooths toward it.

---

## DATA MODEL (TEXTURES)

### Generator textures (existing)

We leverage generator `DataTexture`s already produced by the dungeon pipeline, such as:

* `solid` (wall/floor)
* content masks (`featureType`, `featureId`, `hazardType`, etc.) if needed

### Character / tile-index texture (new)

We introduce a dedicated R8 `DataTexture` (unsigned byte) that encodes **which tile index to draw** at each cell:

* `charTex[x,y] = 0` → “none” (shader draws base floor/wall)
* `charTex[x,y] = N` → draw tile index N from the atlas

This is the first “render pipeline bridge” between procedural content masks/runtime state and GPU shading.

### Tileset atlas (external image) — CP437

We standardized on **Code Page 437** glyph atlas:

* Atlas contains **256 tiles** at **9×14 px** each
* Grid layout: **32 columns × 8 rows**
* Tile indices map directly to CP437 codepoints (`0..255`)
* Nearest filtering only (pixel-art correctness)

---

## SHADER RESPONSIBILITIES

The fragment shader determines what tile to draw for each cell:

1. Determine cell coordinates from UV (grid space)
2. Sample `solid` at that cell to decide wall vs floor base
3. Sample `charTex` to override base tile when non-zero
4. Convert tile index → atlas UV
5. Sample atlas texture and output color

Filtering must be `NearestFilter` on all textures (atlas + data textures) to preserve crisp pixels.

---

## UI INTEGRATION NOTES (SESSION FINDINGS)

### What we discovered (rev A carry-forward)

`InspectionShell.tsx` initially attempted to show a render view but the condition was wrong:

* switching on `layer === "content"` instead of `pane`
* render branch referenced undefined variables (`bsp`, `hoverX`, `selectedX`, etc.)
* canvas always rendered (stacking/DOM awkwardness)

### What we did (this session — rev B)

#### A) CP437 atlas integration

We confirmed the atlas characteristics and updated the renderer plan accordingly:

* `atlasCols = 32`, `atlasRows = 8`
* Suggested baseline glyph picks for immediate readability:
  * floor = `46` (`.`)
  * wall  = `219` (`█`)
  * player = `64` (`@`) (added as a render-only overlay)
  * plus a small set of conventional roguelike glyphs for door/key/lever/plate/block/chest/hazard

We introduced/used a “CP437 tile preset” concept so these mappings are explicit and easy to iterate.

#### B) Player + start tile initialization

We added a minimal player notion to Step 7 inspection:

* player state `{x,y}` lives in `InspectionShell` (local inspection state only)
* player is initialized to the **start tile** (entrance tile) when a new single-seed result is loaded
* player is rendered as a high-priority overlay into `charTex` (player sits “on top” of other glyphs)

Important: we removed the incorrect assumption that `dungeon.meta.entranceRoomId` exists in `BspDungeonOutputs`. The start tile must be sourced from existing entrance/start semantics (content/runtime metadata or existing entrance marker logic).

#### C) Camera smoothing + hook correctness

We implemented “snap-lerp” camera behavior:

* on player `{x,y}` change → set `targetCell`
* each frame → lerp camera world coords toward target
* when within a few pixels → snap to exact position, clear target, call `onCameraSettled`

During this, we hit an R3F rule violation:

* `useThree()` / `useFrame()` were being called in `DungeonRenderView` outside `<Canvas>`, producing the runtime error:
  * “hooks can only be used inside the Canvas component”

Fix:

* Refactor into:
  * `DungeonRenderView` = wrapper parent that owns `<Canvas>` only (no R3F hooks)
  * `DungeonRenderScene` (child) = all “fun stuff”: textures, material, plane, camera smoothing rig (all hooks live here)

We also removed the conflicting per-frame “snap” rig (`OrthoRig`) that would fight the smoothing controller.

---

## IMPLEMENTATION PLAN STATUS

### Phase R1 — Tileset plane renderer (in progress; first pixel achieved)

**DONE / ONLINE**
* Single plane + shader + atlas sampling
* `charTex` R8 overlay path
* CP437 atlas grid parameters (32×8) and conventional glyph picks
* Player overlay into `charTex`
* Camera smoothing (“snap-lerp”) running inside Canvas tree
* Hook placement corrected via wrapper/scene split

**REMAINING TO CLOSE R1**
* Validate start tile source is authoritative (entrance tile semantics), and document where it comes from
* Confirm orientation correctness (atlas flip flag vs UV space); lock `flipAtlasY` default after verification
* Confirm featureType → glyph mapping aligns with actual `FeatureType` enum values in `mazeGen.ts` (no placeholders)

### Phase R2 — Runtime + interaction parity (next)

* Drive door glyph open/closed from `runtime`
* Key disappears when collected
* Blocks rendered from runtime positions
* Hazards reflect hazardType overlays
* Render-pane selection parity:
  * raycast plane → cell
  * hover tooltip overlay (UI, not shader)
  * selection/focus sync with content pane

### Phase R3 — Sprites and animation

* Sprite layers (player/monsters)
* Animated frames / state
* Optional lighting/post effects (still orthographic)

### Phase R4 — Advanced GPU composition

* Multi-layer composition: base map + overlays + entities
* Instanced sprites / texture arrays
* Hybrid debug overlays and diagnostics visualization

---

## NEXT STEPS (IMMEDIATE)

1. **Lock the start tile source**
   * Identify the authoritative entrance/start cell data (content meta / runtime meta / existing entrance marker)
   * Implement `computeStartCell(...)` to use that data
   * Document it here so future patterns / runtime parity can rely on it

2. **Finalize FeatureType → glyph mapping**
   * Verify `FeatureType` enum values from `mazeGen.ts`
   * Ensure `buildCharMask` switch cases match real values
   * Keep CP437 preset as the canonical “theme” layer

3. **Clamp camera to map bounds (optional but recommended)**
   * Prevent camera from panning beyond map edges, especially on small maps
   * Works cleanly with the existing lerp controller

4. **Render-pane click-to-focus**
   * Raycast plane → cell
   * Option A: sets player cell (teleport) for inspection
   * Option B: sets focus cell only (camera) without moving player

---

## NEXT STEPS (AFTER R1 CLOSE)

5. **Runtime-driven visuals (R2 kickoff)**
   * Doors open/closed from runtime
   * Key collected state toggles glyph
   * Blocks from runtime positions
   * Hazard glyphs by `hazardType`

6. **Debug overlays**
   * Uniform toggles for viewing raw masks
   * Optional overlay layer for region boundaries / distance fields

---

## DEFINITIONS

* **Cell**: integer grid tile coordinate (x,y)
* **Atlas tile index**: integer ID selecting a tile within the atlas grid
* **CP437**: Code Page 437 glyph set; 256 codepoints mapped 1:1 to tile indices
* **R8 DataTexture**: unsigned byte texture encoding per-cell indices
* **Focus cell**: the cell coordinate the camera is centered on in render pane
* **Player cell**: a minimal inspection-only entity position used to drive camera and render overlay
* **Snap-lerp camera**: camera smoothly approaches a target, then snaps/settles when within a pixel threshold
