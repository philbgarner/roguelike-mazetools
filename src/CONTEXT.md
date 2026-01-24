---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-23 (rev T)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST-EFFORT)**
**PHASE STATUS:** **UI REFACTOR UNDERWAY: THIN-SHELL ROUTING + STEP-ISOLATED WIZARD ANIMATIONS; INSPECTION ADAPTER HARDENED (ENTRANCE/EXIT + BLOCK PUSH + RESET FIXES)**

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

Milestone 5 proceeds strictly in this order.

---

## PROJECT OVERVIEW

This project is an experimental procedural dungeon generator built in TypeScript with a React-based debug, inspection, and batch-validation harness.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system emphasizing:

* backtracking + gating
* stateful puzzle circuits (levers, plates, blocks, secrets)
* compositional progression grammar (teach → gate → reward → shortcut)
* deterministic best-effort generation (patterns may skip; dungeons always generate)

---

## MILESTONE 4 STATUS — COMPLETE

**Milestone 4 remains CLOSED and VALIDATED.**

All composition logic, diagnostics, and reliability guarantees remain unchanged by the UI refactor described below.

---

## UI ARCHITECTURE REFACTOR (REV S → REV T)

### Motivation

`App.tsx` historically mixed:

* configuration
* execution
* batch analysis
* live inspection

This allows invalid state combinations and obscures user intent.

The UI is being refactored into a **linear wizard** that mirrors the generator pipeline and enforces invariants by construction.

---

## WIZARD-BASED WORLD CREATION FLOW (LOCKED)

### Step 1 — World Seed & Dimensions

* Seed (manual or randomize)
* World width / height
* Deterministic seed preview (display only)
  **No generation occurs.**

### Step 2 — BSP Geometry Settings

* BSP depth / split rules
* Room size bounds
* Corridor constraints
  Defines **geometry only**. No content or puzzles implied.

### Step 3 — Generation Mode Selection

User selects exactly one:

* **Single Seed Generation** → produces an inspectable dungeon
* **Batch Run** → N runs, aggregated diagnostics only, no interactive map

### Step 4A — Content Strategy (Single Seed Only)

* **Atomic Content Only** (fixtures placed without composition patterns)
* **Run Composition Patterns** (enables patterns such as `gateThenOptionalReward`)
  Intent is explicit; no silent defaults.

### Step 4B — Batch Parameters (Batch Only)

* Run count
* Reporting scope (summary only)
  No map or per-seed inspection available.

### Step 5 — Run Summary & Confirmation (MANDATORY)

Read-only confirmation gate showing:

* seed + dimensions
* BSP settings
* mode (single vs batch)
* content strategy (atomic vs patterns)
* explicit guarantees (deterministic / best-effort / patterns may skip / diagnostics non-fatal)
  **Execution may only begin from this step.**

### Step 6 — Dungeon Creation (Execution Phase)

* generation runs to completion
* status/progress only
* no map or inspection UI visible

### Step 7 — Interactive Dungeon Inspection (POST-GENERATION ONLY)

Only after completion:

* map renders
* layer toggles active
* circuit + role + pattern diagnostics visible
* inspection tools available
  Strict boundary: **configuration → execution → inspection**

---

## INVALIDATION MATRIX (AUTHORITATIVE)

The wizard enforces deterministic invalidation: upstream changes clear downstream state.

### Step 1 Changes — Seed / Width / Height

Invalidates: BSP geometry, content placement, patterns, diagnostics, generated artifact
**Effect:** return to Step 1; Steps 2+ cleared.

### Step 2 Changes — BSP Geometry Settings

Invalidates: content placement, patterns, diagnostics, generated artifact
**Effect:** Step 2 re-entered; Steps 3+ cleared.

### Step 3 Changes — Generation Mode

Invalidates: content strategy selection / batch params, any generated results
**Effect:** downstream branch reset (single vs batch).

### Step 4 Changes — Content Strategy or Batch Parameters

Invalidates: generated artifact + all diagnostics
Does NOT invalidate: world seed/dims, BSP, mode selection

### Step 5 (Run Summary)

