# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM (CONDENSED; M6 HIGH-FIDELITY)

**CONTEXT VERSION:** **2026-02-16 (rev AM)**
**LAST COMPLETED MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT MILESTONE:** **Milestone 6 — Authorial Controls, Difficulty Bands & Pacing**
**CURRENT PHASE:** **Milestone 6 Phase 4 — Exclusion / Inclusion Rules**
**PHASE STATUS:** **PHASE 1 + PHASE 2 + PHASE 3 + PHASE 4 + PHASE 5 SHIPPED**

---

## SAFE ASSUMPTIONS (DO NOT RE-DISCUSS)

* Geometry mutation uses **Option A** (distance field recomputed post-patterns)
* Pattern diagnostics are authoritative
* Batch harness is correct and trusted
* Generation is deterministic and best-effort (never aborts)

---

## POLICY ESCALATION PRINCIPLE

A rule may only become **hard** if:

1. it first exists as a **diagnostic**,
2. then as a **soft steering signal**,
3. and demonstrates **stable, predictable behavior under pressure**.

(Milestone 5 followed this chain; Milestone 6 may use hard constraints immediately because seed curation is the production workflow.)

---

## EXPLICIT NON-GOALS (LOCKED)

* UI does **not** influence generator decisions
* Inspection does **not** simulate future behavior
* No heuristic inference beyond diagnostics

---

## PROJECT OVERVIEW (SHORT)

TypeScript procedural dungeon generator with a React wizard + inspection harness.

Core pillars:

* deterministic best-effort generation (patterns may skip; dungeons always generate)
* puzzle circuits (levers, plates, blocks, secrets, doors)
* progression grammar (teach → gate → reward → shortcut)
* batch measurement + seed curation as the intended production workflow

---

## MILESTONES 1–5 (CONDENSED CONTEXT CLUES)

### Milestone 4 — COMPLETE (UNCHANGED)

Composition patterns + progression grammar are **closed and validated**; later work must not regress its guarantees.

### Milestone 5 — COMPLETE (SUMMARY ONLY)

Milestone 5 established the policy pipeline and hardened several structural invariants:

* **Door placement** constrained to **corridor→room boundary throats** (validated-only path; no bypass API).
* **Trigger → gate ordering** is explicit (`roomA` earlier trigger side, `roomB` gated later side; `depth` recorded); plus a **post-generation scene-graph normalization** sorts emitted fixtures by room distance (doors by gate depth) so runtime/inspection ordering is consistent.
* **Circuit diagnostics identity** is index-based (UI-safe) rather than id-based.
* `gateThenOptionalReward` reliability was improved via lever-placement fallback and then reduced anomalies through soft steering; finally a **post-commit hard constraint safety net** rolls back if any lever-access anomaly is detected.
* **Seed curation** is first-class: batch → seed bank → filterable seeds → re-run seed in single mode via wizard-controlled execution.

This milestone is closed; its details exist to explain why Milestone 6 can safely enforce strict authorial constraints (and reject seeds) without drifting into hidden heuristics.

---

# MILESTONE 6 — AUTHORIAL CONTROLS, DIFFICULTY BANDS & PACING (COMPLETE)

## Design Philosophy (LOCKED FOR M6)

Authorial controls are **hard constraints** applied to completed generations.

* Rejecting seeds is acceptable and expected because production usage is **batch generation + seed curation**.
* Controls should be explicit and measurable; batch diagnostics must explain rejections.
* Default controls are unconstrained (`null`) so existing workflows remain unchanged unless the author opts in.

---

## Control Categories (M6 SCOPE)

1. **Content Budgets** *(Phase 1 — shipped)*
   Post-generation hard min/max caps on content arrays (levers, doors, plates, blocks, chests, secrets, hazards, monsters, keys, circuits).

2. **Difficulty Bands** *(Phase 2 — shipped)*
   Post-generation hard min/max constraints on structural metrics correlated with perceived difficulty.

