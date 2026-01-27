---

# RENDERING-CONTEXT.md

## RENDERING CONTEXT — INSPECTION SHELL RENDER PIPELINE (R3F)

**CONTEXT VERSION:** **2026-01-28 (rev I)**
**OWNER AREA:** Milestone 5 — UI Wizard Refactor (Step 7 Inspection) → Rendering Pane
**STATUS:** **PHASE R1 CLOSED; PHASE R1.5 SHADER SEMANTICS + VISUAL HIERARCHY ESTABLISHED (POLISH IN PROGRESS)**

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
  * `hazardType`
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

**Important (rev I clarification):**

* **Monsters are currently identified by tile index** (e.g. `tile == uMonsterTile`) and tinted via an **enemy color uniform** (not via a `tintTex` ID).
* `tintTex` remains authoritative for **player / items / hazards / base** semantics.

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

Themes may control **effect intensity**, not logic.

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

## SESSION SUMMARY — 2026-01-28 (WHAT WE JUST DID)

### R1.5 — shader semantics & visual hierarchy breakthrough

This session completed a **major qualitative step**:

#### 1. Ink / background separation (LOCKED)

* Atlas alpha now strictly defines **glyph ink**
* Floors render with a **solid black background**
* Walls retain tinted background on exterior edges
* All effects apply to **ink only**, never to background

This unlocked clean, readable effects without muddy tiles.

#### 2. Semantic visual hierarchy established

Each role now has a **distinct motion/energy profile**:

| Role     | Effect                                    |
| -------- | ----------------------------------------- |
| Player   | Subtle pulse toward white                 |
| Monsters | Breathing warp (scale-based) + enemy tint |
| Items    | Strong metallic sheen band                |
| Doors    | Edge-only varnish highlight               |
| Hazards  | Pulsing intensity                         |

This hierarchy is deliberate:

* **items (highest)** → **doors/enemies (mid, distinct)** → **player (subtle)** → **base tiles**.

#### 3. Monster breathing (procedural warp)

* Monsters no longer use metallic sheen
* Glyph is gently warped around center
* Feels “alive” without sprite animation
* Amplitude and speed are uniform-controlled

#### 4. Door effect re-scoped (IMPORTANT)

* Metallic sheen removed from doors
* Doors now get:

  * **edge-only highlight**
  * very subtle temporal shimmer
* Doors are interactive but **intentionally less loud than items**

**Important (rev I clarification):**

* Door “edge-only highlight” is computed from the **atlas glyph alpha edge** (neighbor alpha taps in atlas UV space), **not** from grid-neighbor cell sampling.
* Highlight strength is modulated by a slow pulse + mild vertical bias (a “varnish” feel), and mixes ink toward a pale near-white.

#### 5. Effect exclusion rules enforced

* Item metallic sheen explicitly excludes:

  * monsters
  * doors
* No overlapping semantic effects

This prevents visual noise and keeps inspection readable.

---

## IMPLEMENTATION PLAN STATUS

### Phase R1 — Tileset plane renderer

**CLOSED / STABLE**

No further changes except bug fixes.

---

### Phase R1.5 — Interaction, theming, affordances & shader polish

**ACTIVE (ADVANCED)**

**Completed / Locked**

* Click-to-focus camera ✔
* Player vs focus separation ✔
* Tint channel texture ✔
* RenderTheme wiring ✔
* CP437 canonical atlas ✔
* Ink vs background split ✔
* Semantic effect hierarchy ✔

**In progress**

* Door edge highlight tuning
* Fine control of effect amplitudes per theme
* Render-pane tooltips & click-to-interact
* Camera bounds clamping during focus chase

---

## UPDATED NEXT STEPS (R1.5 — IMMEDIATE)

### 1. Door highlight tuning (small, important)

* Increase **edge contrast** slightly (not brightness)
* Prefer:

  * edge darkening + thin highlight
  * NOT glint bands
* Doors should read as:

  * solid
  * physical
  * interactive
  * but *not collectible*

This is a polish task, not a redesign.

---

### 2. Render-pane inspection affordances

* Hover tooltips in render pane
* Same semantic info as content pane:

  * feature type / id
  * hazard type
  * runtime state
* Click interactions:

  * doors
  * levers
  * plates
  * blocks
* Rules:

  * reuse existing inspection logic
  * render pane must not infer semantics independently

---

### 3. Camera bounds enforcement

* Clamp focus during snap-lerp
* Prevent panning beyond dungeon extents
* Must remain deterministic

---

### 4. FeatureType → glyph audit (final)

* Verify enum ↔ glyph mapping
* Confirm wall-resident features:

  * secret doors
  * hidden passages
* Ensure `charTex` is authoritative

---

## NEXT PHASE (R2 — RUNTIME-DRIVEN VISUALS)

R2 explicitly **does not start yet**, but is now clearly scoped:

* Doors reflect open/closed runtime state
* Keys disappear when collected
* Blocks render from runtime positions
* Hazards reflect `hazardType`
* Optional low-frequency tile animations

R2 begins **only after** R1.5 interaction parity is complete.

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
