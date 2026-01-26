---

# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-25 (rev C)**
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane
**STATUS:** **PHASE R1 FUNCTIONALLY COMPLETE: CP437 TILESET RENDERER ONLINE WITH EDGE-ONLY WALLS, CORRECT GRID ORIENTATION, AND SMOOTH CAMERA FOLLOW**

---

## GOAL

Add a **Render** view mode inside `InspectionShell` that hosts a **React Three Fiber** scene. The R3F scene draws a **single 2D plane** (one quad) and uses a **shader** to render the dungeon as a **tileset**, driven by the generator’s `THREE.DataTexture` outputs.

The result is a first-pass “GPU view” of the dungeon that can later grow into:

* animated sprites
* richer shading / lighting
* overlays and debug visualizations
* true runtime-driven visual state
* themed visual styles

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

We treat the render view as having a minimal “player” concept:

* A local **player cell** `{x,y}` exists (Step 7 local inspection state).
* Player is initialized to the **start tile** (entrance tile) when a new dungeon result is loaded.
* The render camera is orthographic and targets the player:

  * Render view accepts `focusX, focusY` in **cell coordinates**
  * Initial camera focus = player position
  * When player `{x,y}` changes, the camera receives a new target and smooths toward it.

### Coordinates (Authoritative Rule)

* **Grid flips belong in the shader.**
* **Camera never flips grid axes** — it only converts *y-down grid space* into *y-up world space*.

This separation is now considered **locked** and should not be re-questioned.

---

## DATA MODEL (TEXTURES)

### Generator textures (existing)

We leverage generator `DataTexture`s already produced by the dungeon pipeline, such as:

* `solid` (wall/floor)
* content masks (`featureType`, `featureId`, `hazardType`, etc.) if needed

### Character / tile-index texture (new)

We introduce a dedicated R8 `DataTexture` (unsigned byte) that encodes **which tile index to draw** at each cell:

* `charTex[x,y] = 0` → “none” (shader draws base floor / wall logic)
* `charTex[x,y] = N` → draw tile index `N` from the atlas

This is the first explicit **render-pipeline bridge** between procedural content masks / runtime state and GPU shading.

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
2. Sample `solid` to classify wall vs floor
3. **Render only exterior wall edges**:

   * A wall cell is drawable **only if at least one of its 8 neighbors is floor**
   * Interior wall mass is rendered as **blank / transparent**
4. Sample `charTex` to override base tile when non-zero
5. Convert tile index → atlas UV
6. Sample atlas texture and output color

Filtering must be `NearestFilter` on all textures (atlas + data textures) to preserve crisp pixels.

---

## UI INTEGRATION NOTES (SESSION FINDINGS)

### What we discovered (rev A carry-forward)

* Render toggle keyed on `layer` instead of `pane`
* Render branch referenced undefined inspection variables
* R3F hooks were called outside `<Canvas>`, violating R3F rules
* Camera/grid orientation bugs caused mirrored and inverted views

### What we did (rev B → rev C)

#### A) CP437 atlas integration

* Locked atlas grid at `32 × 8`
* Established a CP437 preset for floor, wall, player, and common roguelike glyphs
* Confirmed nearest-filtered pixel-art correctness

#### B) Player + start tile initialization

* Player state `{x,y}` lives in `InspectionShell`
* Player initialized from entrance/start semantics (not assumed room IDs)
* Player rendered as a high-priority overlay in `charTex`

#### C) Camera smoothing + hook correctness

* Implemented snap-lerp camera controller inside Canvas tree
* Split `DungeonRenderView` (wrapper) from `DungeonRenderScene` (hooks)
* Stabilized camera settle detection using refs (not React state)
* `onCameraSettled` now fires deterministically

#### D) Grid orientation fix (critical)

* Explicit shader-side grid flips (`flipGridX`, `flipGridY`)
* Camera mapping no longer flips grid axes
* Eliminated double-invert bugs on Y
* Orientation now matches content-pane inspection exactly

#### E) Edge-only wall rendering (new)

* Wall rendering now uses **8-way adjacency**
* Only exterior wall edges are drawn
* Interior wall mass is left blank / transparent
* Produces a clean, readable “outline dungeon” visualization well-suited to inspection

---

## IMPLEMENTATION PLAN STATUS

### Phase R1 — Tileset plane renderer

**DONE / ONLINE**

* Single plane + shader + atlas sampling
* `charTex` R8 overlay path
* CP437 atlas grid parameters + preset glyph mapping
* Player overlay rendered on top of base tiles
* Smooth snap-lerp camera with correct grid/world mapping
* Edge-only wall rendering using 8-way neighborhood checks
* Interior wall mass suppressed (blank)
* R3F hook placement hardened

R1 is now considered **functionally complete**.

---

## NEXT STEPS (IMMEDIATE)

1. **Lock the start tile source**

   * Identify the authoritative entrance/start cell data
   * Implement `computeStartCell(...)`
   * Document the source of truth here for future runtime parity

2. **Finalize FeatureType → glyph mapping**

   * Verify `FeatureType` enum values in `mazeGen.ts`
   * Ensure `buildCharMask` switch cases match real values
   * Keep CP437 preset as the canonical default theme

3. **Define per-layer color channels (theming groundwork)**

   * Introduce a small, explicit color palette per logical layer:

     * base / floor
     * wall edges
     * player
     * items / interactables
     * hazards (e.g. danger layer tinted **red**)
     * debug overlays
   * Pass per-layer tint colors as uniforms (or a small palette texture)
   * This is the **first step toward a full theming system**:

     * alternate palettes
     * biome-aware coloring
     * accessibility / contrast modes

4. **Clamp camera to map bounds (optional but recommended)**

   * Prevent camera from panning beyond map edges
   * Works cleanly with existing snap-lerp controller

5. **Render-pane click-to-focus**

   * Raycast plane → cell
   * Option A: sets player cell (teleport for inspection)
   * Option B: sets focus cell only (camera without moving player)
 
6. Themes
   * sketch the **layer → color uniform schema** explicitly, or
   * add a tiny “theme object” to this doc that R2 can consume directly.

---

## NEXT STEPS (AFTER R1 CLOSE)

6. **Runtime-driven visuals (R2 kickoff)**

   * Doors open/closed from runtime
   * Keys disappear when collected
   * Blocks rendered from runtime positions
   * Hazard glyphs driven by `hazardType`

7. **Debug overlays**

   * Uniform toggles for viewing raw masks
   * Optional overlays for:

     * regions
     * distance fields
     * reachability

---

## DEFINITIONS

* **Cell**: integer grid tile coordinate `(x,y)`
* **Atlas tile index**: integer ID selecting a tile within the atlas grid
* **CP437**: Code Page 437 glyph set; 256 codepoints mapped 1:1 to tile indices
* **R8 DataTexture**: unsigned byte texture encoding per-cell indices
* **Focus cell**: the cell coordinate the camera is centered on in render pane
* **Player cell**: inspection-only entity used to drive camera and render overlay
* **Snap-lerp camera**: camera smoothly approaches a target, then snaps/settles within a pixel threshold

---
