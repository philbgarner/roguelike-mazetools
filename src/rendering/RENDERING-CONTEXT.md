---

# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-30 (rev M)**
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane
**STATUS:** **PHASE R1 CLOSED; PHASE R1.5 ACTIVE — TOOLTIPS, HOVER, AND SELECTION AFFORDANCES ONLINE; OVERLAY + INTERACTION PARITY NEXT**

---

## GOAL

Add a **Render** view mode inside `InspectionShell` that hosts a **React Three Fiber** scene. The R3F scene draws a **single 2D plane** (one quad) and uses a **custom fragment shader** to render the dungeon as a **tileset**, driven by the generator’s `THREE.DataTexture` outputs.

The result is a first-class **GPU inspection view** that:

* is visually readable at a glance
* preserves CP437 crispness
* reflects semantic roles (player, enemies, items, hazards, doors)
* stays inspection-only (no gameplay coupling yet)

---

## NON-GOALS (FOR NOW)

* No new generation controls inside Step 7 (inspection remains inspection-only).
* No batch rendering mode in the render pane.
* No 3D geometry for walls/floors — **single plane only**.
* No sprite animation system (all motion is procedural in shader).
* No runtime-authoritative visuals yet (R2 responsibility).
* No coupling to wizard UI controls beyond the **stable “single-seed inspection payload” contract**.

---

## RENDER VIEW CONTRACT

### Location

The render component lives **inside `InspectionShell`** as an alternate view alongside the existing 2D canvas inspection view.

### View Mode

`InspectionShell` provides a local toggle:

* `pane = "content"` → existing 2D canvas inspection
* `pane = "render"` → R3F tileset renderer

Both panes consume the **same single-seed dungeon + content outputs**.

---

## UPSTREAM WIZARD CONTRACT (RELEVANT TO RENDERING)

Render view assumes the wizard produces a **single-seed inspection payload** that includes:

* `bsp` outputs (geometry masks/textures)
* `content` outputs (feature/hazard/loot masks, meta circuits)
* the inspection shell is mounted only after generation completes

### Wizard fast-path: “Finish & Run” (LOCKED)

To speed up reaching Step 7, the wizard supports **Finish & Run** from any panel:

* Clicking **Finish & Run** is equivalent to Confirm → Run:

  * materializes a complete run contract from current edits + defaults
  * begins execution immediately (Step 6)
  * lands in Step 7 inspection when complete

**Important:** This is a **wizard concern**, not a rendering concern.
Render view must remain agnostic: it only consumes the resulting single-seed outputs once mounted.

---

## PLAYER / CAMERA MODEL (LOCKED)

### Entities

Render view distinguishes **two inspection-only concepts**:

* **Player cell** `{x,y}`

  * Rendered as a glyph
  * Initialized to start cell
  * Does **not** drive camera

* **Focus cell** `{x,y}`

  * Sole camera target
  * Click-to-focus only
  * May diverge freely from player

This separation is **intentional and locked**.

### Camera behavior

* Orthographic camera
* Target driven by focus cell
* Snap-lerp controller:

  * smooth convergence
  * deterministic settle
  * emits `onCameraSettled({x,y})`

---

## COORDINATES (AUTHORITATIVE RULE)

* **All grid flips happen in the shader**
* **Camera never flips grid axes**

  * Only converts y-down grid → y-up world

This rule is locked to avoid compounding transforms.

---

## DATA MODEL (TEXTURES)

### Generator textures

* `solid` — wall vs floor
* content masks:

  * `featureType`
  * `featureId`
  * `featureParam`
  * `hazardType`
  * `danger`
  * `lootTier`
  * etc.

### Character / tile index texture (`charTex`)

R8 `DataTexture` encoding which CP437 tile to draw per cell:

* `0` → draw base wall/floor tile
* `N` → draw atlas tile `N`

This is the **primary bridge** between content generation and rendering.

### Tint channel texture (`tintTex`)

R8 `DataTexture` encoding **semantic roles**:

| Value | Meaning               |
| ----: | --------------------- |
|     0 | base (floor / wall)   |
|     1 | player                |
|     2 | interactables / items |
|     3 | hazards               |

Tint IDs are **semantic**, not visual — colors come from theme uniforms.

---

## THEMING (LOCKED)

### `RenderTheme`

A data-only object defining semantic color roles and strength multipliers.

* Lives in `renderTheme.ts`
* Consumed CPU-side → shader uniforms
* Shader has **no semantic knowledge**

