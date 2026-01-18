PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

CONTEXT VERSION: **2026-01-18 (rev D)**
LAST COMPLETED MILESTONE: **Milestone 3 — Stateful Puzzle Execution**
CURRENT MILESTONE: **Milestone 4 — Puzzle Composition & Progression Grammar**
CURRENT PHASE: **Phase 2 — Puzzle Roles & Difficulty Ramping**
PHASE STATUS: **ROLE DIAGNOSTICS IMPLEMENTED + UI SURFACED (OBSERVATIONAL)**

SAFE ASSUMPTIONS (DO NOT RE-DISCUSS):

* Geometry mutation uses **Option A** (distance field recomputed post-patterns)
* Pattern diagnostics are authoritative
* Batch harness is correct and trusted
* Generation is deterministic and best-effort (never aborts)

============================================================
PROJECT OVERVIEW

This project is an experimental procedural dungeon generator built in TypeScript
with a React-based debug, inspection, and batch-validation harness.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system
emphasizing:

* backtracking
* secrets
* puzzles
* progression gating
* systemic reliability

The system is intentionally layered so that:

* geometry
* gameplay intent
* runtime puzzle logic

are cleanly separated.

This separation is foundational, enforced in code, and **proven viable** through
runtime execution, diagnostics, and large-scale batch validation.

============================================================
HIGH-LEVEL ARCHITECTURE

The system has three conceptual layers:

------------------------------------------------------------
STRUCTURAL DUNGEON GENERATION (BSP)

Entry: `generateBspDungeon()` in `mazeGen.ts`

Responsibilities:

* BSP partitioning of the grid
* Room carving
* Corridor carving
* Wall preservation (optional outer wall retention)
* Distance-to-wall calculation
* Region (room) identification

Outputs:

* `solid` mask (wall/floor)
* `regionId` mask
* `distanceToWall` mask
* BSP metadata (rooms, corridors, depth, seed)

This layer is **pure geometry** and contains no gameplay knowledge.

------------------------------------------------------------
CONTENT GENERATION (Milestones 1–3)

Entry: `generateDungeonContent()` in `mazeGen.ts`

Responsibilities:

* Place gameplay content on top of BSP geometry
* Encode progression, gating, and optional content
* Express puzzle intent declaratively
* Guarantee solvability by construction (best-effort)
* Remain fully deterministic from seed/options

This layer **does not execute puzzle logic**.

------------------------------------------------------------
RUNTIME / PUZZLE LOGIC (Milestone 3+)

Core files:

* `dungeonState.ts`
* `evaluateCircuits.ts`
* `walkability.ts`
* `App.tsx` (debug UI + batch harness)

Responsibilities:

* Hold mutable gameplay state (doors, levers, plates, blocks, hazards, secrets)
* Derive sensor state (plates from blocks; player later)
* Evaluate circuits deterministically
* Apply effects (open doors, toggle hazards, reveal passages)
* Drive interactive puzzle simulation (debug harness first)

============================================================
IMPLEMENTED & VERIFIED (DO NOT RE-DISCUSS)

------------------------------------------------------------
GEOMETRY MUTATION POLICY (OPTION A — DECIDED)

Puzzle patterns may carve geometry by mutating `dungeon.masks.solid`,
invalidating the distance field.

Chosen policy:

* All geometry-mutating patterns run before final distance usage
* `distanceToWall` is recomputed once if **any** pattern carved
* Implemented via `runPatternsBestEffort()` → `didCarve` flag

This policy is implemented, verified, and stable.

------------------------------------------------------------
CONTENT MASKS & METADATA

`featureType` values (authoritative):

* 0 = none
* 1 = monster
* 2 = chest
* 3 = legacy secret door (wall)
* 4 = door
* 5 = key
* 6 = lever
* 7 = pressure plate
* 8 = push block
* 9 = hidden passage
* 10 = hazard

Invariants:

* featureType 9 MUST have non-zero featureId
* `meta.secrets[]` is authoritative for hidden passages
* Masks are for inspection; metadata is authoritative

------------------------------------------------------------
PUZZLE PATTERNS (MILESTONE 3)

Patterns are **generation-time macros**, not runtime logic.

Properties:

* Best-effort (never abort generation)
* Deterministic
* May mutate geometry (explicitly reported)
* Emit structured diagnostics
* Names are stable and batch-aggregatable

Implemented patterns:

1. **leverHiddenPocket**
   * Carving + hidden passage reveal
   * Lever → Hidden(REVEAL), PERSISTENT
   * Reachability validated pre/post

2. **leverOpensDoor**
   * Lever → Door(TOGGLE)
   * Non-carving

3. **plateOpensDoor**
   * Plate(+Block) → Door(OPEN), MOMENTARY
   * Non-carving

------------------------------------------------------------
REACHABILITY DIAGNOSTICS

Hidden-pocket pattern records:

* reachablePre
* reachablePost
* shortestPathPost

Failure modes are classified (isolation, connectivity, triviality).

------------------------------------------------------------
BATCH VALIDATION HARNESS

Implemented and trusted.

Capabilities:

* Hundreds of seeds per run
* Per-pattern aggregation
* Success / failure rates
* Reachability metrics
* Failure histograms
* JSON export

============================================================
MILESTONE STATUS

------------------------------------------------------------
Milestone 3 — COMPLETE, STABLE, AND MEASURABLE

* Runtime puzzle execution works end-to-end
* Geometry mutation is safe and repaired
* Pattern reliability is quantifiable
* No silent failures remain

