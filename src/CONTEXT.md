---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-18 (rev G)**
**LAST COMPLETED MILESTONE:** **Milestone 3 — Stateful Puzzle Execution**
**CURRENT MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT PHASE:** **Phase 3 — Composition Patterns (ROLE-AWARE, BEST-EFFORT)**
**PHASE STATUS:** **PHASE 3 ONLINE, RELIABILITY DIAGNOSED, STRUCTURAL LIMITS IDENTIFIED**

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

### CONTENT GENERATION (Milestones 1–4)

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

1. **leverHiddenPocket** *(carving; reachability validated)*
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

* Hundreds of seeds per run
* Per-pattern aggregation
* Success/failure rates
* Failure histograms
* Circuit structure metrics
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

## MILESTONE 4 — PUZZLE COMPOSITION & PROGRESSION GRAMMAR

Milestone 4 focuses on **meaning, escalation, and structure**, not new mechanics.

---

## MILESTONE 4 — PHASE BREAKDOWN

### Phase 1 — Circuit Chaining

**STATUS:** COMPLETE
**STATUS:** CLOSED

---

### Phase 2 — Puzzle Roles & Difficulty Ramping

**STATUS:** ROLE DIAGNOSTICS IMPLEMENTED
**STATUS:** UI SURFACED
**STATUS:** OBSERVATIONAL ONLY

Provides semantic meaning without enforcement.

---

### Phase 3 — Composition Patterns (CURRENT)

**STATUS:** FIRST ROLE-AWARE COMPOSITION PATTERN IMPLEMENTED
**STATUS:** RELIABILITY INVESTIGATED VIA BATCH
**STATUS:** STRUCTURAL FAILURE MODES IDENTIFIED

---

## PHASE 3 — CURRENT IMPLEMENTATION

### Composition Pattern: `gateThenOptionalReward`

A two-circuit, role-aware composition:

* MAIN_PATH_GATE on main path
* OPTIONAL_REWARD branch behind a plate + signal
* Uses SIGNAL dependency (`PLATE && SIGNAL(gate ACTIVE)`)

---

## PHASE 3 — RECENT WORK (NEW IN rev G)

### Branch-Retry Fallback Implemented

* Pattern now retries **multiple off-main branch neighbors** for the same deep room
* Prevents early failure when one branch edge is unusable
* Deterministic and best-effort
* No regression in other patterns

---

### Batch Results After Fallback (300 seeds)

* `gateThenOptionalReward` okRate: **0.95 (286/300)**
* Failures unchanged from baseline

Dominant failure reasons:

1. **Failed: no viable branch door site** (9)
2. **No main-path edge has an off-main branch with a door site** (5)

Circuit health unchanged:

* `signalEdgeCountAvg ≈ 0.95`
* `maxTopoDepthAvg ≈ 0.95`
* Cycles: **0**

---

## DIAGNOSIS (IMPORTANT)

The branch-retry fallback **worked correctly**, but **did not activate** in the failing cases.

This revealed the true limiting factor:

### Failure Class A

**No main-path edge has an off-main branch with a door site**

* Structural/topological limitation
* Occurs **before attempts begin**
* Not fixable via retries

### Failure Class B

**Failed: no viable branch door site**

* Branch retry exhausted
* Root cause is **attempt budget being consumed on the same main-path edge**
* Indicates **main-edge exhaustion**, not branch choice failure

---

## KEY INSIGHT (PHASE 3)

> Remaining failures are caused by **insufficient exploration of distinct main-path edges**, not incorrect branch selection.

This is a **structural search ordering issue**, not a logic bug.

---

## NEXT STEPS (IMMEDIATE, HIGH-ROI)

### 1) Main-Edge Retry Strategy (REQUIRED)

Refactor `gateThenOptionalReward` attempt loop to prioritize **main-edge exploration**:

Recommended structure:

* Iterate over distinct main-path edges first
* For each edge, try a small fixed number of branch placements
* Avoid burning entire attempt budget on a single bad corridor

This is expected to push okRate toward **98–99%**.

---

### 2) Candidate Availability Counters (OPTIONAL BUT VALUABLE)

Add diagnostics to record:

* main-path edges with off-main neighbors
* edges with at least one usable branch site
* total `(mainEdge, branchRoom, doorSite)` triples

This cleanly separates:

* “Dungeon has no branches”
* vs “Search policy too narrow”

---

### 3) Larger Batch Validation

After main-edge retry:

* Run **500–1000 seeds**
* Confirm:

  * okRate improvement
  * signal metrics stability
  * failure class distribution

---

## PHASE 2.5 — SOFT ENFORCEMENT (NOT STARTED)

Now well-supported by data.

Planned approach:

* Promote a **small subset** of role-rule warnings to retry triggers
* Never abort generation
* Use pattern retries, not hard vetoes

---

## WHERE WE ARE IN MILESTONE 4

* **Phase 1:** complete
* **Phase 2:** complete (observational)
* **Phase 3:** active, healthy, structurally understood
* **Phase 2.5:** planned, data-ready

Milestone 4 is now transitioning from **“does composition work?”** to
**“how reliably and how intentionally does it work?”**

---

## MENTAL MODEL SUMMARY

* BSP creates space
* Content expresses intent
* Patterns compose structure
* Circuits encode logic
* Signals compose logic
* Runtime executes state
* Diagnostics quantify structure
* Batch harness turns intuition into data
* **Phase 3 revealed true structural limits**
* **Next step is controlled exploration, not new mechanics**

---
