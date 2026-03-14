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

# Milestone 7 — VISIBILITY AND EXPLORATION (COMPLETE)

Runtime fog-of-war layer for the inspection/runtime renderer. Purely a render concern — no
generator outputs or seed curation policy changes.

## What shipped

* **`src/rendering/visibility.ts`** (new) — `VisibilityParams`, `createVisExploredRGBA`,
  `updateVisExploredRGBA`. RGBA8 `DataTexture`: G=explored (0/255), A=visibility (0–255).
  Euclidean radius falloff; inner ring always A=255; explored accumulates across moves.

* **`src/rendering/tiles.ts`** — added `maskToTileTextureRGBA8` alongside the R8 helper.

* **`src/rendering/tileShader.ts`** — uniforms `uVisExplored`, `uExploredDim`, `uVisFgBoost`,
  `uVisBgBoost`. Unexplored cells discard; explored cells dimmed by `mix(uExploredDim, 1.0, vis)`;
  visible cells get a warm bg glow and fg lift.

* **`src/rendering/DungeonRenderView.tsx`** — `visRef`/`visTex` `useMemo` (re-created on W/H
  change); `useEffect` on `playerX`/`playerY` calls `updateVisExploredRGBA` + `needsUpdate`.
  `transparent: true` on `ShaderMaterial`. Tooltip shows `visA` and `explored` for debugging.
  Internal `_visDataRef` prop shares the buffer with the wrapper for tooltip reads.

## Tunable uniforms (defaults)

| Uniform | Default | Effect |
|---|---|---|
| `uExploredDim` | 0.25 | brightness of explored-but-dark cells |
| `uVisFgBoost` | 0.15 | foreground lift for visible cells |
| `uVisBgBoost` | 0.08 | warm bg glow for visible cells |

Visibility defaults: `radius=6`, `innerRadius=1.5`.

---

# Milestone 8 — PATHFINDING (PLANNED)

Efficient **8-way A*** pathfinding (with diagonals) plus a **renderable path mask** (`THREE.DataTexture RGBA8`) that the shader can display as an **animated direction-of-travel gradient** **under entity glyphs** (but **over floor glyphs**).

---

## Goals

1. **Pathfinding core**

   * Implement fast **8-directional A*** (N, NE, E, SE, S, SW, W, NW).
   * Use an efficient open-set (binary heap / priority queue).
   * Use an admissible heuristic for 8-way grids (**octile distance**).
   * Integrate walkability via the existing shared rules (`isTileWalkable`) including optional resolvers.

2. **Path mask texture (RGBA8)**

   * Create/update a **stable** `THREE.DataTexture` sized `W×H`:

     * **R** = enemy path coverage (0/255)
     * **G** = npc/neutral path coverage (0/255)
     * **B** = player path coverage (0/255)
     * **A** = **step index from the path start** (0–255), giving a “stepped” look.
   * Intended usage: for each mobile entity, compute its path-to-target; stamp the mask along the path.

3. **Shader integration**

   * Add a new uniform sampler: `uPathMask` (RGBA8).
   * Render an **animated gradient** aligned with the inferred direction of travel (derived from stepped alpha neighbors).
   * Composite order per-cell:

     1. floor/wall base glyph
     2. **path gradient overlay** (only on walkable cells; clipped by fog-of-war explored)
     3. entity glyph ink on top

---

## New files to add

### 1) `src/pathfinding/aStar8.ts` (new)

Exports:

* `export type GridPos = { x: number; y: number }`
* `export type AStarPath = { path: GridPos[]; cost: number } | null`
* `export function aStar8(...)`

Key implementation notes:

* Neighbor expansion: 8 dirs; cost `(10 orthogonal, 14 diagonal)` (integer math; avoids `sqrt`).
* Heuristic: **octile**: `h = 10*(dx+dy) + (14-20)*min(dx,dy)`
* Early-exit when reaching goal; reconstruct path via `cameFrom`.

### 2) `src/pathfinding/minHeap.ts` (new)

Exports:

* `export class MinHeap<T>` with `push`, `pop`, `peek`, `size`, `updateKey` (optional), or implement lazy duplicate entries + best-known `gScore`.

### 3) `src/rendering/pathMask.ts` (new)

Exports:

* `export type PathMaskKind = "enemy" | "npc" | "player"`
* `export function createPathMaskRGBA(W: number, H: number, name: string)`
  returns `{ data: Uint8Array; tex: THREE.DataTexture }` (same pattern as visibility)
* `export function clearPathMaskRGBA(data: Uint8Array)` (sets all to 0)
* `export function stampPath(...)` (writes channel + alpha step indices along a path)

Stamping policy (simple + deterministic):

* For each cell on the path at step `s`:

  * set channel (R/G/B) to `255`
  * set alpha to `max(existingA, s)` OR (preferably) `min(existingA==0?255:existingA, s)` — pick one and lock it in the spec.

(Use `maskToTileTextureRGBA8` conventions: nearest filtering, clamp-to-edge, `NoColorSpace`, `flipY=false`.)

---

## Existing files to change

### A) Shared walkability integration

**File:** `src/walkability.ts`
**Symbol:** `isTileWalkable(...)`
**Lines:** 27–63
Usage requirement for A*:

* A* must call `isTileWalkable(dungeon, content, nx, ny, resolvers)` when expanding neighbors.
* The A* API should accept the optional `WalkabilityResolvers` and pass it through.

---

### B) RGBA8 texture helper (already exists; reuse)

**File:** `src/rendering/tiles.ts`
**Symbol:** `maskToTileTextureRGBA8(...)`
**Lines:** 207–235
Plan:

* Reuse this helper inside `createPathMaskRGBA(...)` to ensure texture parameters match other mask textures.