------------------------------------------------------------
Milestone 4 — Puzzle Composition & Progression Grammar

Milestone 4 shifts focus from **mechanical correctness**
to **player-facing meaning, escalation, and composition**.

No new mechanics are introduced in this milestone.

============================================================
MILESTONE 4 — PHASE BREAKDOWN

------------------------------------------------------------
Phase 1 — Circuit Chaining (FOUNDATIONAL)

STATUS: **COMPLETE**
STATUS: **DIAGNOSTICS PARITY ACHIEVED**
STATUS: **CLOSED**

Completed:

* SIGNAL-based circuit chaining
* Deterministic topo sorting with cycle handling
* Same-tick chained evaluation
* Cycle detection without abort
* Stable, versioned diagnostics schema
* Full UI + batch parity for circuit metrics

------------------------------------------------------------
Phase 2 — Puzzle Roles & Difficulty Ramping (CURRENT)

STATUS: **ROLE DIAGNOSTICS IMPLEMENTED**
STATUS: **UI SURFACED**
STATUS: **OBSERVATIONAL ONLY**

Phase 2 introduces *semantic meaning* to composed puzzles
without enforcing behavior.

------------------------------------------------------------
What was completed

**Role diagnostics engine (`roleDiagnostics.ts`)**

* New schema: `RoleDiagnosticsV1` (schemaVersion = 1)
* Supported semantic puzzle roles:
  * `MAIN_PATH_GATE`
  * `OPTIONAL_REWARD`
  * `SHORTCUT`
  * `FORESHADOW`

* Deterministic per-circuit anchor derivation:
  * Anchors derived from trigger/target roomIds
  * Door targets anchored to earliest side by room distance
  * SIGNAL-only circuits anchored via upstream dependency propagation

* Role-aware metrics recorded per circuit:
  * topoDepth
  * signalDepCount
  * cycle participation / blocking
  * anchor room depth
  * normalized depth (`depthN`)
  * main-path membership

**Default progression thresholds (v1)**

* Conservative, distance-ramped defaults
* Designed for observation, not enforcement
* Explicit versioning to allow recalibration

**Role rule evaluation (warnings only)**

Initial rule set implemented:

* `ROLE_MISSING`
* `MAIN_TRIVIAL`
* `MAIN_LATE_TRIVIAL`
* `MAIN_TOO_DEEP_EARLY`
* `OPTIONAL_TRIVIAL`
* `FORESHADOW_TOO_DEEP`
* `FORESHADOW_AFTER_MAIN`

Rules emit diagnostics only.
No generation is rejected.

**Summary statistics**

Batch-safe summary metrics computed:

* roleCounts
* roleMissingCount
* topoDepth distributions by role
* depthN distributions by role
* ruleCounts histogram

------------------------------------------------------------
Role Diagnostics UI (NEW)

A read-only diagnostics panel has been added alongside Circuit Diagnostics.

Capabilities:

* Per-circuit role listing with sortable metrics
* Role filtering and search (idx / role / rule)
* Rule-hit inspection per circuit
* Aggregate role counts and rule histograms
* Shared selection state with Circuit Diagnostics
* No mutation, no enforcement, batch-safe

This UI makes progression structure and semantic anomalies
directly visible during interactive inspection.

------------------------------------------------------------
What Phase 2 is NOT doing (by design)

* No new mechanics
* No automatic role inference
* No hard rejections
* No generator tuning based on roles
* No multi-circuit composition

Phase 2 exists to **observe, measure, and calibrate**.

============================================================
NEXT STEPS (IMMEDIATE)

1. **Batch integration**
   * Export compact role diagnostics summary into batch JSON
   * Run large seed batches (500–1000)
   * Examine distributions before tuning

2. **Threshold calibration**
   * Adjust default thresholds using empirical data
   * Keep all rules non-fatal
   * Version thresholds explicitly (e.g. v2)

3. **UI polish (optional)**
   * Visual emphasis for main-path vs optional roles
   * Small sparklines or histograms per role (read-only)

------------------------------------------------------------
Phase 2.5 — Soft Enforcement (PLANNED)

Once empirical data supports it:

* Promote selected warnings (e.g. `MAIN_LATE_TRIVIAL`)
  to **best-effort rejections**
* Still deterministic
* Still never abort full generation

------------------------------------------------------------
Phase 3 — Composition Patterns (PLANNED)

Introduce multi-circuit composition informed by roles:

* Lever → Gate → Plate → Reward
* Consequence-before-cause setups
* Intentional foreshadow → payoff chains

Pattern selection informed by:

* Room distance
* Role budgets
* Existing role diagnostics
* Main-path vs optional classification

No new mechanics are introduced in Phase 3.

============================================================
KNOWN CONSTRAINTS

* Generation must remain deterministic
* Patterns must never abort generation
* Runtime logic must not mutate geometry
* Diagnostics are authoritative

============================================================
NON-GOALS (FUTURE MILESTONES)

* Combat-triggered puzzles
* Time-pressure mechanics
* Inventory-based puzzle items
* Scripted narrative events

============================================================
MENTAL MODEL SUMMARY

* BSP creates space
* Content generation expresses intent
* Patterns add structured puzzles
* Circuits encode logic
* Signals compose logic
* Runtime executes state
* Diagnostics quantify structure
* Batch harness converts intuition into data
* Milestone 4 turns correctness into progression grammar