Read-only; no invalidation; confirmation gate only

### Post-Execution Changes

Any change to any prior step invalidates the entire generated dungeon and diagnostics; inspection UI is torn down immediately.

---

## IMPLEMENTATION PROGRESS RECORDED (REV T)

### Diagnostics UI: Role Diagnostics surfaced (new section)

* `src/debug/RoleDiagnosticsSection.tsx` added as a **read-only, batch-safe** UI section for `RoleDiagnosticsV1` output.
* Integrates with the existing circuit selection model (`selectedCircuitIndex`) so circuit + role views stay aligned.
* Provides summary metrics + per-circuit detail inspection, without any runtime mutation.

### Inspection shell adapter: interaction correctness fixes

The inspection shell adapter (Step 7) was hardened to match real repo semantics:

* **Entrance/Exit markers** are derived from **entry/exit room ids**, not `dungeon.meta.entranceTile/exitTile`.

  * Entrance room id: `content.meta.entranceRoomId`
  * Exit room id: `content.meta.farthestRoomId`
  * Marker pixels: center of the region bounds for those rooms, only if not solid.
* **Block pushing** fixed to match `tryPushBlock(state, dungeon, content, blockId, dx, dy)`:

  * click-to-push now computes `(dx,dy)` from current block location and requires cardinal adjacency
  * keyboard push uses the same signature
* **Hard reset** corrected to match `resetRuntimeState(state, content)` (or equivalently re-init runtime from content).

  * Previous call-site bug was `resetRuntimeState(runtime)` which cannot resolve.

### Wizard shell integration (in progress)

* Routing plan is implemented as a “thin shell” approach:

  * Wizard steps (1–5) → execution (6) → inspection (7)
* **Only one wizard step is visible at a time** (no stacked panels).
* **Framer Motion transitions** used to animate step-to-step and screen-to-screen transitions.
* Step 7 routes to:

  * **Single inspection view** (map + diagnostics)
  * **Batch results view** (summary only; no map)

> Note: Some of the wizard refactor work exists as refactor code paths / new components and may not be fully represented in the repomix snapshot depending on what was packed. This CONTEXT captures the intended architecture + the latest implemented fixes and UI surfaces discussed above.

---

## CURRENT STATE SUMMARY (REV T)

* Milestone 4 remains closed and validated.
* Milestone 5 Phase 2.5 soft enforcement continues uninterrupted (generator semantics unchanged).
* Clean lever reachability preview patch remains queued (generator-side).
* UI refactor is underway:

  * step-isolated wizard flow + framer-motion transitions
  * inspection shell adapter hardened for correctness (entrance/exit derivation, block push signature, hard reset signature)
  * role diagnostics UI section added and integrated for Step-7 inspection.

---

## NEXT STEPS (PRIORITY ORDER)

### Generator (Milestone 5 Phase 2.5)

1. Implement the **clean lever reachability preview** patch (reachability-aware placement signal).
2. Run a post-patch batch (1000+ seeds) and capture diffs vs baseline.
3. Record comparative diagnostics and confirm “stable under pressure” behavior (escalation gating).

### UI (Wizard refactor completion)

1. Finish decomposing `App.tsx` into real wizard step components (Step1–Step5):

   * Step 2 full BSP form (replace defaults-only placeholder)
   * Step 4 batch params + pattern config forms
2. Ensure invalidation matrix UX is explicit (clear downstream state immediately + visible “invalidated” messaging).
3. Ensure Step 6 execution screen remains **inspection-free** (no map mount until Step 7).
4. Ensure Step 7 uses the inspection adapter exclusively:

   * single: interactive map + diagnostics
   * batch: summary-only results view
5. Add richer map interactivity (non-policy):

   * doors/levers/keys/blocks hover metadata
   * circuit connection highlights (selected circuit ↔ targets)
   * selection affordances + clear “tool modes” (inspect vs interact)

---

## REMINDERS

* UI must not introduce hidden policy.
* Intent must be explicit before execution.
* Diagnostics remain authoritative.
* Escalation only after measured stability.

---
