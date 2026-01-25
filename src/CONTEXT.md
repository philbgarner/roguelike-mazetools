# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-24 (rev V)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST‑EFFORT)**
**PHASE STATUS:** **WIZARD UI REFACTOR COMPLETE; INSPECTION UX TRUTHFUL, CIRCUIT‑AWARE, AND CONTRACT‑ACCURATE**

---

## SAFE ASSUMPTIONS (DO NOT RE‑DISCUSS)

* Geometry mutation uses **Option A** (distance field recomputed post‑patterns)
* Pattern diagnostics are authoritative
* Batch harness is correct and trusted
* Generation is deterministic and best‑effort (never aborts)

---

## POLICY ESCALATION PRINCIPLE

A rule may only become **hard** if:

1. it first exists as a **diagnostic**,
2. then as a **soft steering signal**,
3. and demonstrates **stable, predictable behavior under pressure**.

Milestone 5 proceeds strictly in this order.

---

## PROJECT OVERVIEW

This project is an experimental procedural dungeon generator built in TypeScript with a React‑based debug, inspection, and batch‑validation harness.

It is designed to evolve toward a JRPG / metroidvania‑style dungeon system emphasizing:

* backtracking + gating
* stateful puzzle circuits (levers, plates, blocks, secrets)
* compositional progression grammar (teach → gate → reward → shortcut)
* deterministic best‑effort generation (patterns may skip; dungeons always generate)

---

## MILESTONE 4 STATUS — COMPLETE

**Milestone 4 remains CLOSED and VALIDATED.**

All composition logic, diagnostics, and reliability guarantees remain unchanged by the UI and inspection work described below.

---

## UI ARCHITECTURE REFACTOR (REV S → REV V)

### Motivation

The legacy `App.tsx` mixed:

* configuration
* execution
* batch analysis
* live inspection

This allowed invalid state combinations, blurred execution boundaries, and made inspection misleading in subtle ways (incorrect feature mappings, ambiguous tooltips).

The UI has now been fully refactored into a **linear wizard** plus **truthful inspection shell** that mirrors the generator pipeline and enforces invariants by construction.

---

## WIZARD‑BASED WORLD CREATION FLOW (LOCKED)

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

### Step 4A — Content Strategy (Single Only)

* **Atomic Content Only**
* **Run Composition Patterns**

Intent is explicit; no silent defaults.

### Step 4B — Batch Parameters (Batch Only)

* Run count
* Seed prefix + start index
* Summary‑only output (no per‑seed inspection)

### Step 5 — Run Summary & Confirmation (MANDATORY)

Read‑only confirmation gate showing:

* seed + dimensions
* BSP settings
* mode (single vs batch)
* content strategy
* explicit guarantees (deterministic / best‑effort / patterns may skip / diagnostics non‑fatal)

**Execution may only begin from this step.**

### Step 6 — Dungeon Creation (Execution Phase)

* generation runs to completion
* progress/status only
* no map or inspection UI mounted

### Step 7 — Post‑Generation Inspection

* **Single:** interactive map + diagnostics
* **Batch:** summary‑only results view

Strict boundary: **configuration → execution → inspection**.

---

## INVALIDATION MATRIX (AUTHORITATIVE)

* **Step 1 changes** invalidate everything downstream
* **Step 2 changes** invalidate content, patterns, diagnostics
* **Step 3 changes** reset single/batch branch
* **Step 4 changes** invalidate generated artifacts only
* **Step 5** is read‑only
* **Any post‑execution change** immediately tears down inspection

This matrix is **fully enforced** in the wizard reducer and routing logic.

---

## IMPLEMENTATION PROGRESS (REV V)

### Wizard UI

* Step‑isolated wizard implemented with Framer Motion transitions
* Each step mounted exclusively (no stacked panels)
* Panels centered and expanded (≈90% width, ≈75% height)
* BSP, pattern, and batch parameter forms fully restored
* Deterministic invalidation enforced by reducer guards

### Execution Adapter (Step 6)

* Execution split cleanly from configuration and inspection

* Runtime normalization added for legacy content outputs:

  * `content.meta.plates`
  * `content.meta.circuits`

* Execution now matches **repo‑accurate contracts**:

  * `derivePlatesFromBlocks` treated as state‑returning
  * `evaluateCircuits(runtime, circuits)` signature honored
  * `computeGlobalCircuitMetrics(diagnostics)` input corrected

### Inspection Shell & UX (Step 7) — **MAJOR UPDATE**

* InspectionShell fully separated from generation concerns

* Canvas hit‑testing corrected to be **canvas‑relative**, not panel‑relative

* Hover system rebuilt using HTML overlays:

  * blinking cell highlight rectangle
  * anchored tooltip that flips intelligently near edges

* Tooltip content upgraded from raw ints → **truthful semantic decode**:

  * correct `FeatureType` mapping (door=4, key=5, lever=6, plate=7, block=8, hidden=9, hazard=10, secret door=3)
  * runtime‑aware state (door open/closed, lever on/off, plate pressed, block position)
  * **exact circuit membership** derived from `CircuitDef.triggers[]` / `targets[]`
  * optional annotation with evaluation order, topo depth, and cycle participation when diagnostics are present

* Click‑to‑interact behavior corrected to match canonical feature ids

### Visual Truthfulness & Legend

* Content layer rendering corrected to align with canonical `FeatureType` enum
* Hazards rendered consistently via `hazardType` overlay
* HTML legend added to canvas:

  * shows color → semantic meaning
  * uses correct RGBA conversion (alpha normalized)
  * only shown when relevant (e.g. content layer)

This ensures **what the user sees is what the generator actually produced**.

### Type Safety & Contracts

* RunContract discriminated union respected (`single` vs `batch`)
* All wizard → execution → inspection boundaries type‑checked
* Accidental cross‑mode access eliminated

---

## CURRENT STATE SUMMARY

* Milestone 4 remains closed and untouched
* Milestone 5 Phase 2.5 soft enforcement remains unchanged at the generator layer
* Wizard refactor is **complete and invariant‑safe**
* Inspection UX is now **truthful, circuit‑aware, and diagnostically authoritative**
* UI no longer introduces semantic ambiguity or hidden behavior

---

## NEXT STEPS (PRIORITY ORDER)

### UI (Stabilization & Polish)

1. Minor UX polish:
   * inline validation hints
   * clearer invalidation messaging
   * onclick in canvas cell should toggle levers and update states in linked entities.
2. Optional: expose additional execution metadata in Step 5 summary
3. Keyboard + accessibility affordances (non‑policy)

### Generator (Milestone 5 — Phase 2.5)

1. Implement **clean lever reachability preview** signal
2. Run 1000+ seed batch comparison vs baseline
3. Record stability metrics and intent‑misalignment deltas

### Milestone 5 Roadmap

* **Phase 3:** Stronger soft steering (intent pressure weighting)
* **Phase 4:** Candidate hard rules (only after proven stability)

---

## REMINDERS

* UI must not introduce hidden policy
* Intent must be explicit before execution
* Diagnostics remain authoritative
* Escalation only after measured stability
