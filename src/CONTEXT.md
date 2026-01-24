---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-23 (rev S)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST-EFFORT)**
**PHASE STATUS:** **BASELINE VALIDATED; CLEAN SOFT-PATCH IDENTIFIED; WIZARD FLOW LOCKED**

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

## UI ARCHITECTURE REFACTOR (REV S)

### Motivation

`App.tsx` currently mixes:

* configuration
* execution
* batch analysis
* live inspection

This allows invalid state combinations and obscures user intent.

The UI will be refactored into a **linear wizard** that mirrors the generator pipeline and enforces invariants by construction.

---

## WIZARD-BASED WORLD CREATION FLOW (LOCKED)

### Step 1 — World Seed & Dimensions

* Seed (manual or randomize)
* World width / height
* Deterministic seed preview (display only)

**No generation occurs.**

---

### Step 2 — BSP Geometry Settings

* BSP depth / split rules
* Room size bounds
* Corridor constraints

Defines **geometry only**. No content or puzzles implied.

---

### Step 3 — Generation Mode Selection

User selects exactly one:

* **Single Seed Generation**

  * Produces an inspectable dungeon
* **Batch Run**

  * N runs
  * Aggregated diagnostics only
  * No interactive map

This choice defines the execution contract.

---

### Step 4A — Content Strategy (Single Seed Only)

Only shown if **Single Seed** was selected.

User chooses:

* **Atomic Content Only**

  * Fixtures placed without composition patterns
* **Run Composition Patterns**

  * Enables patterns such as `gateThenOptionalReward`
  * Full diagnostics active

This step makes **intent explicit**; no silent defaults.

---

### Step 4B — Batch Parameters (Batch Only)

Only shown if **Batch Run** was selected.

* Run count
* Reporting scope (summary only)

No map or per-seed inspection will be available.

---

### Step 5 — Run Summary & Confirmation (NEW, MANDATORY)

A **read-only confirmation step** shown before execution.

Displays:

* Seed + dimensions
* BSP settings
* Generation mode (single vs batch)
* Content strategy (atomic vs patterns)
* Explicit statement of guarantees:

  * deterministic
  * best-effort
  * patterns may skip
  * failures are diagnostics, not fatal

**Execution may only begin from this step.**

This step defines the **run contract** and prevents accidental or ambiguous runs.

---

### Step 6 — Dungeon Creation (Execution Phase)

* Generation runs to completion
* Status and progress only
* No map or inspection UI visible

Option A geometry recomputation occurs internally as required.

---

### Step 7 — Interactive Dungeon Inspection (POST-GENERATION ONLY)

Only after successful completion:

* Interactive map renders
* Layer toggles activate
* Circuit, role, and pattern diagnostics panels unlock
* Inspection tools become available

This enforces a strict boundary between:

> configuration → execution → inspection

---

## INVALIDATION MATRIX (AUTHORITATIVE)

The wizard enforces **deterministic invalidation**. Any upstream change invalidates all downstream state.

### Step 1 Changes — Seed / Width / Height

Invalidates:

* BSP geometry
* Content placement
* Pattern execution
* Diagnostics
* Generated dungeon artifact

**Effect:** user is returned to Step 1; all later steps reset.

---

### Step 2 Changes — BSP Geometry Settings

Invalidates:

* Content placement
* Pattern execution
* Diagnostics
* Generated dungeon artifact

**Effect:** Step 2 is re-entered; Steps 3+ cleared.

---

### Step 3 Changes — Generation Mode

Invalidates:

* Content strategy selection
* Batch parameters
* Any generated results

**Effect:** downstream branch is reset (single vs batch).

---

### Step 4 Changes — Content Strategy or Batch Parameters

Invalidates:

* Generated dungeon artifact
* All diagnostics

**Does NOT invalidate:**

* Seed
* BSP geometry
* Mode selection

---

### Step 5 (Run Summary)

* No editable fields
* No invalidation
* Sole purpose is confirmation

---

### Post-Execution Changes

* Any change to **any prior step** invalidates the entire generated dungeon and diagnostics.
* Map and inspection UI are immediately torn down.

---

## APP.TSX ROLE AFTER REFACTOR

`App.tsx` becomes a **thin orchestration shell**:

* Owns wizard routing
* Owns invalidation logic
* Chooses between:

  * Wizard UI
  * Execution view
  * Inspection shell

All logic-heavy behavior is pushed into dedicated components.

---

## UI COLOR PALETTE (UNCHANGED)

The canonical 16-color palette defined in **rev R** remains authoritative for all UI and CSS.

---

## CURRENT STATE SUMMARY (REV S)

* Milestone 4 remains closed.
* Milestone 5 Phase 2.5 soft enforcement continues uninterrupted.
* Clean lever reachability patch remains queued.
* Wizard flow is now invariant-safe and generator-aligned.
* UI refactor is architectural only; generator semantics unchanged.

---

## NEXT STEPS (UNCHANGED PRIORITY)

### Generator

1. Implement clean lever reachability preview patch
2. Run post-patch batch
3. Record comparative diagnostics

### UI

1. Decompose `App.tsx` per wizard plan
2. Implement invalidation matrix exactly as specified
3. Add Run Summary / Confirm gate
4. Defer map rendering until post-execution
5. Use react framer motion to animate wizard components
6. Add mouse interactivity to elements on the map like doors levers, etc, showing circuit connections.

---

## REMINDERS

* UI must not introduce hidden policy.
* Intent must be explicit before execution.
* Diagnostics remain authoritative.
* Escalation only after measured stability.

---
