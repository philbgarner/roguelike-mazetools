---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-24 (rev X)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST-EFFORT)**
**PHASE STATUS:** **WIZARD UI + EXECUTION LOOP STABILIZED; INSPECTION-SAFE REGENERATION WIRED; CIRCUIT DIAGNOSTICS IDENTITY CORRECTED**

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

## EXPLICIT NON-GOALS (LOCKED)

* UI does **not** influence generator decisions
* Inspection does **not** simulate future behavior
* No heuristic inference beyond diagnostics

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

All composition logic, diagnostics, and reliability guarantees remain unchanged by subsequent UI, inspection, or execution-loop work.

---

## UI ARCHITECTURE REFACTOR (REV S → REV W)

### Motivation

The legacy `App.tsx` mixed:

* configuration
* execution
* batch analysis
* live inspection

This allowed invalid state combinations, blurred execution boundaries, and caused inspection to drift from generator truth.

The UI is now fully refactored into a **linear wizard**, a **pure execution phase**, and a **truthful inspection shell** that mirrors the generator pipeline and enforces invariants by construction.

---

## WIZARD-BASED WORLD CREATION FLOW (LOCKED)

### Step 1 — World Seed & Dimensions

* Seed (manual or randomized)
* World width / height
* Deterministic seed preview (display only)

**No generation occurs.**

### Step 2 — BSP Geometry Settings

* BSP depth / split rules
* Room size bounds
* Corridor constraints

Defines **geometry only**.

### Step 3 — Generation Mode Selection

* **Single Seed Generation** → inspectable dungeon
* **Batch Run** → aggregated diagnostics only

### Step 4A — Content Strategy (Single Only)

* Atomic content only
* Run composition patterns

### Step 4B — Batch Parameters (Batch Only)

* Run count
* Seed prefix + start index

### Step 5 — Run Summary & Confirmation (MANDATORY)

Read-only confirmation of:

* seed + dimensions
* BSP settings
* mode
* content strategy
* explicit guarantees (deterministic / best-effort / diagnostics non-fatal)

**Execution may only begin here.**

### Step 6 — Dungeon Creation (Execution Phase)

* Generator runs to completion
* Progress/status only
* No inspection UI mounted

### Step 7 — Post-Generation Inspection

* **Single:** interactive map + diagnostics
* **Batch:** summary-only results

Strict boundary: **configuration → execution → inspection**.

---

## INVALIDATION MATRIX (AUTHORITATIVE)

* Step 1 changes → invalidate everything downstream
* Step 2 changes → invalidate content, patterns, diagnostics
* Step 3 changes → reset single/batch branch
* Step 4 changes → invalidate generated artifacts only
* Step 5 is read-only
* Any post-execution change → unmount inspection

Fully enforced in the wizard reducer and routing logic.

---

## IMPLEMENTATION PROGRESS (REV X)

### Inspection UX (Step 7)

* `InspectionShell` confirmed **pure and runtime-only**
* Click-to-interact semantics corrected:

  * lever toggle (runtime only)
  * key collect
  * block select + push
* FeatureType mappings canonicalized and enforced
* Circuit membership shown **exactly** from `CircuitDef.triggers[] / targets[]`
* Tooltip content upgraded to semantic + runtime-aware truth
* Canvas hit-testing corrected to canvas-relative
* Legend and color mappings verified accurate

### Execution Loop Stabilization

* Added **seed-only regeneration path** from inspection:

  * Randomize seed
  * Preserve all wizard choices
  * Tear down inspection
  * Re-enter Step 6 execution
  * Return automatically to Step 7

* Key architectural clarifications:

  * `InspectionShell` emits **intent only** (no dispatch)
  * Wizard reducer owns all execution control
  * Regeneration flows through the **same execution path** as Step 5

* Reducer + routing fixes:

  * `INVALIDATE_RESULTS` action added and standardized
  * `REROLL_SEED` action updates `world.seed` and patches `contract.world.seed`
  * `EXEC_START` reliably re-runs generation using preserved contract

This closes a critical UX gap while preserving all Milestone 5 non-goals.

