# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-21 (rev M)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Phase 2.5 — Soft Enforcement Instrumentation (DIAGNOSTIC-ONLY)**
**PHASE STATUS:** **GRAPH-LEVEL INTENT MISALIGNMENTS INSTRUMENTED; NO PLACEMENT CHANGES YET**

---

## SAFE ASSUMPTIONS (DO NOT RE-DISCUSS)

* Geometry mutation uses **Option A** (distance field recomputed post-patterns)
* Pattern diagnostics are authoritative
* Batch harness is correct and trusted
* Generation is deterministic and best-effort (never aborts)

---

## PROJECT OVERVIEW

This project is an experimental procedural dungeon generator built in TypeScript with a React-based debug, inspection, and batch-validation harness.

It is designed to evolve toward a JRPG / metroidvania-style dungeon system emphasizing:

* backtracking
* secrets
* puzzles
* progression gating
* systemic reliability

The system is intentionally layered so that:

* geometry
* gameplay intent
* runtime puzzle logic

are cleanly separated, enforced in code, and verified through runtime simulation and batch diagnostics.

---

## HIGH-LEVEL ARCHITECTURE

### STRUCTURAL DUNGEON GENERATION (BSP)

**Entry:** `generateBspDungeon()` in `mazeGen.ts`

Responsibilities:

* BSP partitioning
* Room carving
* Corridor carving
* Wall preservation
* Distance-to-wall calculation
* Region (room) identification

Outputs:

* `solid`, `regionId`, `distanceToWall` masks
* BSP metadata (rooms, corridors, depth, seed)

This layer is **pure geometry** and contains no gameplay knowledge.

---

### CONTENT GENERATION (Milestones 1–5)

**Entry:** `generateDungeonContent()` in `mazeGen.ts`

Responsibilities:

* Place gameplay content on geometry
* Encode progression intent declaratively
* Express puzzle structure via patterns
* Guarantee solvability by construction (best-effort)
* Remain deterministic from seed/options

This layer **does not execute puzzle logic**.

---

### RUNTIME / PUZZLE LOGIC (Milestone 3+)

Core files:

* `dungeonState.ts`
* `evaluateCircuits.ts`
* `walkability.ts`
* `App.tsx` (debug UI + batch harness)

Responsibilities:

* Hold mutable gameplay state
* Evaluate circuits deterministically
* Apply effects (doors, hazards, secrets)
* Drive interactive simulation (debug harness)

---

## IMPLEMENTED & VERIFIED (DO NOT RE-DISCUSS)

### GEOMETRY MUTATION POLICY — OPTION A

* Geometry-mutating patterns run before final distance usage
* `distanceToWall` recomputed once if **any** pattern carved
* Implemented via `runPatternsBestEffort()` → `didCarve`

Stable and verified.

---

### CONTENT MASKS & METADATA

Authoritative `featureType` values:

* 0 none
* 1 monster
* 2 chest
* 3 legacy secret door
* 4 door
* 5 key
* 6 lever
* 7 pressure plate
* 8 push block
* 9 hidden passage
* 10 hazard

Invariants:

* featureType 9 MUST have non-zero featureId
* `meta.secrets[]` is authoritative
* Masks are diagnostic; metadata is authoritative

---

### PUZZLE PATTERNS (MILESTONE 3)

Stable patterns:

1. **leverHiddenPocket** *(carving; reachability validated with multi-candidate retry)*
2. **leverOpensDoor** *(non-carving)*
3. **plateOpensDoor** *(non-carving)*

All patterns are:

* deterministic
* best-effort
* batch-aggregatable
* diagnostics-emitting

---

### BATCH VALIDATION HARNESS

Capabilities:

* Hundreds to thousands of seeds per run
* Per-pattern aggregation
* Success/failure rates
* Failure histograms
* Circuit topology metrics
* JSON export

Trusted and authoritative.

---

## STRUCTURAL LANDMARK VISUALIZATION

### Entrance Tile

* Identified via `content.meta.entranceRoomId`
* Center tile rendered **cyan**
* Render-only; no gameplay impact

### Exit Tile

* Identified via `content.meta.farthestRoomId`
* Center tile rendered **purple**
* Render-only; no gameplay impact

---

## MILESTONE STATUS

### Milestone 3 — COMPLETE, STABLE

* Runtime puzzle execution verified
* Geometry mutation safe
* Diagnostics trustworthy
* No silent failures

---

