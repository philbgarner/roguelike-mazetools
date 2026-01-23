---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-23 (rev Q)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST-EFFORT)**
**PHASE STATUS:** **BASELINE VALIDATED; CLEAN SOFT-PATCH IDENTIFIED AND SELECTED**

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

## MILESTONE ROADMAP (HIGH LEVEL)

### Milestone 1 — Geometry & Basic Metadata

* BSP rooms/corridors, region labeling, distance fields, walkability.

### Milestone 2 — Content Placement v1

* Doors/keys/levers/plates/blocks/hazards placed as fixtures.

### Milestone 3 — Stateful Puzzle Execution

* Runtime state model for fixtures (doors, keys, levers, plates, blocks, hazards, secrets).
* Deterministic circuit evaluator (`evaluateCircuits.ts`).
* SIGNAL triggers + topo-sort ordering for circuit chaining; cycle-tolerant best-effort behavior.
* Circuit diagnostics UI.

### Milestone 4 — Puzzle Composition & Progression Grammar (CLOSED)

* Role diagnostics schema + UI (read-only, batch-safe).
* Role-aware composition patterns using SIGNAL dependencies.
* Best-effort execution with authoritative diagnostics.
* Reliability patching to reach near-100% batch stability.

### Milestone 5 — Intent Steering & Progression Policy (CURRENT)

* Soft enforcement (pressure, not veto).
* Measure and reduce intent misalignment (stacked gates, inaccessible levers, pacing issues).
* Transition validated rules into hard policy only after proof.

---

## MILESTONE 4 STATUS — COMPLETE

Milestone 4 is considered complete when:

* Circuit chaining via SIGNAL exists and is deterministic
* Diagnostics exist for circuits and roles (UI + batch)
* At least one multi-circuit composition pattern exists
* Patterns are best-effort with batch-aggregated failure reasons
* Reliability is batch-verified and stable

**As of rev Q: Milestone 4 remains CLOSED.**

---

## PHASE 3 COMPOSITION PATTERN (FOUNDATIONAL)

### `gateThenOptionalReward`

A two-circuit, role-aware composition:

* **MAIN_PATH_GATE**

  * Lever-toggle door placed on a main-path edge.

* **OPTIONAL_REWARD**

  * Branch door to an off-main room.
  * Gated by: `PLATE && SIGNAL(gate ACTIVE)`.
  * Chest placed in the optional branch room.

This pattern expresses **logical composition**: the reward circuit depends on the main-path gate’s activation.

---

## PATTERN DIAGNOSTICS (AUTHORITATIVE)

Patterns execute best-effort and emit diagnostics per run:

* ok / fail + reason
* didCarve
* door-site statistics
* reachability stats (for carving patterns)
* gate-edge reuse diagnostics
* lever accessibility diagnostics (expanded)

The batch harness is trusted; aggregated diagnostics are authoritative.

---

## BASELINE MEASUREMENT — DEFAULT CIRCUITS ONLY (NEW IN REV Q)

A clean-room batch was run with **only default circuits enabled** (no additional lever/plate/hidden-pocket patterns):

**Batch size:** 1000 runs
**Pattern:** `gateThenOptionalReward`
**Reliability:** 100% (1000 / 1000 ok)

### Lever Accessibility (Baseline)

* **leverBlockedByOtherDoor:** **0.6%** (6 / 1000)
* **leverBehindOwnGate:** **7.1%** (71 / 1000)
* **leverUnreachableEvenIfAllDoorsOpen:** **0%**

### Interpretation

* The previously observed ~30% `blockedByOtherDoor` rate is **interaction-driven**, not intrinsic to the pattern.
* With no other doors present, cross-gate blocking collapses to near-zero.
* The dominant remaining failure mode is **leverBehindOwnGate**, which is intrinsic to the current placement order:

  * lever reachability is computed **before** the gate door is committed,
  * the gate door can then cut off the lever’s only access path.

This establishes a **clear, isolated intent defect** in the pattern itself.

---

## CLEAN PATCH DECISION (NEW IN REV Q)

A **clean soft-enforcement patch** has been selected:

> **Change lever placement reachability evaluation to occur *after* preview placement of the gate door.**

### Rationale

* Eliminates `leverBehindOwnGate` without introducing vetoes.
* Preserves deterministic, best-effort behavior.
* Keeps steering local to the pattern (no global policy).
* Maintains the diagnostic-first → soft-enforcement escalation principle.

This patch upgrades lever reachability from:

> “reachable in the pre-door world”
> to
> “reachable in the intended closed-world state.”

---

## CURRENT STATE SUMMARY (REV Q)

* Milestone 4 remains fully closed and validated.
* Phase 2.5 soft enforcement has progressed from **measurement → diagnosis → targeted fix**.
* A clean baseline confirms which misalignments are intrinsic vs interaction-driven.
* A minimal, principled soft patch has been identified and selected.
* No hard rules or vetoes have been introduced.

---

## WHERE WE ARE IN MILESTONE 5

### Phase 2.5 — Soft Enforcement (CURRENT, ACTIVE)

**We now have:**

1. **Clear diagnostic separation**

   * intrinsic misalignment (`leverBehindOwnGate`)
   * interaction misalignment (`blockedByOtherDoor`)
2. **A validated baseline**

   * default-circuit runs establish expected “floor” behavior
3. **A selected clean patch**

   * lever reachability evaluated with gate door previewed

We are still intentionally in **pressure-only territory**.

---

## NEXT STEPS — MILESTONE 5

### Immediate (Phase 2.5 continuation)

1. **Implement the clean patch**

   * Preview-place the gate door before lever sampling.
   * Recompute closed-world reachability with the gate present.
   * Sample lever only from that reachable set.

2. **Re-run the definitive batch (1000+ seeds)**

   * Compare:

     * `leverBehindOwnGate` **before vs after**
     * ensure `blockedByOtherDoor` remains low in baseline
     * confirm no new failure clusters appear

3. **Record post-patch metrics**

   * Add a “post-clean-patch signal” section alongside the baseline.

4. **UI surfacing (optional but recommended)**

   * Make the lever classification visible per pattern instance for inspection.

---

### Phase 2.5 → Phase 3 Readiness Criteria

Phase 3 may only begin once:

* the clean patch predictably drives `leverBehindOwnGate` toward ~0%
* no regressions appear under mixed-pattern pressure
* determinism and best-effort semantics are preserved

---

### Phase 3 — Hard Policy (FUTURE, DO NOT ACTIVATE YET)

* Potential hard rules will only be considered after soft steering proves stable.
* No hard vetoes are currently justified.

---

## REMINDERS

* Patterns must remain best-effort; failures are data, not fatal.
* Option A geometry policy stands.
* Diagnostics are the steering surface for Milestone 5.
* Escalation only after measured stability.

---
