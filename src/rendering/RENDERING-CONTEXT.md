---

# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-27 (rev G)**
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane
**STATUS:** **PHASE R1 CLOSED; R1.5 INTERACTION, THEMING, INSPECTION AFFORDANCES & SHADER POLISH IN PROGRESS**

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
* No full sprite animation system yet (static tile indices only).
* No complicated scene graph; just one plane + camera + shader.

---

## RENDER VIEW CONTRACT

### Location

The render component lives **inside `InspectionShell`** as an alternate view alongside the current content/canvas inspection view.

### View Mode

`InspectionShell` provides a local toggle:

* `pane = "content"` → existing 2D canvas inspection
  (layer selection, tooltips, legend, click-to-interact runtime controls)
* `pane = "render"` → R3F render pipeline

### Inputs

Render view consumes the same single-seed data already present in Step 7:

* `dungeon: BspDungeonOutputs`
* `content: ContentOutputs`
* `runtime: DungeonRuntimeState` (optional initially, but intended to drive visual state)

---

## PLAYER / CAMERA MODEL (LOCKED)

### Entities

Render view has **two distinct inspection-only concepts**:

* **Player cell** `{x,y}`

  * Rendered as an overlay glyph
  * Initialized to the **start cell**
  * Does **not** automatically move when camera focus changes

* **Focus cell** `{x,y}`

  * The **sole driver of the camera target**
  * Initialized to the same start cell
  * Can diverge freely from player position

This separation is intentional and **locked**.

### Camera behavior

* Camera is **orthographic**
* Camera target is driven by `focusX, focusY`
* Camera uses a **snap-lerp controller**:

  * Smoothly approaches target
  * Settles within a pixel threshold
  * Emits `onCameraSettled({x,y})` deterministically

### Interaction

* **Render-pane click-to-focus is enabled**

  * Raycast plane → UV → cell
  * Click updates **focus only**
  * Player overlay remains unchanged
* Allows free visual inspection without mutating gameplay state

---

## COORDINATES (AUTHORITATIVE RULE)

* **Grid flips belong in the shader**
* **Camera never flips grid axes** — it only converts
  *y-down grid space → y-up world space*

This separation is **locked**.

---

## DATA MODEL (TEXTURES)

### Generator textures (existing)

* `solid` (wall / floor)
* content masks (`featureType`, `featureId`, `hazardType`, etc.)

### Character / tile-index texture (`charTex`)

R8 `DataTexture` encoding which atlas tile to draw per cell:

* `0` → no override (shader draws base wall/floor)
* `N` → draw atlas tile `N`

Primary **content → render bridge**.

### Tint channel texture (`tintTex`)

R8 `DataTexture` encoding **semantic tint channels**:

* `0` — base (floor / wall)
* `1` — player
* `2` — interactables
* `3` — hazards (danger)

Shader multiplies atlas RGB by tint color.

---

## THEMING (LOCKED)

### `RenderTheme`

A data-only object defining semantic color roles and strength multipliers.

* Lives in `renderTheme.ts`
* Renderer consumes theme → shader uniforms
* Shader has **no semantic knowledge**

Themes currently defined:

* **Default (CP437 Neutral)**
* **Danger-Forward Debug**

Theme selection is inspection-only.

---

## SHADER RESPONSIBILITIES

Fragment shader:

1. Compute cell coords from UV
2. Sample `solid` to classify wall vs floor
3. Render **only exterior wall edges**
4. Sample `charTex` for tile override
5. Sample `tintTex` for semantic channel
6. Resolve tile → atlas UV
7. Sample atlas and apply tint

All textures use `NearestFilter`.

---

## SESSION SUMMARY (WHAT WE JUST IMPLEMENTED)

### R1.5 — interaction & theming expansion

* **RenderTheme system landed and wired**

  * `RenderTheme` contract introduced
  * Default + Danger-Forward Debug themes created
  * Render view derives tint uniforms from theme
  * Strength multipliers applied CPU-side (no shader churn)

R1 renderer remains closed; no changes beyond R1.5 scope.

---

## IMPLEMENTATION PLAN STATUS