### Milestone 4 — PUZZLE COMPOSITION & PROGRESSION GRAMMAR

Milestone 4 focused on **meaning, escalation, and structure**, not new mechanics.

#### Phase 1 — Circuit Chaining

**STATUS:** COMPLETE / CLOSED

#### Phase 2 — Puzzle Roles & Difficulty Ramping

**STATUS:** ROLE DIAGNOSTICS IMPLEMENTED
**STATUS:** UI SURFACED
**STATUS:** OBSERVATIONAL ONLY (BY DESIGN)

#### Phase 3 — Composition Patterns

**STATUS:** COMPLETE
**STATUS:** RELIABILITY PATCHED
**STATUS:** CLOSED

---

## PHASE 3 — COMPOSITION PATTERN

### `gateThenOptionalReward`

A two-circuit, role-aware composition:

* **MAIN_PATH_GATE**

  * Lever-toggle door on main path

* **OPTIONAL_REWARD**

  * Branch door gated by `(PLATE && SIGNAL(gate ACTIVE))`
  * Chest placed in optional branch

Uses SIGNAL dependency to express logical composition.

---

## NEW IN REV M — GRAPH-LEVEL GATE REUSE INSTRUMENTATION

### Motivation

With Milestone 4 complete, composition reliability revealed a **semantic misalignment**:

* Multiple doors can be placed along the **same room-graph edge**
* This produces stacked or redundant gates
* Tile-level validity is preserved, but **progression meaning is degraded**

This is **not a bug** — it is an intent-modeling gap.

---

### Canonical Interpretation (LOCKED)

* **Doors** are mechanical actuators
* **Gates** are graph separations
* Progression intent operates at the **room-graph level**, not the tile level

---

### Instrumentation Added (NO BEHAVIOR CHANGE)

The following diagnostic-only additions were implemented:

#### Graph Edge Identity

* New helper: `graphEdgeId(roomA, roomB)`
* Produces canonical, order-independent room-graph edge IDs
* Used exclusively for diagnostics (no placement logic yet)

#### Gate Edge Reuse Diagnostic

* New diagnostic payload: `GateEdgeReuseDiagV1`
* Emitted by `gateThenOptionalReward` on **successful placement**
* Tracks:

  * total doors placed
  * unique graph edges used
  * reuse of edges already occupied before this pattern
  * reuse within the same pattern commit

#### Plumbing

* `PatternResult` and `PatternDiagnostics` extended to carry `gateEdgeReuse`
* `runPatternsBestEffort()` forwards the diagnostic unchanged
* No placement heuristics modified

#### Batch Aggregation

* `aggregateBatchRuns()` extended to compute `gateEdgeReuseAvg` per pattern
* Reported metrics include:

  * average doors placed
  * average unique edges
  * reuse frequency
  * percent of runs exhibiting edge reuse

This allows **quantitative measurement of stacked-gate frequency** across thousands of seeds.

---

## CURRENT STATE SUMMARY

* Milestone 4 is **fully closed and validated**
* Composition patterns are stable and expressive
* Intent/placement misalignment is now **measured, not hypothesized**
* No enforcement or bias has been introduced yet
* The system remains deterministic and best-effort

---

## NEXT STEPS — MILESTONE 5 (PHASE 2.5 → PHASE 3)

### Phase 2.5 — Soft Enforcement (NEXT)

**Goal:** Align gate placement with progression intent **without hard constraints**.

Planned steps:

1. **Observe Batch Metrics**

   * Run 1k–5k seed batches
   * Establish baseline gate-edge reuse rates

2. **Introduce Candidate Scoring (NOT vetoes)**

   * Prefer unused graph edges
   * Prefer monotonic depth progression
   * Bias increases only on retries

3. **Retry Escalation**

   * Early attempts: local, cheap, permissive
   * Later attempts: deeper, unused edges preferred

4. **No Hard Guarantees**

   * Never abort generation
   * Never forbid reuse outright
   * Preserve determinism

---

## REFINED MENTAL MODEL

* BSP creates space
* Content expresses intent
* **Progression intent lives at the graph level**
* Patterns compose structure
* Circuits encode logic
* Signals compose logic
* Runtime executes state
* Diagnostics quantify structure
* Batch harness turns intuition into data
* **Search order shapes meaning**
* **Gates are graph cuts, not tiles**
* **Milestone 4 proved composition**
* **Milestone 5 aligns intent with placement**

---