3. **Pacing Targets** *(Phase 3 — shipped)*
   Post-generation analysis of progression rhythm (first gate distance, reward-after-gate, intro buffer, ramp profile, shortcut presence).

4. **Exclusion / Inclusion Rules** *(Phase 4 — next)*
   Pre-generation pattern filtering + post-generation required-content verification.

5. **Seed Annotation & Tagging** *(Phase 5 — planned)*
   Non-generation workflow layer: metadata attached to curated seeds for downstream consumption.

---

# Milestone 7 — VISIBILITY AND EXPLORATION (STARTED)

## GOAL

Add a **runtime exploration layer** for the inspection/runtime renderer:

* A **visibility + explored** mask is recomputed **every time `playerX` or `playerY` changes**.
* Rendering becomes “fog of war”-like:

  * **Unexplored** cells: **not rendered at all**.
  * **Explored but not currently visible**: rendered, but **dim**.
  * **Currently visible** cells: rendered with a **lit background** and **slightly brighter foreground**.

This is a **render/runtime concern**, not a generator policy concern.

---

## DATA MODEL

Create a new `THREE.DataTexture` sized `W×H`:

* **Format**: `RGBA8` (`THREE.RGBAFormat`, `THREE.UnsignedByteType`)
* Per-cell channels (0–255):

  * **A (alpha)** = *visibility* (0 = not visible, 255 = fully visible)
  * **G (green)** = *explored* (0 or 255)
  * R/B unused (0)

Update rule on player movement:

1. **Wipe ONLY visibility** (set A=0 for all cells; leave explored G as-is).
2. Recompute new visibility A values.
3. For any cell with A>0, also set **G=255** (explored accumulates).

Visibility shape:

* Cells **on and immediately surrounding the player** should be **A=255** (hard inner ring).
* Other visible cells scale by distance to player to simulate gradual darkness (falloff).
* Keep it simple first: **no occlusion / line-of-sight** yet (pure radius + falloff).

---

## RENDERING REQUIREMENTS (SHADER)

Shader behavior using the vis/explored texture:

* Sample `uVisExplored` at the current cell:

  * `explored = (g > 0.5)`
  * `vis = a` in `[0..1]`
* If **not explored** → **discard** (or output fully transparent).
* If explored:

  * Apply **dim factor** when `vis == 0` (e.g. 0.20–0.35).
  * Apply **brightening** when `vis > 0`:

    * Background color present (fog-light) and
    * Foreground slightly brighter than non-visible explored cells.

This should affect both:

* atlas glyph sampling (foreground), and
* tile background fill (wall/floor backdrop).

---

## IMPLEMENTATION PLAN (FILES + SYMBOLS)

### 1) Add visibility/explored texture builder + updater

**New file: `src/rendering/visibility.ts`**

Add these exports:

* `export type VisibilityParams = { radius: number; innerRadius: number; exploredOnVisible: boolean; }`
* `export function createVisExploredRGBA(W: number, H: number, name: string): { data: Uint8Array; tex: THREE.DataTexture }`
* `export function updateVisExploredRGBA(data: Uint8Array, W: number, H: number, playerX: number, playerY: number, params: VisibilityParams): void`

Notes:

* `data.length === W*H*4`
* Index: `i = (y*W + x) * 4`

  * `data[i+1]` = G explored
  * `data[i+3]` = A visibility
* Update algorithm:

  * clear A (only): loop all cells → `data[i+3]=0`
  * compute vis within `radius`:

    * `d = hypot(dx,dy)` (or manhattan; pick one and keep consistent)
    * if `d <= innerRadius` → A=255
    * else if `d <= radius` → A = `floor(255 * (1 - (d-innerRadius)/(radius-innerRadius)))`
  * if A>0 and `exploredOnVisible` → `data[i+1]=255`