---

### C) Follow the visibility texture pattern (mirror it for path mask)

**File:** `src/rendering/visibility.ts`
**Symbols:**

* `createVisExploredRGBA(...)` (lines 25–55)
* `updateVisExploredRGBA(...)` (lines 60–102)
  Plan:
* Implement path-mask creation/update using the same “stable ref + needsUpdate” approach (create only on W/H change; mutate data per tick).

---

### D) Add a `uPathMask` uniform + shader compositing changes

**File:** `src/rendering/tileShader.ts`
Edits:

1. **Uniform declaration**

* Add: `uniform sampler2D uPathMask;`
  Where: near the other samplers (currently `uSolid/uChar/uTint/uAtlas` at lines 20–23, and `uVisExplored` at line 57).

2. **Sampling + fog gating**

* Sample `vec4 pathData = texture2D(uPathMask, texUv);`
* Apply only if `explored >= 0.5` (same explored discard logic at lines 148–151).

3. **Direction-of-travel inference**

* Use stepped alpha to infer local direction:

  * `a = pathData.a * 255.0`
  * Check the 8 neighbors’ alpha; prefer the neighbor with `alpha == a - 1` (toward start) or `a + 1` (toward goal) depending on the visual you want.
  * Convert that neighbor offset into a direction vector `dir`.

4. **Animated gradient**

* Compute a scrolling phase using `uTime` + projection onto `dir`:

  * e.g. `float phase = fract(dot(local - 0.5, dir) * freq + uTime * speed);`
* Use `a` (step index) to “lock” banding (stepped quality):

  * e.g. `float band = fract(a / bandSize);` or `float band = step(0.5, fract(a / k));`
* Final path intensity should be subtle and sit “under” entity ink.

5. **Correct draw order: path under entity glyph, over floor**
   Current shader mixes floor/wall tile with `ch` directly (lines 155–160), then samples the atlas once (lines 176–179).
   Refactor plan:

* Always render a **base** tile first (`floor` or `wall`).
* Then, if `hasChar > 0.5`, render the **entity glyph** as a second sample and alpha-composite it over the base.
* Apply the **path overlay between** those two passes.

**Lines to focus:**

* Tile selection + atlas sample: ~155–180
* Output composition: ~272–329

---

### E) Hook up `uPathMask` in the R3F renderer

**File:** `src/rendering/DungeonRenderView.tsx`

1. **Props**
   **Symbol:** `type Props = { ... }`
   **Lines:** 125–190 (props block starts at 125)
   Add:

* `pathMaskTex?: THREE.DataTexture;` (or a `{ dataRef }` pattern like M7)
* Optional tuning props: `pathStrength?: number`, `pathAnimSpeed?: number` (or keep hardcoded in shader initially).

2. **ShaderMaterial uniforms**
   **Symbol:** `const mat = useMemo(() => new THREE.ShaderMaterial({ ... uniforms ... }))`
   **Lines:** 398–445
   Add:

* `uPathMask: { value: props.pathMaskTex ?? someDefault1x1 }`

3. **Update effect**
   Add a `useEffect` that updates `mat.uniforms.uPathMask.value = props.pathMaskTex` when it changes (similar to the M7 `uVisExplored` update at lines 604–617).

---

### F) Provide the path mask texture from the inspection/runtime shell

**File:** `src/inspect/InspectionShell.tsx`
**Symbol:** `<DungeonRenderView ... />` usage
**Lines:** 1487–1524

Plan:

* Create and own a path-mask `{data, tex}` ref in the shell (mirrors the vis/explored ownership pattern).
* When the “target” changes (e.g. selected cell, hovered cell, or a chosen AI target), compute a path:

  * `aStar8(...)` using `isTileWalkable(...)`
  * `clearPathMaskRGBA(data)` then `stampPath(..., kind="player")` (or `"enemy"`, `"npc"`)
  * set `tex.needsUpdate = true`
* Pass `pathMaskTex={pathRef.current.tex}` into `DungeonRenderView`.

(If you don’t want to commit to UI behavior yet, still wire the infrastructure with a simple “player path to selected cell” debug mode.)

---

## Minimal integration milestone checklist (agent-friendly)

1. **Pathfinding core**

   * Add `src/pathfinding/minHeap.ts`
   * Add `src/pathfinding/aStar8.ts` (uses `isTileWalkable`)

2. **Mask texture**

   * Add `src/rendering/pathMask.ts` (modeled after `visibility.ts` lines 25–102)
   * Reuse `maskToTileTextureRGBA8` (`tiles.ts` lines 207–235)

3. **Shader**

   * Add uniform `uPathMask` in `tileShader.ts` near lines 20–60
   * Refactor composite around lines 155–180 and 272–329 so the path overlay is between base floor/wall and entity glyph

4. **Renderer hookup**

   * `DungeonRenderView.tsx`: add prop + uniform at lines 125–190 and 398–445
   * `InspectionShell.tsx`: create path mask ref + pass into `<DungeonRenderView>` at lines 1487–1524

---


## CURRENT STATE SUMMARY

* Milestone 5 is **closed**; seed curation workflow is canonical.
* Milestone 6 is **closed** — all 5 phases shipped.
* Milestone 7 is **closed**: shipped.
* Milestone 8 is **open**: ready to begin.

## GENERAL PROJECT PLAN (HIGH LEVEL, SHORT)

* Milestone 7: Exploration and visibility
---

## REMINDERS (LOCKED)

* UI must not introduce hidden policy
* Author intent must be explicit before execution (wizard Step 5 confirmation)
* Diagnostics remain authoritative and explain rejections
* Determinism preserved; batch harness is the truth source
