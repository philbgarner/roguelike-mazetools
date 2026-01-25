---

# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-24 (rev A)**
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane
**STATUS:** **BOOTSTRAP PLAN LOCKED; INTEGRATION PATCH IDENTIFIED (pane toggle + focus cell)**

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

### Focus / Camera

Camera is orthographic and should remain centered over the plane at a cell coordinate:

* Render view accepts `focusX, focusY` in **cell coordinates**
* `InspectionShell` maintains a local `focusCell` state

  * updated via hover/click in content pane
  * used as the camera focus in render pane

---

## DATA MODEL (TEXTURES)

### Generator textures (existing)

We will leverage generator `DataTexture`s already produced by the dungeon pipeline, such as:

* `solid` (wall/floor)
* content masks (`featureType`, `featureId`, `hazardType`, etc.) if needed

### Character / tile-index texture (new)

We introduce a dedicated R8 `DataTexture` (unsigned byte) that encodes **which tile index to draw** at each cell:

* `charTex[x,y] = 0` → “none” (shader draws base floor/wall)
* `charTex[x,y] = N` → draw tile index N from the atlas

This is the first “render pipeline bridge” between procedural content masks/runtime state and GPU shading.

### Tileset atlas (external image)

The shader samples from a single atlas texture:

* `atlasCols`, `atlasRows` specify its grid layout
* nearest filtering only (pixel-art correctness)

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

### What we discovered

Your current `InspectionShell.tsx` attempts to conditionally show a render view but the condition is wrong:

* the JSX was switching on `layer === "content"` instead of `pane`
* the render branch referenced undefined variables (`bsp`, `hoverX`, `selectedX`, etc.)
* the canvas was always rendered, meaning render view would be stacked awkwardly in the DOM

### What we did (this session)

We defined a correct integration approach:

1. **Use `pane`** to switch between content and render views (not `layer`)
2. Add a `focusCell` state `{x,y}` in `InspectionShell`
3. Update `focusCell` on hover/click in content pane
4. When `pane === "render"`:

   * hide the 2D canvas entirely
   * show `<DungeonRenderView bsp={dungeon} ... focusX={focusCell.x} focusY={focusCell.y} />`

This keeps Step 7’s contract intact (inspection-only, local view state).

---

## DEPENDENCIES

To implement the R3F renderer:

* `three`
* `@react-three/fiber`

(Optionally later: `@react-three/drei`)

---

## NEXT STEPS (IMMEDIATE)

1. **Land the `pane` toggle + focusCell wiring** in `InspectionShell.tsx`

   * `pane` selector in UI
   * conditional render: canvas vs `<DungeonRenderView />`
   * no undefined variables

2. **Add initial rendering module**

   * `src/rendering/DungeonRenderView.tsx`
   * `src/rendering/tileShader.ts`
   * `src/rendering/tiles.ts` (build `charTex`)

3. **First pixel milestone**

   * render floor vs wall tiles from `solid`
   * overlay a simple `charTex` mapping (door/key/lever/plate/block/hazard)
   * verify crisp nearest sampling and correct orientation (atlas flip if needed)

---

## NEXT STEPS (AFTER FIRST PIXEL)

4. **Runtime-driven visuals**

   * door tile varies open/closed based on `runtime.doors[doorId]`
   * key disappears / changes if collected
   * blocks drawn from runtime position (not just static mask)
   * hazard overlays by `hazardType`

5. **Selection + inspection parity**

   * click-to-select in render pane (raycast plane → cell)
   * sync selection/focus between panes
   * optional hover tooltip overlay in render pane (UI layer, not shader)

6. **Debug overlays**

   * shader uniform toggles for viewing raw masks (solid/featureType/hazardType)
   * visualize region boundaries, distance fields, danger/loot ramps

---

## LARGER PLAN (RENDERING ROADMAP)

### Phase R1 — Tileset plane renderer (this work)

* single plane, orthographic camera
* data-texture-driven tile selection
* atlas sampling

### Phase R2 — Runtime + interaction parity

* render responds to runtime mutations (doors/levers/blocks/keys)
* click/hover behavior matches canvas inspection semantics

### Phase R3 — Sprites and animation

* sprite layers (player/monsters)
* per-entity animation frames / state
* optional lighting/post effects

### Phase R4 — Advanced GPU composition

* multi-layer composition: base map + overlays + entities
* instanced sprites or texture arrays
* hybrid UI overlays for debugging / diagnostics

---

## DEFINITIONS

* **Cell**: integer grid tile coordinate (x,y)
* **Atlas tile index**: integer ID selecting a tile within the atlas grid
* **R8 DataTexture**: unsigned byte texture encoding per-cell indices
* **Focus cell**: the cell coordinate the camera is centered on in render pane

---
