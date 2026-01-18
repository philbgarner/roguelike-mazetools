PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

CONTEXT VERSION: **2026-01-18 (rev B)**
LAST COMPLETED MILESTONE: **Milestone 3 — Stateful Puzzle Execution**
CURRENT MILESTONE: **Milestone 4 — Puzzle Composition & Progression Grammar**
CURRENT PHASE: **Phase 1 — Circuit Chaining (FOUNDATIONAL)**
PHASE STATUS: **ENGINE COMPLETE, DIAGNOSTICS PARITY ACHIEVED**

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

This milestone **composes existing systems** rather than introducing new mechanics.

============================================================
MILESTONE 4 — PHASE BREAKDOWN

------------------------------------------------------------
Phase 1 — Circuit Chaining (FOUNDATIONAL)

STATUS: **ENGINE COMPLETE**
STATUS: **DIAGNOSTICS PARITY ACHIEVED**
STATUS: **OBSERVATIONAL ONLY**

### What was completed

**Circuit chaining engine (`evaluateCircuits.ts`)**

* SIGNAL outputs are first-class circuit dependencies
* Circuits are topologically sorted by SIGNAL edges
* Same-tick chained evaluation is supported
* Deterministic behavior preserved
* Cycles detected via SCC (Tarjan)
* Cycle members vs downstream-of-cycle circuits distinguished
* Cycles never abort evaluation

**Diagnostics schema stabilization**

* `CircuitEvalDiagnostics` is now explicitly versioned (`schemaVersion: 1`)
* All diagnostics fields are stable and batch-safe

**Global circuit metrics (authoritative)**

Computed metrics include:

* circuitCount
* signalEdgeCount
* maxTopoDepth
* avgTopoDepth
* circuitsWithSignalDeps
* pctWithSignalDeps
* cycleGroupCount
* cycleCircuitCount
* blockedByCycleCount
* largestCycleSize

**Diagnostics UI (React)**

Structured, observational circuit diagnostics UI implemented:

* `CircuitDiagnosticsSection`
* `CircuitDiagToolbar`
* `CircuitList`
* `CircuitInspector`
* `GlobalCircuitMetrics`
* `circuitDiagnosticsVM` (pure selectors / view models)

The UI:

* Replaces raw JSON output
* Mirrors batch harness metrics exactly
* Makes circuit topology and composition visible
* Does not introduce difficulty semantics

**Batch harness parity**

* Batch runs now evaluate circuits once per dungeon
* Batch JSON includes the same global circuit metrics as the UI
* Metrics schema matches UI output (schemaVersion pinned)

No gameplay behavior has changed.

------------------------------------------------------------
Phase 1 — REMAINING (FINAL POLISH ONLY)

All remaining Phase 1 work is **purely presentational**:

* Minor diagnostics UI layout polish
* Edge-case rendering (empty graphs, single-node cycles)
* Confirm schema stability across long batch runs

Once complete, Phase 1 is **fully closed**.

------------------------------------------------------------
Phase 2 — Puzzle Roles & Difficulty Ramping (NEXT)

STATUS: **READY TO BEGIN**

Goals:

* Assign semantic roles to composed puzzles:
  * MAIN_PATH_GATE
  * OPTIONAL_REWARD
  * SHORTCUT
  * FORESHADOW

* Enforce progression rules using diagnostics:
  * Minimum topo depth for main-path gates
  * Reject trivial gates late in dungeon
  * Gradually escalate puzzle depth over room distance

Key principle:

* No new mechanics
* Roles are annotations
* Rules consume diagnostics already produced

------------------------------------------------------------
Phase 3 — Composition Patterns (PLANNED)

* Introduce multi-circuit pattern macros:
  * Lever → Gate → Plate → Reward
  * Consequence-before-cause setups

* Pattern selection informed by:
  * Room distance
  * Main-path vs optional classification
  * Puzzle budget constraints

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
* Diagnostics quantify reliability
* Batch harness converts intuition into data
* Milestone 4 turns correctness into progression grammar