### 2) Add a texture factory for RGBA8 (if you want symmetry with R8 helpers)

**Edit: `src/rendering/tiles.ts`**

Add alongside `maskToTileTextureR8` (near **line ~176**):

* `export function maskToTileTextureRGBA8(mask: Uint8Array, W: number, H: number, name: string): THREE.DataTexture`

Use the same sampler settings as R8:

* `NearestFilter`, no mips, clamp, `NoColorSpace`, `flipY=false`.

(Alternatively, you can build the `DataTexture` directly in `visibility.ts` and skip adding this helper.)

### 3) Wire the new texture into the renderer

**Edit: `src/rendering/DungeonRenderView.tsx`**

Where to hook:

* Add creation of the vis/explored texture near the other masks (after `tintTex` is a good spot; `tintTex` is around **line ~366**).
* Use `useRef` to keep `{ data, tex }` stable across renders.
* Recompute on player move using `useEffect` watching `props.playerX`, `props.playerY`.

Concrete insertion points:

* **Add after** `const tintTex = useMemo(...` (≈ line **366**):

  * `const visRef = useRef<{ data: Uint8Array; tex: THREE.DataTexture } | null>(null);`
  * initialize once when `W,H` are known
* **Add effect**:

  * `useEffect(() => { updateVisExploredRGBA(...); visRef.current!.tex.needsUpdate = true; }, [W,H, props.playerX, props.playerY]);`

Uniform wiring:

* In the shader material uniforms block (starts around **line ~381**, at `uniforms: { ... }`), add:

  * `uVisExplored: { value: visRef.current?.tex ?? null }`

### 4) Teach the fragment shader to respect exploration/visibility

**Edit: `src/rendering/tileShader.ts`**

Add a new uniform in `tileFrag`:

* `uniform sampler2D uVisExplored;`

Then in the cell shading portion (where you already sample `uSolid/uChar/uTint`):

* Sample `uVisExplored` using the same grid UV you use for other masks.
* Implement:

  * if `explored == 0` → discard / transparent
  * else apply:

    * `dim = mix(exploredDim, 1.0, vis)` (where `vis` is 0..1)
    * background gets a small additive lift when `vis>0`
    * foreground gets a slight boost when `vis>0`

Keep this purely visual: no gameplay policy.

### 5) Optional: expose visibility params in render theme (later)

If you want the behavior authorable (not required for first pass):

**Edit: `src/rendering/renderTheme.ts`** to include:

* `exploredDim`
* `visibleFgBoost`
* `visibleBgBoost`
* `visRadius`, `innerRadius`

Then thread them through `DungeonRenderView` → shader uniforms. (This can be a Milestone 7 Phase 2 refinement.)

---

## TOUCHPOINTS FOR DEBUGGING

**Edit: `src/rendering/DungeonRenderView.tsx`** tooltip builder (there’s a `buildTooltipLines` here near the top of the file):

Add two lines:

* `visA=<0..255>`
* `explored=<0|255>`

This makes it easy to sanity-check mask updates without guessing.

---

## ACCEPTANCE CHECKLIST

* Moving player updates visibility every step.
* Previously seen cells remain explored forever (until regeneration).
* Unexplored cells do not render at all.
* Visible cells look “lit” compared to explored-not-visible.
* No generator outputs or seed curation policy changes required.


---

## CURRENT STATE SUMMARY

* Milestone 5 is **closed**; seed curation workflow is canonical.
* Milestone 6 is **closed** — all 5 phases shipped.
* Milestone 7 is **open**: ready to begin.
---

## GENERAL PROJECT PLAN (HIGH LEVEL, SHORT)

* Milestone 7: Exploration and visibility
---

## REMINDERS (LOCKED)

* UI must not introduce hidden policy
* Author intent must be explicit before execution (wizard Step 5 confirmation)
* Diagnostics remain authoritative and explain rejections
* Determinism preserved; batch harness is the truth source
