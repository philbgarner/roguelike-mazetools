---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-02-15 (rev AJ)**
**LAST COMPLETED MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT MILESTONE:** **Milestone 6 — Authorial Controls, Difficulty Bands & Pacing**
**CURRENT PHASE:** **Milestone 6 Phase 2 — Difficulty Bands**
**PHASE STATUS:** **PHASE 1 + PHASE 2 SHIPPED**

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

## IMPLEMENTATION PROGRESS (REV X → REV AB)

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

### Batch Sample-Seed Capture for Targeted Reproduction (NEW — Rev AA)

A Phase 2.5 diagnostics gap remained: aggregated batch summaries identified failure modes and rates, but did not provide a deterministic bridge back to **specific repro seeds**.

**New capability (diagnostics-only, no policy change):**

* Batch aggregation now captures **sample seeds** (capped lists) for selected high-value cases and emits them into the batch “summary-only” JSON under `patterns[].samples`.

For `gateThenOptionalReward`, the batch summary now includes:

* `samples.failureSeeds[]` (up to 4)

  * `{ seed, seedUsed, reason, edgeStats }`
  * `edgeStats` is parsed from the reason string `(edgeConsidered=… gateElim=… etc)` to provide immediate selection context.

* `samples.leverBehindOwnGateSeeds[]` (up to 10)

  * deterministic repro seeds for the “lever unreachable unless its gate is opened” class.

* `samples.leverBlockedByOtherDoorSeeds[]` (up to 10)

  * deterministic repro seeds for the “lever blocked by a different closed door” class.

This makes Phase 2.5 iteration measurable and reproducible:
**batch → pick seed → single-run inspection → fix → re-batch**.

---

### Lever-Access Root-Cause Diagnostics (NEW — Rev AB)

Phase 2.5 surfaced that “lever access anomalies” were measurable, but needed richer join fields to make root cause visible without manual inference.

**New fields added to lever-access diagnostics (no policy change; diagnostics-only):**

* Gate join fields:

  * `gateRoomA`
  * `gateRoomB`

  These mirror the door meta join fields for the main-path gate door and allow immediate correlation with `roomDistance` and the room graph.

* Lever join field:

  * `leverRoomId`

  This removes ambiguity when a lever is placed via fallback rules (or if tile-to-room mapping changes).

* Closure-model label:

  * `closureModel` (string)

  This makes the reachability assumptions explicit (doors closed vs “gate open only” vs “all doors open”) so the meaning of each boolean is stable and contract-readable.

* Blocking door identification:

  * `blockingDoorId` (optional, best-effort)

  Emitted only for the “blocked by other door” classification, as the earliest identified closed door whose opening makes the lever reachable under the fixed closure model.

This supports Phase 3 steering because we now have actionable diagnostics to measure whether weights reduce true structural anomalies rather than re-labeling them.

---

### Phase 4: Lever-Access Hard Constraint Safety Net (NEW — Rev AG)

Phase 3 soft biases reduced both lever-access anomaly classes to 0%, but the Policy Escalation Principle requires a hard constraint as the final stage to guarantee no anomaly ships even under future pattern changes or edge cases.

**Implementation (`puzzlePatterns.ts`):**

* After `gateThenOptionalReward` commits all fixtures (gate door, branch door, lever, plate, block, chest, circuits), a post-commit check evaluates lever-access diagnostics.

* If **any** anomaly is detected (`isBehindOwnGate`, `blockedByOtherDoor`, or `unreachableEvenIfAllDoorsOpen`), the pattern **rolls back** all committed state:

  * Fixture mask arrays (`ft`, `fid`, `fparam`, `lootTier`) zeroed at committed indices
  * `doors`, `levers`, `plates`, `blocks`, `chests` arrays popped
  * Circuit definitions and roles deleted from `circuitsById` and `circuitRoles`

* The edge is skipped and the pattern continues to the next candidate.

* A `failHardConstraint` counter is incremented on each rejection.

* If hard constraint rejections dominate all failure modes, the failure reason is:
  `"Failed: lever-access hard constraint rejected all placements (soft biases insufficient)."`