---

### Circuit Diagnostics Identity Correction (NEW — Rev X)

A latent mismatch between **circuit IDs** and **array indices** in circuit diagnostics was identified and corrected.

**Previous behavior (incorrect):**

* `evaluateCircuits()` emitted `circuitIndex` values that were actually **circuit IDs**
* UI inspection code correctly assumed `circuitIndex` meant **index into `meta.circuits[]`**
* Result: circuit inspector selection failed silently (details panel empty)

**Current behavior (correct, locked):**

* All circuit diagnostics now use **array indices into `content.meta.circuits[]`** as their stable external identity:

  * `CircuitChainingDiag.circuitIndex`
  * `SignalRef.fromCircuitIndex`
  * `evalOrder[]`
  * `CycleGroupDiag.members[]`
  * `CycleGroupDiag.outboundTo[]`
* Internal evaluation logic may continue to operate on circuit IDs, but **diagnostics and UI-facing data are index-based by contract**

This aligns diagnostics, inspector behavior, and documentation, and prevents future regressions.

---

### Pattern Reliability Improvements (Phase 2.5)

* **Lever → Hidden Pocket pattern** (`applyLeverRevealsHiddenPocketPattern`) hardened against its dominant failure modes:

  * Previously failed immediately if a single connector candidate validated poorly
  * Now **tries multiple shuffled candidates** (`options.maxAttempts`) before giving up
* Added **preview-first validation**:

  * Carving + fixtures are simulated on copies of masks
  * Reachability evaluated **pre-reveal** and **post-reveal** before committing
  * Pattern commits only if:

    * pocket goal is unreachable pre-reveal, and
    * reachable post-reveal
* Preview validation now places:

  * hidden passage fixture on the connector tile, and
  * lever fixture at the candidate lever position,
    ensuring preview reachability matches runtime semantics
* ID allocation during preview no longer consumes real IDs
* Failure reasons are now more informative, improving batch diagnostics

This brings the pattern in line with **Milestone 5 soft-enforcement philosophy**: retry locally, preserve semantics, and surface diagnostics instead of aborting.

---

## CURRENT STATE SUMMARY

* Milestone 4 is closed and untouched
* Milestone 5 Phase 2.5 generator logic remains best-effort
* Wizard → Execution → Inspection loop is **fully closed**
* Circuit diagnostics identity is now **structurally correct and UI-safe**
* Pattern reliability is improving via **preview + retry**, not relaxed rules
* UI, execution, and generator boundaries remain invariant-safe

---

## NEXT STEPS (PRIORITY ORDER)

### UI (Stabilization & Polish)

1. Minor UX polish:

   * inline validation hints
   * clearer invalidation messaging
   * disable regen button during execution
2. Optional: expose additional execution metadata in Step 5 summary
3. Keyboard + accessibility affordances (non-policy)

### Generator — Milestone 5 Phase 2.5

1. **Validate circuit diagnostics in batch**

   * confirm no remaining ID/index mismatches
   * verify cycle membership + signal dependency rendering at scale
2. **Validate hidden-pocket preview logic in batch**

   * confirm failure modes collapse as expected
3. Run 1000+ seed batch comparison vs baseline
4. Record stability metrics and intent-misalignment deltas

### Milestone 5 Roadmap

* **Phase 3:** Stronger soft steering (intent-pressure weighting)
* **Phase 4:** Candidate hard rules (only after proven stability)

---

## GENERAL PROJECT PLAN (HIGH LEVEL)

* **Milestone 1–3:** Geometry, runtime state, and circuit execution — complete
* **Milestone 4:** Composition patterns + progression grammar — complete
* **Milestone 5:** Intent steering and policy formation — *current focus*

  * Phase 2.5: diagnostics + soft pressure (active)
  * Phase 3: weighted steering
  * Phase 4: selective hard constraints
* **Milestone 6 (Future):** Authorial controls, difficulty bands, pacing targets

---

## REMINDERS

* UI must not introduce hidden policy
* Intent must be explicit before execution
* Diagnostics remain authoritative
* Escalation only after measured stability

---