### Phase R1 — Tileset plane renderer

**CLOSED / STABLE**

Bug fixes only.

### Phase R1.5 — Interaction, theming, affordances & shader polish

**IN PROGRESS**

* Click-to-focus camera ✔
* Player vs focus separation ✔
* Tint channel texture ✔
* RenderTheme formalized & wired ✔
* CP437 canonical default ✔
* Tooltips + click-to-interact ⏳
* Shader polish pass ⏳

---

## START CELL — SOURCE OF TRUTH (LOCKED)

```ts
computeStartCell(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs
): { x: number; y: number }
```

Floor predicate: `solid[i] !== 255`.
Used by all spawn/initialization consumers.

---

## NEXT STEPS (IMMEDIATE — R1.5)

1. **Render-mode inspection tooltips & interaction**

   * Hover tooltip in render pane (cell-based)
   * Tooltip mirrors content-mode inspection data:

     * feature type / id
     * hazard type
     * runtime-relevant flags
   * Click interaction in render mode:

     * doors, levers, plates, blocks
     * routed to existing runtime handlers
   * Rules:

     * reuse existing inspection adapters
     * never duplicate semantic inference
     * click-to-focus remains camera-only unless click hits an interactable (see below)

2. **Enforce camera bounds during focus chase**

   * Apply clamp inside `useFrame`, not just init
   * Prevent panning beyond dungeon extents

3. **Finalize `FeatureType → glyph` mapping audit**

   * Verify enums vs `buildCharMask`
   * Confirm wall-resident features (secret doors, etc.) render correctly

4. **Focus affordances**

   * Optional focus marker
   * Optional “recenter on player” control

5. **Shader special effects (tile-level lighting & shading) — NEW**

   **Goal:** add “3D-ish” depth and inspection readability while staying within the
   single-plane, nearest-filter, CP437 constraints.

   ### 5.1 Per-tile fake lighting

   * Treat walls vs floors differently
   * Exterior wall edges slightly brighter
   * Floor interiors slightly darker (subtle)

   ### 5.2 Ambient occlusion from neighbors (fake AO)

   * Sample `solid` neighbors
   * Darken floors adjacent to walls
   * Make corridors/rooms pop (readability win)

   ### 5.3 Directional shadowing

   * Choose a light direction (uniform)
   * Darken tiles “behind” walls in that direction
   * Keep conservative to avoid noisy glyph readability

   ### 5.4 Hazard pulse

   * If `tintTex == hazard channel`, modulate tint by:

     * `(0.7 + 0.3 * sin(time * ω))`
   * Use a uniform `uTime` (or frame counter) and `ω` parameter

   ### 5.5 Interactable “breathing”

   * If `tintTex == interactable channel`, subtle oscillation
   * Ensure it does not overpower the theme tint roles

   ### 5.6 Player outline / glow (cheap)

   * Detect player boundary by sampling neighboring `tintTex`
   * Draw a 1px outline / halo without blurring atlas sampling
   * Must preserve crisp pixel edges (avoid linear filtering)

   ### 5.7 Specular sparkle / sheen (items)

   * Interactables only
   * Small moving highlight across glyph (procedural, not sprite sheets)
   * Optional toggle in debug theme

   **Constraints / rules:**

   * Keep sampling count bounded (prefer 4-neighbor unless 8 is required)
   * Preserve CP437 crispness (no smooth filtering)
   * Effects must be theme-compatible (tint first, then effect modulation)
   * Effects may be toggled per theme (Danger-Forward Debug can be louder)

---

## NEXT STEPS (R2 — RUNTIME-DRIVEN VISUALS)

* Doors reflect open/closed runtime state
* Keys disappear when collected
* Blocks rendered from runtime positions
* Hazard glyphs driven by `hazardType`
* Optional tile-based animation hooks

---

## DEFINITIONS

* **Cell** — integer grid coordinate `(x,y)`
* **Atlas tile index** — selects CP437 glyph
* **R8 DataTexture** — unsigned byte per cell
* **Focus cell** — camera target (render pane)
* **Player cell** — inspection-only overlay
* **Snap-lerp camera** — smooth approach + deterministic settle

---