**Batch aggregation (`batchStats.ts`):**

* `BatchPatternSummary.leverAccess.hardConstraintRejections` — total times the hard constraint fired across a batch run.
* Accumulated from `(d as any).failHardConstraint` in per-run pattern stats.
* Expected to be **0** under normal operation; a non-zero count signals that soft biases need investigation.

**Design intent:**

* Soft biases (Phase 3) remain the **primary** defense and handle all currently measured cases.
* The hard constraint is a **safety net** that prevents regressions if soft biases prove insufficient under novel topologies.
* This completes the escalation chain: diagnostic (Phase 2.5) → soft steering (Phase 3) → hard constraint (Phase 4).

---

## CURRENT STATE SUMMARY

* Milestone 4 is closed and untouched

* **Milestone 5 is CLOSED**: all phases complete (diagnostics → soft steering → hard constraints → UI polish → seed curation)

* **Milestone 6 Phases 1–2 SHIPPED**:
  * Phase 1 (Content Budgets): post-generation min/max validation on all content types; budget violations tagged in seed bank; batch UI shows budget summary and filter
  * Phase 2 (Difficulty Bands): structural metrics (totalRooms, criticalPathLength, maxGateDepth, branchCount, puzzleDensity) computed post-generation; min/max constraints; difficulty violations tagged in seed bank

* Wizard → Execution → Inspection loop is **fully closed**

* Circuit diagnostics identity is **structurally correct and UI-safe**

* Door placement is constrained to **corridor → room boundary throats** and is non-bypassable (validated-only path)

* Trigger → gate ordering is explicit, recorded, and enforced; scene-graph ordering is **globally normalized by room depth**

* `gateThenOptionalReward` lever placement includes an **earlier-room fallback** to avoid shallow-room tile scarcity

* Lever-access diagnostics are now **root-cause visible**:

  * gate join fields: `gateRoomA`, `gateRoomB`
  * lever join field: `leverRoomId`
  * `closureModel` string (explicit reachability assumptions)
  * `blockingDoorId` (best-effort; only when “blocked by other door” classification holds)

* Batch runs surface **sample repro seeds** for rare failures and lever-access anomalies

* **Phase 4 hard constraint safety net is SHIPPED** (2026-02-15):

  * `gateThenOptionalReward` post-commit hard constraint rolls back all fixtures if any lever-access anomaly is detected after placement
  * `failHardConstraint` counter tracked in pattern stats and batch aggregation (`hardConstraintRejections`)
  * Expected to fire 0 times under normal operation (Phase 3 soft biases handle all known cases)
  * Completes the Policy Escalation Principle chain: diagnostic → soft steering → hard constraint

* **Phase 3 weighted steering is COMPLETE** (2026-02-14):

  * `leverBehindOwnGate`: 4.8% → **0%** (gate-aware reachability BFS at lever placement)
  * `leverBlockedByOtherDoor`: 1.0% → **0%** (branch-door lever-access guard)
  * Pattern failure rate stable at ~0.5% (topology-driven, expected)

* **Seed curation pipeline is COMPLETE** (2026-02-14):

  * `buildSeedBank()` classifies every batch seed as good/patternFailure/hasLeverAnomaly
  * BatchResultsView: filterable seed table, Download Seed Bank, Download Good Seeds
  * Per-seed Copy + Inspect (re-runs seed in single mode via `RERUN_SEED_SINGLE` action)

* **Phase 4 hard constraint safety net SHIPPED** (2026-02-15):

  * `gateThenOptionalReward` now includes a post-commit hard constraint:
    if lever-access diagnostics detect any anomaly (`isBehindOwnGate`, `blockedByOtherDoor`, or `unreachableEvenIfAllDoorsOpen`) after placement, the pattern **rolls back all committed fixtures** (door pair, lever, plate, block, chest, circuits, roles) and tries the next candidate edge.
  * Soft biases (Phase 3) remain the primary defense; the hard constraint is a safety net guaranteeing no lever-access anomaly ships.
  * `failHardConstraint` counter tracks how often the safety net fires; included in pattern stats, failure reason reporting, and batch aggregation.
  * Batch aggregation (`batchStats.ts`) surfaces `hardConstraintRejections` in `BatchPatternSummary.leverAccess` — expected to be 0 under normal operation.
  * Follows the Policy Escalation Principle: diagnostic (Phase 2.5) → soft steering (Phase 3) → hard constraint (Phase 4), with measured stability at each stage.

