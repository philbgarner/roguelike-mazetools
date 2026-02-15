# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM (CONDENSED; M6 HIGH-FIDELITY)

**CONTEXT VERSION:** **2026-02-15 (rev AK)**
**LAST COMPLETED MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT MILESTONE:** **Milestone 6 — Authorial Controls, Difficulty Bands & Pacing**
**CURRENT PHASE:** **Milestone 6 Phase 3 — Pacing Targets**
**PHASE STATUS:** **PHASE 1 + PHASE 2 + PHASE 3 SHIPPED**

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

## WIZARD FLOW + INVALIDATION (CONDENSED, STILL LOCKED)

Wizard enforces strict staging: **configuration → execution → inspection**.

* **Step 1:** seed + dimensions (no generation)
* **Step 2:** BSP geometry settings (geometry only)
* **Step 3:** single vs batch
* **Step 4:** content strategy + authorial controls (single) / batch params (batch)
* **Step 5:** mandatory read-only confirmation; execution can only start here
* **Step 6:** generation execution (no inspection mounted)
* **Step 7:** post-generation inspection (single interactive; batch summary-only)

Invalidation principle (high-level):

* upstream changes invalidate downstream artifacts; inspection is torn down on any post-execution change.
* Step 4 edits invalidate results only (not world geometry config).

---

# MILESTONE 6 — AUTHORIAL CONTROLS, DIFFICULTY BANDS & PACING (HIGH FIDELITY)

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

## Wizard Integration (M6)

* Controls are configured via wizard (currently treated as part of Step 4A “Content Strategy” for single; batch benefits most).
* Step 5 run summary must display active constraints (explicit author intent).
* Invalidation: changing authorial controls invalidates results only (must re-run).

---

## Batch Integration (M6)

* Batch summary must report **rejection rate by category** and per-control breakdown.
* Seed bank classification gains tags for authorial failures:

  * `"budgetViolation"`
  * `"difficultyOutOfBand"`
  * `"pacingFailure"`
* Seed curation remains the primary workflow: tighten constraints → batch → observe yield → tune constraints.

---

## PHASE 1 — CONTENT BUDGETS (SHIPPED — 2026-02-15)

### Contract

* Budgets are **post-generation hard constraints** validated after `generateDungeonContent()` returns.
* No pattern logic is modified to “aim for” budgets; instead, seeds that violate budgets are rejected/tagged for curation.
* Diagnostics/reporting must name which categories violated.

### Data Model (Wizard / Contract / Result)

* `ContentBudgetEntry`: `{ min?: number; max?: number }`
* `ContentBudget`: optional entries for:
  `levers`, `doors`, `plates`, `blocks`, `chests`, `secrets`, `hazards`, `monsters`, `keys`, `circuits`
* Stored on:

  * `ModeConfig`, `RunContract`, `SingleRunResult` as `contentBudget: ContentBudget | null`
* Wizard action:

  * `SET_CONTENT_BUDGET` (Step 4 change — invalidates results only)
* Default:

  * `null` (unconstrained)

### Validation Module

* `src/contentBudget.ts` (NEW)

  * `BudgetViolation`: `{ category, actual, min?, max? }`
  * `BudgetResult`: `{ pass: boolean, violations: BudgetViolation[] }`
  * `validateContentBudget(meta, budget)`:

    * counts each `meta.*` array
    * checks against min/max per category
    * returns pass + violations

### Execution Wiring

* `src/App.tsx`

  * Calls budget validation after `generateDungeonContent()` in both **single** and **batch** execution paths.
  * Plumbs `budgetResult` into results.

### Batch + Seed Bank

* `src/batchStats.ts`

  * `BatchRunInput.budgetResult?: BudgetResult | null`
  * `BatchSummary.budget?`: `{ checkedCount, passCount, failCount, violationsByCategory }`
  * `aggregateBatchRuns()` accumulates pass/fail and per-category violation counts
  * `buildSeedBank()` tags seeds with `"budgetViolation"` when `budgetResult.pass === false`
  * Budget violations exclude seeds from `"good"` classification

### Batch UI

