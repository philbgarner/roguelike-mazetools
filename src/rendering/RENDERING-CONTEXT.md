---

# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-29 (rev K)**
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane
**STATUS:** **PHASE R1 CLOSED; PHASE R1.5 ACTIVE — TOOLTIP POPULATION + DEBOUNCE ONLINE; HOVER STABILITY FIX IMPLEMENTED (AWAITING CONFIRMATION / POLISH)**

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

* No new generation controls (Step 7 remains inspection-only).
* No batch rendering mode.
* No 3D geometry for walls/floors — **single plane only**.
* No sprite animation system (all motion is procedural in shader).
* No runtime-authoritative visuals yet (R2 responsibility).

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

**Important:** `RenderTheme` currently includes **colors / strength / legend** only.
No `theme.effects` field exists (avoid adding untyped theme assumptions).

Themes may control **effect intensity** only if we explicitly add fields later; for now hover intensity is a constant uniform.

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

All textures remain `NearestFilter`.

---

## SESSION SUMMARY — 2026-01-29 (WHAT WE DID)

### R1.5 Step 2.1 — Tooltip wiring + debounce (COMPLETE)

**Intent:**
Match the inspection view tooltip behavior in the render pane:

* stable placement relative to the R3F canvas
* delayed/debounced tooltip show (no flicker while moving)
* line content populated from masks + circuit membership

**What was implemented (Render wrapper):**

1. **Tooltip anchor positioning**

   * Added `canvasWrapRef` and made wrapper `position: relative`
   * Implemented `getTooltipStyle()` that anchors using `clientX/clientY`
   * `.maze-tooltip` now receives `style={{ position: "absolute", ...getTooltipStyle() }}`

2. **Tooltip content population (`lines[]`)**

   * Implemented `buildTooltipLines(x,y)` in render wrapper (inspection-parity subset)
   * Populates:

     * raw mask line: `(x,y) region dist solid`
     * feature metadata when present: `featureType featureId param`
     * hazard/danger/lootTier lines when non-zero
     * readable section:

       * bullet line naming feature type
       * bullet lines for circuit membership using `content.meta.circuits` (triggers/targets)
     * Runtime and diagnostics sections are **not** used in render view (R2 responsibility)

3. **Debounced tooltip show**

   * Implemented `TOOLTIP_DELAY_MS` + `hoverTimerRef`
   * On hover, we “arm” the tooltip (`pending: true`) but keep it hidden until the delay elapses
   * If hover changes cell or ends, timer is canceled
   * Tooltip is built and shown only if still hovering the same cell after delay

**Behavioral result:**

* Tooltip no longer flickers while moving the mouse.
* Tooltip content is computed only for “committed” hovers after the delay.

---

### R1.5 Step 2.2 — Hover stability fix (IMPLEMENTED)

**Intent:**
Eliminate hover-end thrash caused by snap-lerp camera motion with stationary mouse, so hover outline + debounced tooltip are reliable.

**What changed (Canvas scene):**

1. **Pointer NDC stored explicitly (authoritative)**

   * On pointer activity we compute NDC `[-1,+1]` using `gl.domElement.getBoundingClientRect()`
   * Stored in a ref (`pointerNdcRef`) and decoupled from R3F’s internal pointer state
   * `clientX/clientY` is also stored for tooltip anchoring (`lastClientRef`)

2. **Frame-driven raycast**

   * In `useFrame`, we raycast every frame against the plane mesh using stored NDC
   * Hover is now **camera-motion invariant** because raycast updates continuously while camera moves

3. **Event handlers become metadata-only**

   * `onPointerMove` updates: `pointerInsideRef`, `pointerNdcRef`, `lastClientRef`
   * `onPointerOut` clears hover state once and calls `onCellHoverEnd`
   * `onPointerEnter` marks pointer “inside” early (belt-and-suspenders for “enter then stop” cases)

4. **Important mechanical fix**

   * Hover raycasting runs even when camera is not chasing a target (no early return path that disables hover)

**Expected behavior after this patch:**

* Hover outline remains stable while mouse is stationary during camera snap-lerp.
* Debounced tooltip appears after the delay even if the camera is still moving.
* Hover change notifications fire only when the hovered cell actually changes (no per-frame spam).

---

## DIAGNOSIS (RESOLVED)

Previous issue:

* Hover detection tied to R3F pointer events
* Camera snap-lerp caused stale pointer ray state
* Ray misses fired `onCellHoverEnd()` repeatedly → timers canceled

Resolution:

* Hover is now **frame-driven** from stored pointer NDC (independent of R3F event-driven pointer state)

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
* Tooltip placement (canvas-relative) ✔
* Tooltip line population (mask + circuits) ✔
* Tooltip debounce/delay ✔
* **Hover stability fix (frame-driven raycast) ✔ (new)**

**Remaining checks / polish**

* Confirm hover + tooltip remain stable across:

  * continuous camera motion after click-to-focus
  * high zoom / low zoom
  * fast mouse movement then stop
* Optional micro-polish:

  * initialize NDC on pointer enter (if we see “enter-without-move” stale-NDC cases)
  * de-duplicate tooltip line builder (wrapper vs shared helper) to avoid drift

---

## UPDATED NEXT STEPS (IMMEDIATE)

### 1. Validate hover stability fix (NOW UNBLOCKED)

Verification checklist:

* Hover outline does **not** flicker or drop while camera moves
* Tooltip appears reliably after `TOOLTIP_DELAY_MS` when mouse is stationary
* `onCellHoverEnd` fires only when leaving the mesh or genuinely losing intersection

If any edge cases remain, they should be **polish**, not architectural.

---

### 2. Selection affordances (next)

* Selected block highlight
* Push target previews
* Overlay-only (inspection, not gameplay)

---

### 3. Door interaction policy (decision point)

* Tooltip-only vs forced-open debug toggle
* Must be explicitly labeled if mutable

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