* **UI Stabilization & Polish — CLOSED** (2026-02-15):

  * Regen button disabled during execution (prevents spam-click race conditions)
  * Inline range hints on all numeric wizard inputs (Step 1 + Step 2)
  * Invalidation banner: upstream edits show a dismissible yellow toast explaining what was cleared (auto-dismiss 4s)
  * Button `focus-visible` styles: cyan ring matching input focus treatment
  * Document title shows batch progress ("Generating 42/300…") for tab monitoring
  * Step indicator accessibility: `aria-current="step"`, `aria-label` with full step names, `role="navigation"` on stepper

---

## PHASE 2.5 CLOSEOUT DECISION (2026-02-08)

We are explicitly treating **low-percentage pattern failures** as an expected outcome under best-effort generation.

**Production/game usage plan (locked for now):**

* The generator will be used **offline** to pre-generate a large pool of candidate seeds.
* We will **curate** the resulting seed set and ship only seeds that satisfy required invariants (no pattern failures; acceptable diagnostics envelope).
* This avoids policy creep and prevents Phase 2.5 from turning into endless edge-case chasing.

**Measured reliability checkpoint (1000-run batch sample):**

* `gateThenOptionalReward`: **996/1000 ok** (0.4% fail)

  * Failures were dominated by topology / site-availability constraints (“no off-main branches” and “no usable branch door sites”), not lever placement.
* Lever-access anomaly rates were measurable and reproducible via samples:

  * `leverBehindOwnGate`: **48/996** (~4.8%)
  * `leverBlockedByOtherDoor`: **10/996** (~1.0%)
  * `unreachableEvenIfAllDoorsOpen`: **0**

These rates are now *actionable* because we can jump directly from batch → seed → single inspection.

---

## NEXT STEPS (PRIORITY ORDER)

### Phase 3 (CLOSED) — Weighted Steering + Seed Curation Workflow (includes Phase 4 Hard Constraint)

#### Phase 3 Steering Goals (DEFINED — 2026-02-14)

**Baselines (Phase 2.5, 1000-run batch):**

| Metric                             | Phase 2.5 Rate        |
|------------------------------------|-----------------------|
| Pattern failure (gateThenOptReward)| 0.4% (4/1000)        |
| `leverBehindOwnGate`              | ~4.8% (48/996)       |
| `leverBlockedByOtherDoor`         | ~1.0% (10/996)       |
| `unreachableEvenIfAllDoorsOpen`   | 0%                   |

**Targets (soft — no hard constraints):**

| Metric                             | Target       | Hard floor          |
|------------------------------------|--------------|---------------------|
| Pattern failure                    | ≤0.4%        | No regression       |
| `leverBehindOwnGate`              | ≤2.0%        | None — soft goal    |
| `leverBlockedByOtherDoor`         | ≤0.5%        | None — soft goal    |
| `unreachableEvenIfAllDoorsOpen`   | Stay at 0%   | N/A                 |

#### Steering Interventions (ranked by expected impact)

1. **Lever-room reachability bias** (DONE — 2026-02-14)

   Gate-aware reachability BFS at lever placement time. Result (1000-run batch):
   `leverBehindOwnGate` dropped from **4.8% → 0.4%** (target was ≤2.0%).
   Pattern failure rate unchanged (0.4%). No regression on any guardrail.

