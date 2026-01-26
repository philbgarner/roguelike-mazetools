# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-25 (rev D)**
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane
**STATUS:** **PHASE R1 CLOSED: TILESET PLANE RENDERER STABLE, ORIENTATION-LOCKED, CAMERA-SMOOTHED**

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

This separation is **locked** and must not be re-questioned.

---

## DATA MODEL (TEXTURES)

### Generator textures (existing)

We leverage generator `DataTexture`s already produced by the dungeon pipeline, such as:

* `solid` (wall/floor)
* content masks (`featureType`, `featureId`, `hazardType`, etc.) if needed

### Character / tile-index texture (render bridge)

A dedicated R8 `DataTexture` (unsigned byte) that encodes **which tile index to draw** at each cell:

* `charTex[x,y] = 0` → “none” (shader draws base floor / wall logic)
* `charTex[x,y] = N` → draw tile index `N` from the atlas

This is the first explicit **render‑pipeline bridge** between procedural content masks / runtime state and GPU shading.

### Tileset atlas — CP437

* **Code Page 437** glyph atlas
* **256 tiles**, **9×14 px** each
* Grid layout: **32 columns × 8 rows**
* Tile indices map directly to CP437 codepoints (`0..255`)
* **Nearest filtering only** for pixel correctness

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

All textures (atlas + data textures) must use `NearestFilter`.

---

## SESSION SUMMARY (WHAT WE DID)

### R1 hardening and closure

* **CP437 atlas fully integrated** and standardized (32×8 grid, nearest filtering)
* **Player overlay** rendered via `charTex` with priority over base tiles
* **Authoritative grid orientation established**:

  * All flips live in shader
  * Camera mapping is strictly y‑up world space
* **Camera snap‑lerp controller stabilized**:

  * Hooks moved fully inside `<Canvas>`
  * Ref‑based settle detection (no React state feedback loops)
  * Deterministic `onCameraSettled`
* **Edge‑only wall rendering implemented** using 8‑way adjacency

  * Interior wall mass suppressed
  * Produces a clean outline‑style dungeon view ideal for inspection
* **InspectionShell integration corrected**:

  * Proper `pane` toggle
  * Render branch no longer references content‑only inspection state

R1 is now considered **complete and locked**.

---

## IMPLEMENTATION PLAN STATUS

### Phase R1 — Tileset plane renderer

**CLOSED / STABLE**

* Single plane + shader + atlas sampling
* `charTex` R8 overlay path
* CP437 glyph preset (floor, wall edge, player, common roguelike symbols)
* Smooth camera follow with correct grid/world mapping
* Exterior‑edge wall logic only
* Interior wall mass hidden
* R3F hook placement hardened

No further changes should land in R1 except bug fixes.

---

## START CELL — SOURCE OF TRUTH (LOCKDOWN)

### Problem

We currently have **multiple implicit “start” definitions**:

* The content-pane composite draws an entrance marker at the **center of entrance-room bounds** (only if that center is floor).
* The render-pane player init uses a separate helper (`computeStartCellFromEntranceRoom(...)`) that does **center-of-bounds + nearby floor search**.
* Pattern / reachability code sometimes uses `findAnyFloorInRect(entranceRoomRect)`.

These must be unified so that **inspection + rendering + execution** all agree on the **same cell**.

### Contract

Create a single helper and treat it as authoritative:

* `computeStartCell(dungeon: BspDungeonOutputs, content: ContentOutputs): { x: number; y: number }`

**Inputs are only** `(dungeon, content)`.

**Canonical rule:**

1. If `content.meta.entranceRoomId` is valid:

   * Compute entrance **bounds** by scanning `dungeon.masks.regionId` for `entranceRoomId` (this matches today’s composite renderer).
   * Choose the **center** `(cx,cy)`.
   * If center is floor, return it.
   * Else search outward for the nearest floor (expanding square / spiral, bounded radius).
2. If missing/invalid or nothing is found:

   * Fall back to **map center if floor**, else first floor found by a bounded scan.

**Floor predicate is locked:** `solid[i] !== 255`.

### Lockdown actions

* Move the current `computeStartCellFromEntranceRoom(...)` out of `InspectionShell` into a shared utility.
* Replace all entrance-start computations with the shared helper:

  * render-pane: player init + camera focus
  * content-pane composite: entrance marker placement
  * any execution spawn init (future)

Once these call sites share the helper, start semantics are locked.

---

## NEXT STEPS (IMMEDIATE)

1. **Implement + wire `computeStartCell(...)`**

   * Shared utility (no InspectionShell-local duplicate)
   * Composite renderer entrance marker uses it
   * Render-pane player init uses it
   * Add a small dev assertion/log if panes disagree (should never trigger after lockdown)

2. **Finalize `FeatureType → glyph` mapping**

   * Verify `FeatureType` enum values in `mazeGen.ts`
   * Ensure `buildCharMask` switch cases match real generator outputs
   * CP437 preset remains the canonical default theme

3. **Introduce layer‑based color theming (R2 groundwork)**

   * Define explicit color channels:

     * base / floor
     * wall edges
     * player
     * items / interactables
     * hazards (danger‑tinted)
     * debug overlays

   * Pass colors as uniforms or a tiny palette texture

   * Enables biome palettes, accessibility modes, and theme swaps

4. **Clamp camera to map bounds**

   * Prevent panning beyond dungeon extents
   * Integrates cleanly with existing snap‑lerp controller

5. **Render‑pane click‑to‑focus**

   * Raycast plane → cell
   * Option A: teleport player cell (inspection‑only)
   * Option B: move camera focus only

6. **Theme sketch**

   * Add a small, explicit `RenderTheme` object to this doc
   * R2 will consume it directly (no ad‑hoc uniforms)

---

## NEXT STEPS (R2 — RUNTIME‑DRIVEN VISUALS)

* Doors reflect open / closed runtime state
* Keys disappear when collected
* Blocks rendered from runtime positions
* Hazard glyphs driven by `hazardType`
* Optional runtime animation hooks (still tile‑based)

---

## DEFINITIONS

* **Cell**: integer grid tile coordinate `(x,y)`
* **Atlas tile index**: integer ID selecting a tile within the atlas grid
* **CP437**: Code Page 437 glyph set; 256 codepoints mapped 1:1 to tile indices
* **R8 DataTexture**: unsigned byte texture encoding per‑cell indices
* **Focus cell**: the cell coordinate the camera is centered on in render pane
* **Player cell**: inspection‑only entity used to drive camera and render overlay
* **Snap‑lerp camera**: camera smoothly approaches a target, then snaps/settles within a pixel threshold