Themes currently defined:

* **Default (CP437 Neutral)**
* **Danger-Forward Debug**

**Important:** `RenderTheme` currently includes **colors / strength / legend only**.
No `theme.effects` field exists.

---

## SHADER RESPONSIBILITIES (CURRENT)

The fragment shader now does **substantially more than R1**, while still honoring constraints:

1. Compute cell coords from UV
2. Classify wall vs floor via `solid`
3. Render **only exterior wall edges**
4. Resolve base tile vs char override
5. Sample atlas (nearest)
6. Split output into:

   * **background**
   * **glyph ink (alpha-masked)**
7. Apply **semantic effects to ink only**
8. Composite opaque final color
9. Apply **inspection affordances** (hover, selection)

All textures remain `NearestFilter`.

---

## SESSION SUMMARY — 2026-01-30 (WHAT WE DID)

### R1.5 Step 2.2 — Hover stability fix (CONFIRMED)

* Hover is now **frame-driven** via stored pointer NDC + per-frame raycast.
* Early-return control flow was removed to ensure **continuous visual updates**.
* Callbacks remain edge-triggered; uniforms remain coherent every frame.

This is now considered **architecturally correct and locked**.

---

### R1.5 Step 3.1 — Selected cell outline (COMPLETE)

**Intent:**
Provide a persistent, high-priority visual indication of the currently selected block in the render pane.

**What was implemented:**

* Shader-level **selected outline**:

  * thicker than hover outline
  * higher visual priority
  * theme-derived color (interactable channel)
* Selection is driven from `InspectionShell` state (`selectedBlockId → runtime cell`).
* Uniform updates are **continuous**, not gated by hover events.

**Key rule (LOCKED):**

> Hover and selection visuals are **frame-driven** and must not be gated by early-return control flow.
> Only callbacks may be edge-triggered.

**Behavioral result:**

* Selected block remains clearly visible regardless of camera motion.
* Hover outline can overlap but never visually overrides selection.

---

## IMPLEMENTATION PLAN STATUS

### Phase R1 — Tileset plane renderer

**CLOSED / STABLE**

---

### Phase R1.5 — Interaction, theming, affordances & shader polish

**ACTIVE**

**Completed / Locked**

* Click-to-focus camera ✔
* Player vs focus separation ✔
* Tint channel texture ✔
* RenderTheme wiring ✔
* CP437 canonical atlas ✔
* Ink vs background split ✔
* Semantic effect hierarchy ✔
* Hover outline shader logic ✔
* Hover stability fix (frame-driven raycast) ✔
* Tooltip placement + debounce ✔
* Tooltip content parity (inspection subset) ✔
* **Selected outline (shader-driven) ✔ (new)**

---

## DECISIONS LOCKED (2026-01-30)

1. **Selection outline uses subtle time-based pulsing**

   * Implemented in shader (no sprites, no geometry).

2. **Push previews will use an overlay channel**

   * Separate from `tintTex`
   * Render-only, inspection-only

3. **Render-pane interaction parity is desired**

   * Clicking an adjacent cell while a block is selected attempts a push
   * Uses the same runtime logic as the 2D inspection view

---

## UPDATED NEXT STEPS (IMMEDIATE)

### R1.5 Step 3.2 — Overlay channel (NEXT)

* Introduce `overlayTex` (R8) for inspection affordances:

  * selected cell (optional future)
  * push-valid targets
  * push-blocked targets
* Overlay is **visual-only**, no semantic meaning.

---

### R1.5 Step 3.3 — Render-pane interaction parity

* Click adjacent cell → attempt block push
* Selection + push behavior mirrors 2D inspection
* Must be explicitly inspection-only (debug affordance)

---

## NEXT PHASE (R2 — RUNTIME-DRIVEN VISUALS)

R2 does **not** begin until R1.5 interaction parity is complete.

Planned R2 scope:

* Doors reflect runtime open/closed state
* Keys disappear when collected
* Blocks render from runtime positions
* Hazard visuals reflect `hazardType`
* Optional low-frequency tile animation

---

## DEFINITIONS

* **Cell** — integer grid coordinate `(x,y)`
* **Atlas tile index** — CP437 glyph selector
* **R8 DataTexture** — unsigned byte per cell
* **Ink** — glyph pixels (atlas alpha > 0)
* **Background** — tile fill beneath ink
* **Focus cell** — camera target
* **Player cell** — inspection overlay
* **Snap-lerp camera** — smooth + deterministic

---