* `src/inspect/BatchResultsView.tsx`

  * Seed filter includes `"budgetViolation"` tab (shown when violations exist)
  * Budget Summary panel: checked/pass/fail counts, rejection rate, violations by category
  * Budget violation badge styling: amber (`#5a4a1a`)

---

## PHASE 2 — DIFFICULTY BANDS (SHIPPED — 2026-02-15)

### Contract

* Difficulty bands are **post-generation hard constraints** validated after generation.
* Metrics are always computed (even when unconstrained) so inspection can display them.
* Reject seeds outside min/max bands; report which metric failed.

### Data Model (Wizard / Contract / Result)

* `DifficultyBandEntry`: `{ min?: number; max?: number }`
* `DifficultyBand`: entries per metric (below)
* Stored on:

  * `ModeConfig`, `RunContract`, `SingleRunResult` as `difficultyBand: DifficultyBand | null`
* Wizard action:

  * `SET_DIFFICULTY_BAND` (Step 4 change — invalidates results only)
* Default:

  * `null` (unconstrained)

### Metrics Computed

| Metric               | Source                               | Computation                                  |
| -------------------- | ------------------------------------ | -------------------------------------------- |
| `totalRooms`         | `meta.rooms.length`                  | direct count                                 |
| `criticalPathLength` | `meta.mainPathRoomIds.length`        | main path room count                         |
| `maxGateDepth`       | `meta.doors[].depth`                 | max depth value                              |
| `branchCount`        | `meta.roomGraph` + `mainPathRoomIds` | off-main rooms with degree ≤ 1               |
| `puzzleDensity`      | content arrays + rooms               | `(doors + levers + plates + blocks) / rooms` |

### Validation Module (Extension)

* `src/contentBudget.ts` extended with:

  * `DifficultyMetrics`, `DifficultyViolation`, `DifficultyResult`
  * `validateDifficultyBand(meta, band)`:

    * computes all 5 metrics
    * checks min/max constraints
    * returns `{ pass, violations, metrics }` (metrics always present)

### Execution Wiring

* `src/App.tsx`

  * Calls `validateDifficultyBand()` in both single and batch paths; attaches results.

### Batch + Seed Bank

* `src/batchStats.ts`

  * `BatchRunInput.difficultyResult?: DifficultyResult | null`
  * `BatchSummary.difficulty?`: `{ checkedCount, passCount, failCount, violationsByMetric }`
  * `buildSeedBank()` tags `"difficultyOutOfBand"` when violated

### Batch UI

* `src/inspect/BatchResultsView.tsx`

  * `"difficultyOutOfBand"` filter tab (teal badge `#1a4a5a`)
  * Difficulty Summary panel: rejection rate + per-metric breakdown

---

## PHASE 3 — PACING TARGETS (SHIPPED — 2026-02-15)

### Contract

* Pacing targets are **post-generation hard constraints** validated after generation.
* Metrics are always computed (even when unconstrained) so inspection can display them.
* Reject seeds that violate pacing constraints; report which metric failed.

### Data Model (Wizard / Contract / Result)

* `RampProfile`: `"linear" | "front-loaded" | "back-loaded"`
* `PacingTargets`: optional entries for 5 controls:

  * `firstGateDistance?: { min?: number; max?: number }`
  * `rewardAfterGate?: { enabled?: boolean; maxDistance?: number }`
  * `contentFreeIntro?: { min?: number }`
  * `shortcutPresent?: { required?: boolean }`
  * `rampProfile?: { target?: RampProfile }`
* Stored on:

  * `ModeConfig`, `RunContract`, `SingleRunResult` as `pacingTargets: PacingTargets | null`
* Wizard action:

  * `SET_PACING_TARGETS` (Step 4 change — invalidates results only)
* Default:

  * `null` (unconstrained)

### Metrics Computed