2. **Branch-door lever-access guard** (DONE — 2026-02-14)

   After lever placement, verify the lever is still reachable with both the gate
   AND branch door blocked. If the branch door would cut off the lever, skip that
   branch site. Result (1000-run batch, combined with #1):
   `leverBlockedByOtherDoor` dropped from **1.0% → 0%**;
   `leverBehindOwnGate` also reached **0%**. Pattern failure 0.5% (noise).

3. **Branch-neighbor scoring** (PENDING — deferred; anomaly targets already met)

   When selecting which off-main neighbor to branch into, prefer neighbors with higher
   usable door-site counts. Currently random shuffle. May revisit if pattern failure
   rate needs reduction.

All interventions are **soft biases** (weighted sort or soft guard, not hard rejection).

#### Combined Results (Interventions #1 + #2, 1000-run batch, 2026-02-14)

| Metric                             | Phase 2.5  | Phase 3    | Delta       |
|------------------------------------|------------|------------|-------------|
| Pattern failure                    | 0.4%       | 0.5%       | +0.1% (noise)|
| `leverBehindOwnGate`              | 4.8%       | **0%**     | **−4.8%**    |
| `leverBlockedByOtherDoor`         | 1.0%       | **0%**     | **−1.0%**    |
| `unreachableEvenIfAllDoorsOpen`   | 0%         | 0%         | no change   |

Both lever-access anomaly classes eliminated. All targets exceeded.

#### Measurement Plan

* Run a **1000-seed baseline batch** on Phase 2.5 snapshot before any changes.
* Apply each intervention **incrementally** and re-run 1000-seed batches.
* Compare deltas on all four metrics above.
* **Regression guardrails**: pattern failure rate must not increase;
  `unreachableEvenIfAllDoorsOpen` must stay at 0%;
  door throat invariants and trigger→gate ordering preserved.

#### Seed Curation Pipeline (DONE — 2026-02-14)

* `buildSeedBank(runs)` in `batchStats.ts` — per-seed classification (good/patternFailure/hasLeverAnomaly)
* `SeedBank` JSON artifact with `schemaVersion`, timestamps, summary counts, and per-seed entries
* Each `SeedBankEntry`: seed, seedUsed, rooms, corridors, tags[], patternResults[]
* BatchResultsView UI:
  * Seed bank summary bar (good/total/failed counts)
  * Download Seed Bank (full JSON) + Download Good Seeds (string list)
  * Filterable table (All / Good / Failed) with Copy + Inspect per row
  * Inspect dispatches `RERUN_SEED_SINGLE` → single-mode execution with batch config preserved

#### Phase 4: Hard Constraint Safety Net (DONE — 2026-02-15)

* Post-commit lever-access hard constraint in `gateThenOptionalReward`:
  rolls back all fixtures if any anomaly detected after placement.
* `failHardConstraint` counter in pattern stats + batch aggregation (`hardConstraintRejections`).
* Expected to fire 0 times (soft biases handle all known cases); non-zero signals soft bias investigation needed.
* Completes Policy Escalation Principle: diagnostic → soft steering → hard constraint.

### UI Stabilization & Polish (CLOSED — 2026-02-15)

**Shipped:**

* Inline range hints on all numeric wizard inputs (Step 1 Width/Height, Step 2 BSP fields)
* Invalidation banner: dismissible yellow toast on upstream edits explaining what was cleared (auto-dismiss 4s); `invalidationMessage` field in `WizardState`, `CLEAR_INVALIDATION_MSG` action
* Regen button disabled during execution (`isRegenerating` local state in `InspectionShell`; shows "Regenerating…")
* Button `focus-visible` styles (cyan ring matching input focus treatment)
* Document title tracks batch progress ("Generating 42/300…") for tab monitoring
* Step indicator accessibility: `aria-current="step"`, `aria-label` with full step names, `role="navigation"` on stepper container

### Phase 2.5 Validation Checklist (CLOSED — retained for traceability)

1. Door throat placement validated in batch (no mid-corridor door chains; throat sites only)

2. Ordered trigger → gate invariant validated across door patterns (trigger room is earlier than gated room)

3. Circuit diagnostics identity validated (index-based diagnostics contract)

4. `gateThenOptionalReward` reliability validated under pressure (lever fallback removed the shallow-room scarcity failure class)

5. Sample-seed reproduction loop validated (batch → seed → single inspection)

---

## MILESTONE 5 STATUS — COMPLETE

**Milestone 5 is CLOSED and VALIDATED.**

All steering, hard constraints, seed curation, and UI stabilization work is complete. The full Policy Escalation Principle chain (diagnostic → soft steering → hard constraint) has been exercised and measured. Both lever-access anomaly classes are at 0%. The seed curation pipeline provides batch → curate → ship workflow.

---

## MILESTONE 6 — AUTHORIAL CONTROLS, DIFFICULTY BANDS & PACING

### Design Philosophy

Authorial controls are **hard constraints** on generation. Failures are acceptable because the production workflow is **batch generation + seed curation** — the generator produces a large pool of candidates, and only seeds satisfying all authorial requirements are shipped. This means:

* Controls can be strict; there is no need for soft fallbacks or best-effort degradation.
* A higher failure rate is an acceptable trade-off for tighter authorial precision.
* Batch diagnostics report which controls caused rejections, enabling authors to tune constraints.

### Control Categories

#### 1. Content Budgets

Hard caps and floors on what patterns emit per dungeon.

| Control                  | Type       | Example                                  |
|--------------------------|------------|------------------------------------------|
| Lever count              | min / max  | "exactly 1 lever", "2–3 levers"          |
| Block puzzle count       | min / max  | "at most 1 block puzzle"                 |
| Secret count             | min / max  | "at least 1 secret"                      |
| Chest count              | min / max  | "2–4 chests"                             |
| Hazard count             | min / max  | "no hazards", "1–2 hazards"              |
| Circuit count            | min / max  | "at most 3 circuits"                     |
| Door count               | min / max  | "3–5 doors"                              |

**Implementation approach:** Post-generation validation pass. After all patterns run, count each content type. Reject seeds that violate any budget constraint. Diagnostics report which budget was violated.

#### 2. Difficulty Bands

Constraints on structural complexity that correlate with perceived difficulty.

| Control                     | Type       | Example                                    |
|-----------------------------|------------|--------------------------------------------|
| Gate depth (max backtrack)  | min / max  | "no gate deeper than 3 rooms from start"   |
| Puzzle density              | range      | "0.5–1.5 puzzles per room on average"      |
| Critical path length        | min / max  | "main path is 4–8 rooms"                   |
| Branch count                | min / max  | "at least 1 off-main branch"               |
| Total room count            | min / max  | "6–12 rooms"                               |

**Implementation approach:** Post-generation measurement. Compute structural metrics from room graph + content metadata. Reject seeds outside the specified band. These metrics are already partially available in diagnostics; extend as needed.

#### 3. Pacing Targets

Constraints on the **rhythm** of progression grammar sequences (teach → gate → reward → shortcut).

| Control                         | Type       | Example                                        |
|---------------------------------|------------|-------------------------------------------------|
| First-gate distance from start  | min / max  | "first gate not before room 2"                  |
| Reward-after-gate guarantee     | boolean    | "every gate must have a reward within 2 rooms"  |
| Shortcut presence               | boolean    | "must include at least one shortcut loop"        |
| Content-free intro rooms        | min        | "at least 1 room with no puzzles at start"       |
| Ramp profile                    | enum       | "linear" / "front-loaded" / "back-loaded"        |

**Implementation approach:** Post-generation pacing analysis. Walk the room graph in progression order, evaluate pacing predicates. Reject seeds that fail pacing constraints. Ramp profiles may require defining density buckets across the critical path (e.g., first third / middle third / final third).

#### 4. Exclusion / Inclusion Rules

Direct control over which content types or patterns are allowed.

| Control                    | Type     | Example                                  |
|----------------------------|----------|------------------------------------------|
| Pattern exclusion          | blocklist| "no gateThenOptionalReward"              |
| Content type exclusion     | blocklist| "no plates", "no blocks"                 |
| Required pattern           | require  | "must include gateThenOptionalReward"     |
| Required content type      | require  | "must include at least one lever"         |

**Implementation approach:** Pre-generation (exclusions skip patterns entirely) and post-generation (required content verified after all patterns run).

#### 5. Seed Annotation & Tagging

Metadata attached to curated seeds for downstream consumption.

| Control                    | Type     | Example                                  |
|----------------------------|----------|------------------------------------------|
| Difficulty label           | string   | "easy" / "medium" / "hard"               |
| Theme tag                  | string[] | ["fire", "water", "tutorial"]            |
| Author notes               | string   | free-text                                |
| Curated flag               | boolean  | manual approval marker                   |

**Implementation approach:** Extend `SeedBankEntry` with optional authorial metadata fields. UI provides annotation interface in inspection view. Seed bank export includes all annotations.

### Wizard Integration

Authorial controls are configured in the wizard, likely as a new step or sub-step of the existing content strategy step (Step 4A):

* **Step 4A** gains an "Authorial Controls" panel with budget, difficulty, pacing, and exclusion settings.
* Controls have sensible defaults (unconstrained) so existing workflows are unaffected.
* Step 5 (Run Summary) displays active authorial constraints for confirmation.
* Batch mode benefits most: run large batches, curation filters by authorial constraints automatically.

### Batch Integration

* Batch summary reports **rejection rate by control category** (budget violations, difficulty band misses, pacing failures).
* Seed bank classification gains new tags: `budgetViolation`, `difficultyOutOfBand`, `pacingFailure`.
* Authors can iterate: tighten constraints → batch → check rejection rate → loosen if too restrictive.

### Implementation Phases (Proposed)

1. **Phase 1 — Content Budgets** (DONE — 2026-02-15): count-based post-generation validation. Constraint → reject → curate loop proven.
2. **Phase 2 — Difficulty Bands** (DONE — 2026-02-15): structural metrics (totalRooms, criticalPathLength, maxGateDepth, branchCount, puzzleDensity) with min/max constraints.
3. **Phase 3 — Pacing Targets**: progression-order analysis. Builds on difficulty band metrics.
4. **Phase 4 — Exclusion / Inclusion Rules**: pre-generation pattern filtering + post-generation required-content checks.
5. **Phase 5 — Seed Annotation**: metadata extension + UI for annotation. Lowest priority (workflow, not generation).

### Measurement Plan

* Each phase: run **1000-seed batch** with representative constraints, measure rejection rate.
* Baseline: unconstrained batch (should match current ~0.5% pattern failure rate).
* Target: authorial constraints should produce **≥50% good seeds** for reasonable constraint sets (e.g., "1–2 levers, 6–10 rooms, easy difficulty").
* Overly restrictive constraints (e.g., "exactly 1 lever, exactly 7 rooms, linear ramp") may have lower yield — that's acceptable as long as batch sizes can compensate.

---

### Phase 1 Implementation: Content Budgets (DONE — 2026-02-15)

**Architecture:**

Content budgets are **post-generation hard constraints**. After `generateDungeonContent()` returns, item counts in `content.meta.*` arrays are checked against authored min/max limits. No pattern logic is modified. Failures are acceptable — the batch curation workflow filters them out.

**Files changed:**

* **`src/wizard/wizardReducer.ts`**:
  * `ContentBudgetEntry` type: `{ min?: number; max?: number }`
  * `ContentBudget` type: optional entries for `levers`, `doors`, `plates`, `blocks`, `chests`, `secrets`, `hazards`, `monsters`, `keys`, `circuits`
  * Added `contentBudget: ContentBudget | null` to `ModeConfig`, `RunContract`, `SingleRunResult`
  * `SET_CONTENT_BUDGET` wizard action (Step 4 change — invalidates results only)
  * Wired through `deriveRunContract()`, `buildContract()`, `materializeMode()`, `RERUN_SEED_SINGLE`
  * Default: `null` (unconstrained — existing workflows unaffected)

* **`src/contentBudget.ts`** (NEW):
  * `BudgetViolation`: `{ category, actual, min?, max? }`
  * `BudgetResult`: `{ pass: boolean, violations: BudgetViolation[] }`
  * `validateContentBudget(meta, budget)`: counts each `meta.*` array, checks against budget entries

* **`src/App.tsx`**:
  * Budget validation called after `generateDungeonContent()` in both single and batch execution paths
  * `budgetResult` included in `SingleRunResult` and `BatchRunInput`

* **`src/batchStats.ts`**:
  * `BatchRunInput.budgetResult?: BudgetResult | null`
  * `BatchSummary.budget?`: `{ checkedCount, passCount, failCount, violationsByCategory }`
  * `aggregateBatchRuns()` accumulates budget pass/fail counts and per-category violation counts
  * `buildSeedBank()` tags seeds with `"budgetViolation"` when `budgetResult.pass === false`
  * Budget violations count as failed seeds (excluded from `"good"` classification)

* **`src/inspect/BatchResultsView.tsx`**:
  * `SeedFilter` extended with `"budgetViolation"` option
  * Budget filter tab shown when budget violations exist
  * Budget violation tag badge: amber (`#5a4a1a`)
  * Content Budget Summary panel: checked/pass/fail counts, rejection rate, violations by category

### Phase 2 Implementation: Difficulty Bands (DONE — 2026-02-15)

**Architecture:**

Difficulty bands are **post-generation hard constraints** on structural metrics. After generation, five metrics are computed from `content.meta` and checked against authored min/max limits. Metrics are always computed (even without constraints) so they're available for inspection.

**Metrics computed:**

| Metric | Source | Computation |
|--------|--------|-------------|
| `totalRooms` | `meta.rooms.length` | Direct count |
| `criticalPathLength` | `meta.mainPathRoomIds.length` | Main path room count |
| `maxGateDepth` | `meta.doors[].depth` | Highest door depth value |
| `branchCount` | `meta.roomGraph` + `mainPathRoomIds` | Off-main-path rooms with degree ≤ 1 |
| `puzzleDensity` | content arrays + rooms | `(doors + levers + plates + blocks) / rooms` |

**Files changed:**

* **`src/wizard/wizardReducer.ts`**:
  * `DifficultyBandEntry` and `DifficultyBand` types
  * Added `difficultyBand: DifficultyBand | null` to `ModeConfig`, `RunContract`, `SingleRunResult`
  * `SET_DIFFICULTY_BAND` wizard action (Step 4 change)
  * Wired through all contract derivation and mode construction paths

* **`src/contentBudget.ts`** (extended):
  * `DifficultyViolation`, `DifficultyMetrics`, `DifficultyResult` types
  * `validateDifficultyBand(meta, band)`: computes all 5 metrics, checks against band constraints
  * Always returns computed `metrics` object (useful even without active constraints)

* **`src/App.tsx`**: Calls `validateDifficultyBand()` in both single and batch paths

* **`src/batchStats.ts`**:
  * `BatchRunInput.difficultyResult?: DifficultyResult | null`
  * `BatchSummary.difficulty?`: `{ checkedCount, passCount, failCount, violationsByMetric }`
  * `buildSeedBank()` tags `"difficultyOutOfBand"` when difficulty band violated

* **`src/inspect/BatchResultsView.tsx`**:
  * `"difficultyOutOfBand"` filter tab (teal badge `#1a4a5a`)
  * Difficulty Band Summary panel with rejection rate and per-metric breakdown

---

## GENERAL PROJECT PLAN (HIGH LEVEL)

* **Milestone 1–3:** Geometry, runtime state, and circuit execution — complete

* **Milestone 4:** Composition patterns + progression grammar — complete

* **Milestone 5:** Intent steering and policy formation — **COMPLETE**

  * Phase 2.5: diagnostics + soft pressure — **CLOSED**
  * Phase 3: weighted steering + seed curation — **CLOSED**
  * Phase 4: selective hard constraints — **SHIPPED**
  * UI Stabilization & Polish — **CLOSED**

* **Milestone 6:** Authorial controls, difficulty bands, pacing targets — **current focus**

---

## REMINDERS

* UI must not introduce hidden policy
* Intent must be explicit before execution
* Diagnostics remain authoritative
* Escalation only after measured stability

---
