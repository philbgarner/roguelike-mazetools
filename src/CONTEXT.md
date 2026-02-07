---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-02-07 (rev Z)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST-EFFORT)**
**PHASE STATUS:** **WIZARD UI + EXECUTION LOOP STABILIZED; INSPECTION-SAFE REGENERATION WIRED; CIRCUIT DIAGNOSTICS IDENTITY CORRECTED; DOOR THROAT PLACEMENT + ORDERED TRIGGER→GATE REFACTOR COMPLETE; SCENE-GRAPH ORDERING NORMALIZED; DOOR-SITE VALIDATION UNIFIED (NO LEGACY NON-VALIDATING PATHS); GATETHENOPTIONALREWARD LEVER FALLBACK ONLINE**

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

## IMPLEMENTATION PROGRESS (REV X → REV Z)

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

---

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

### Door Placement Contract Update (NEW — Rev Y)

Door placement was producing **doors in sequence inside corridors**, including adjacent doors and mid-corridor placements.

**Updated door placement constraints (minimal, localized bugfix intent):**

* A candidate door location must be rejected if it is **adjacent (4-neighborhood) to an existing door**

* A candidate must have **two wall (solid) tiles** on either:

  * **east + west**, or
  * **north + south**

  (i.e. a valid “throat”/frame for a door)

* Doors must be placed at **corridor ends on room boundaries**, not in corridor interior:

  * valid placements occur at the **room boundary/edge throat** where a corridor meets a room
  * corridor interior segments are **not** valid door locations

This aligns door placement with the corridor→room chokepoint invariant and prevents mid-corridor door chains.

---

### Ordered Trigger → Gate Invariant (NEW — Rev Y)

A regression was identified where some patterns could place the **trigger (lever/plate)** in a room that is **not earlier** than the **gate/door** it controls.

**New invariant (soft-enforced, but treated as a correctness contract for patterns):**

* For any “trigger opens gate” structure, the trigger must live in the **earlier** side of the room graph, and the gated content must be on the **later** side.

Concretely:

* Door meta is recorded as:

  * `roomA = triggerRoomId` (earlier)
  * `roomB = gateRoomId` (later)
  * `depth = gateDepth` (distance of gated side)

This supports progression grammar and prevents “lever behind its own gate” regressions.

---

### DRY Refactor: Centralized Door Placement Helpers (NEW — Rev Y)

To prevent patterns from re-implementing door orientation and ordering logic (and silently regressing each other), door placement behavior is being consolidated into shared helpers:

* `patternDoorPlacement.ts` provides:

  * `orientRoomsByDistance(a, b, roomDistance)`
    → returns `{ triggerRoomId, gateRoomId, gateDepth }`

  * `pickOrderedDoorSiteFromCorridors(...)`
    → selects a corridor/room-boundary throat and returns an ordered
    `{ x, y, triggerRoomId, gateRoomId, gateDepth }`

Patterns that place doors and trigger fixtures (levers, plates, blocks) are being updated to call these helpers so that:

* ordering is uniform and repeatable
* patterns no longer drift in subtle ways
* door and trigger placement remains consistent with corridor throat rules

---

### Door-Site Validation Unification (NEW — Rev Z)

A subtle regression vector remained: two door-site APIs existed, and one could bypass the full validator.

**Previous behavior (unsafe):**

* A legacy non-stats door-site picker could return a tile that did not enforce:

  * corridor↔room boundary throat constraint
  * jamb framing constraint
  * adjacent-door constraint

This risked reintroducing corridor-interior placements via an accidental call site.

**Current behavior (correct, locked):**

* The legacy non-validating door-site API has been removed.

* All door-site enumeration flows through the single validated path that emits `DoorSiteStats`, including:

  * `pointsRejectedThroat`
  * `pointsRejectedOccupied`
  * `pointsRejectedWall`
  * `tilesUnique`

* The throat requirement remains **default-on** (`requireThroat` is optional and defaults to true), so patterns must opt out explicitly (only for controlled experiments).

This makes door placement invariants non-bypassable by construction.

---

### GateThenOptionalReward: Lever Placement Fallback (NEW — Rev Z)

Batch metrics showed that `gateThenOptionalReward` failures were dominated by:

* “could not place lever in shallow room”

This was a locality artifact: the gate edge’s shallow endpoint room may be small, crowded, or already constrained under closed-door reachability.

