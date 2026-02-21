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