| Metric                   | Source                                     | Computation                                                              |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| `firstGateDistance`      | `mainPathRoomIds` + `doors[]`              | index of first door on critical path (-1 if none)                        |
| `rewardAfterGateRate`   | critical-path gates + `chests[]`           | fraction of gates with a chest within N rooms after (default N=2)        |
| `contentFreeIntroCount` | `mainPathRoomIds` + all content arrays     | consecutive rooms from start with zero content                           |
| `shortcutPresent`       | `roomGraph`                                | `edges > nodes - 1` (any cycle = shortcut)                              |
| `rampProfileActual`     | 3-bucket content density on critical path  | classify as linear/front-loaded/back-loaded via 1.5x ratio threshold     |

### Validation Module

* `src/pacingTargets.ts` (NEW)

  * `PacingViolation`: `{ metric, actual, expected?, detail? }`
  * `PacingMetrics`: all 5 metrics + `rampBuckets: [number, number, number]`
  * `PacingResult`: `{ pass: boolean, violations: PacingViolation[], metrics: PacingMetrics }`
  * `validatePacingTargets(meta, targets)`:

    * always computes all metrics (even when `targets` is null)
    * checks constraints only when `targets` is non-null
    * returns `{ pass, violations, metrics }` (metrics always present)

### Execution Wiring

* `src/App.tsx`

  * Calls `validatePacingTargets()` in both **single** and **batch** execution paths after difficulty validation.
  * Plumbs `pacingResult` into results.

### Batch + Seed Bank

* `src/batchStats.ts`

  * `BatchRunInput.pacingResult?: PacingResult | null`
  * `BatchSummary.pacing?`: `{ checkedCount, passCount, failCount, violationsByMetric }`
  * `aggregateBatchRuns()` accumulates pass/fail and per-metric violation counts
  * `buildSeedBank()` tags seeds with `"pacingFailure"` when `pacingResult.pass === false`
  * Pacing violations exclude seeds from `"good"` classification

### Batch UI

* `src/inspect/BatchResultsView.tsx`

  * Seed filter includes `"pacingFailure"` tab (shown when violations exist)
  * Pacing Targets Summary panel: checked/pass/fail counts, rejection rate, violations by metric
  * Pacing failure badge styling: purple (`#4a1a5a`)

---

## PHASE 4 — EXCLUSION / INCLUSION RULES (NEXT)

* Pre-generation:

  * pattern/content-type blocklists skip patterns entirely.
* Post-generation:

  * required pattern/content checks reject seeds if missing.
* Seed bank tags:

  * `"requiredMissing"` / `"excludedPresent"` (names TBD, but must be explicit)

---

## PHASE 5 — SEED ANNOTATION (PLANNED, LOW PRIORITY)

* Extend `SeedBankEntry` with optional author metadata:

  * difficulty label, theme tags, notes, curated flag, etc.
* UI: annotation interface in inspection; export includes annotations.

---

## CURRENT STATE SUMMARY (CONDENSED, M6-FOCUSED)

* Milestone 5 is **closed**; seed curation workflow is canonical.
* Milestone 6 **Phase 1 shipped**: content budgets validated post-generation; violations tagged; batch UI summarizes; seed bank filters.
* Milestone 6 **Phase 2 shipped**: difficulty metrics computed + validated post-generation; violations tagged; batch UI summarizes; seed bank filters.
* Milestone 6 **Phase 3 shipped**: pacing metrics (first-gate distance, reward-after-gate, content-free intro, shortcut presence, ramp profile) computed + validated post-generation; violations tagged; batch UI summarizes; seed bank filters.
* Next: Milestone 6 **Phase 4 exclusion/inclusion rules** (pre-generation pattern filtering + post-generation required-content verification).

---

## GENERAL PROJECT PLAN (HIGH LEVEL, SHORT)

* Milestones 1–4: geometry/runtime/circuits + progression composition — complete
* Milestone 5: diagnostics → soft steering → hard safety nets + seed curation — complete
* Milestone 6: authorial controls (budgets, difficulty, pacing, include/exclude, annotation) — current

---

## REMINDERS (LOCKED)

* UI must not introduce hidden policy
* Author intent must be explicit before execution (wizard Step 5 confirmation)
* Diagnostics remain authoritative and explain rejections
* Determinism preserved; batch harness is the truth source
