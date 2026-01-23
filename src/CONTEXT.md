# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-22 (rev O)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 Kickoff — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST-EFFORT)**
**PHASE STATUS:** **PHASE 2.5 SOFT ENFORCEMENT ONLINE; RELIABILITY + INTENT MISALIGNMENT NOW MEASURED**

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

## DEFINITIONS — PROGRESSION GRAMMAR (WORDS BEFORE CODE)

Progression grammar is the set of repeatable, composable micro-structures that shape player experience:

* **Teach** — demonstrate a mechanic safely.
* **Gate** — require a mechanic for progress.
* **Reward** — optional content locked behind meaningful logic.
* **Foreshadow** — visible but inaccessible content.
* **Shortcut** — later unlock reduces backtracking cost.
* **Ramp** — complexity increases with dungeon depth.

In-engine, grammar is expressed via:

* patterns that place fixtures + circuits
* roles assigned to circuits
* diagnostics and thresholds that score intent alignment
* later: policy that steers, repairs, or vetoes placements

---

## MILESTONE 4 STATUS — COMPLETE

Milestone 4 is considered complete when:

* Circuit chaining via SIGNAL exists and is deterministic
* Diagnostics exist for circuits and roles (UI + batch)
* At least one multi-circuit composition pattern exists
* Patterns are best-effort with batch-aggregated failure reasons
* Reliability is batch-verified and stable

**As of rev O: Milestone 4 remains CLOSED.**

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
* lever accessibility diagnostics (new)

The batch harness is trusted; aggregated diagnostics are authoritative.

---

## NEW IN REV O — LEVER ACCESSIBILITY DIAGNOSTICS

### Lever Accessibility Diagnostic (V1)

A new diagnostic classifies lever placement relative to dungeon accessibility:

* **Lever behind own gate** — opening *only its own gate* makes it reachable.
* **Lever blocked by other door(s)** — reachable only if *other* doors are opened.
* **Lever unreachable even if all doors open** — topology or carving failure (not observed).

### Latest Batch Signal (1000 runs)

For `gateThenOptionalReward`:

* **leverBehindOwnGate:** ~2% (rare self-deadlock)
* **leverBlockedByOtherDoor:** ~31% (primary misalignment)
* **leverUnreachableEvenIfAllDoorsOpen:** 0% (no topology failures)

**Interpretation:**

Reliability is perfect, but intent misalignment is measurable: levers are often placed in regions gated by unrelated doors.

This is the first *clear, quantitative intent signal* for Milestone 5.

---

## CURRENT STATE SUMMARY

* Milestone 4 remains fully closed and validated
* Composition patterns are stable and expressive
* Intent misalignment is now **measured**, not anecdotal
* Lever accessibility diagnostics expose real pacing problems
* System remains deterministic and best-effort

---

## NEXT STEPS — MILESTONE 5

### Phase 2.5 — Soft Enforcement (current)

**Immediate next actions:**

1. **Reachability-aware lever placement**

   * Restrict lever placement to tiles reachable from the entrance with doors closed.
   * Expected effect: sharply reduce `leverBlockedByOtherDoor` without vetoes.

2. **UI surfacing**

   * Display lever-access diagnostics alongside pattern diagnostics.
   * Make misalignment visible during inspection, not just batch runs.

3. **Tuning pass (pressure only)**

   * Increase penalty for reusing occupied door edges.
   * Cap attempts on occupied edges before considering them.

### Phase 3 — Hard Policy (future)

After soft steering stabilizes:

* Hard veto: disallow new main-path gates on already-occupied edges (unless no alternatives).
* Enforce minimum topoDepth for OPTIONAL_REWARD beyond depthN thresholds.
* Add limited repair passes for failed compositions before skipping.

---

## REMINDERS

* Patterns must remain best-effort; failures are data, not fatal.
* Option A geometry policy stands.
* Diagnostics are the steering surface for Milestone 5.