**Structural adjustment (Phase 2.5, still policy-safe):**

* Lever placement now:

  1. **prefers** the shallow endpoint room (earliest side of the main-path gate),
  2. but falls back to a bounded search of **any earlier reachable room** (`roomDistance < gateRoomDistance`)
     when shallow-room placement fails.

This preserves the ordered trigger→gate invariant while reducing best-effort skips caused by early-room tile scarcity.

Diagnostics record lever fallback usage/failure so batch runs can quantify the impact without hardening behavior.

---

### Scene-Graph Ordering Normalization (NEW — Rev Y+)

A subtle but critical regression class was identified:
even when **trigger → gate ordering was logically correct**, the **effective scene-graph / runtime ordering** could still be incorrect if patterns appended placement metadata in inconsistent order.

This produced rare but real issues where:

* a gate could be instantiated or evaluated before its trigger
* inspection ordering appeared inconsistent with progression intent
* regressions could occur silently despite correct placement

#### Structural Fix (Minimal, Best-Effort)

A **single post-generation normalization pass** has been added to `generateDungeonContent()`:

* All placement metadata arrays are **bucketed and re-emitted** by **room graph distance** (`roomDistance`)
* Ordering is stable within a room and deterministic across runs
* No pattern logic is required to “remember” ordering

Specifically:

* `monsters`
* `chests`
* `secrets`
* `keys`
* `levers`
* `plates`
* `blocks`
* `hidden`
* `hazards`

are sorted by `roomDistance[roomId]`.

`doors` are sorted by **gate-side depth**:

* `roomB` (gated room) distance
* `gateDepth` as a deterministic tie-breaker

This guarantees:

* triggers always precede their linked gates in emitted metadata
* runtime and inspection ordering aligns with progression grammar
* patterns remain best-effort and unconstrained in insertion order

No generation is blocked; ordering is normalized after the fact.

#### Diagnostic Guard (Soft)

A non-fatal verifier checks that:

* `roomDistance[roomA] ≤ roomDistance[roomB]` for every door record

Violations are surfaced as diagnostics or warnings and never abort generation.

This preserves Milestone 5 policy:
**diagnose first, steer second, harden only after measured stability.**

---

## CURRENT STATE SUMMARY

* Milestone 4 is closed and untouched
* Milestone 5 Phase 2.5 generator logic remains best-effort
* Wizard → Execution → Inspection loop is **fully closed**
* Circuit diagnostics identity is **structurally correct and UI-safe**
* Pattern reliability is improving via **preview + retry**, not relaxed rules
* Door placement is constrained to **corridor → room boundary throats**
* Trigger → gate ordering is explicit, recorded, and enforced
* Scene-graph ordering is **globally normalized by room depth**
* Door-site validation is unified: no legacy non-validating code paths remain
* `gateThenOptionalReward` lever placement no longer hard-fails solely due to shallow-room scarcity

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

1. **Validate door throat placement in batch**

   * confirm doors no longer appear mid-corridor or adjacent
   * confirm doors align to corridor → room boundary throats only
   * confirm no remaining door-site selection bypass exists (stats path is sole path)

2. **Validate ordered trigger → gate invariant across all door patterns**

   * ensure triggers consistently occur in earlier rooms than gated doors
   * watch for regressions in IntroGate / LeverOpensDoor / PlateOpensDoor / GateThenOptionalReward

3. **Validate circuit diagnostics in batch**

   * confirm no remaining ID/index mismatches
   * verify cycle membership and signal dependency rendering at scale

4. **Validate `gateThenOptionalReward` reliability under pressure**

   * measure reduction in “lever in shallow room” failures
   * measure fallback frequency and confirm it does not increase lever-behind-own-gate rate
   * confirm branch door sites remain available with throat constraint enabled

5. **Validate hidden-pocket preview logic in batch**

   * confirm failure modes collapse as expected

6. Run 1000+ seed batch comparison vs baseline

7. Record stability metrics and intent-misalignment deltas

---

## GENERAL PROJECT PLAN (HIGH LEVEL)

* **Milestone 1–3:** Geometry, runtime state, and circuit execution — complete

* **Milestone 4:** Composition patterns + progression grammar — complete

* **Milestone 5:** Intent steering and policy formation — current focus

  * Phase 2.5: diagnostics + soft pressure
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
