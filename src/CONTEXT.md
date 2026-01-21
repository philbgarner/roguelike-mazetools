---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-20 (rev I)**
**LAST COMPLETED MILESTONE:** **Milestone 3 — Stateful Puzzle Execution**
**CURRENT MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT PHASE:** **Phase 3 — Composition Patterns (ROLE-AWARE, BEST-EFFORT)**
**PHASE STATUS:** **PHASE 3 ONLINE, FAILURE MODES ISOLATED TO RARE STRUCTURAL DEGENERACY**

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

**STATUS:** ROLE-AWARE COMPOSITION WORKING
**STATUS:** FAILURE MODES FULLY CLASSIFIED
**STATUS:** RELIABILITY ~99.4–99.9% DEPENDING ON STRUCTURAL DEGENERACY

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

## TODAY’S WORK (rev I)

### 1) Structural Starvation Eliminated

* Main-path edges are now **pre-filtered** to only those with off-main neighbors
* Eliminated wasted attempts on impossible edges
* Removed dominant “no branch neighbor” failure class

---

### 2) Degenerate Branch Collision Identified

Through stepwise instrumentation, remaining failures were isolated to:

* **Gate door site and branch door site resolving to the same corridor tile**

This is a **structural chokepoint degeneracy**, not an occupancy or placement bug.

---

### 3) Collision Handling Implemented

* Branch door candidates now **exclude the chosen gate tile**
* Colliding branch sites are treated as **non-usable**, allowing search to continue
* Collision counters added and verified

---

### 4) Final Remaining Failure Class (Rare)

After collision filtering:

* ~6 / 1000 seeds still fail when:

  * **Every available branch door candidate on all considered edges coincides with the chosen gate site**
  * After exclusion, no usable branch door sites remain

This is **not** a logic failure — it is a **gate-site selection degeneracy** in highly constrained BSP topologies.

---

## CURRENT STATE (rev I)

### What Works Reliably

* Role-aware composition semantics are correct
* SIGNAL-based logic chaining is stable
* Diagnostics precisely explain failures
* No silent or misclassified failures remain
* Remaining failures are deterministic and understood

### What Still Fails (Rarely)

* Extremely constrained layouts where:

  * Branch edges exist
  * Branch door sites exist
  * **But all branch door sites collapse to the same tile as the gate site**

This is a **selection-policy limitation**, not a structural impossibility.

---

## WHERE WE ARE IN MILESTONE 4

* **Phase 1:** COMPLETE

* **Phase 2:** COMPLETE (observational)

* **Phase 3:** **FUNCTIONALLY COMPLETE**

  * Composition semantics correct
  * Failure modes isolated
  * Reliability near ceiling for current constraints

* **Phase 2.5:** UNSTARTED — NOW CLEARLY JUSTIFIED

Milestone 4 has definitively transitioned from:

> “Can we compose puzzles?”

to:

> **“How intentionally do we steer composition under structural constraints?”**

---

## NEXT STEPS (CLEAR & LOW-RISK)

### 1) Gate-Site Viability Pre-Check (HIGH ROI)

Before committing to a `gateSite`:

* Evaluate whether that gate site would **eliminate all usable branch door sites**
* If so:

  * Skip this gate site
  * Try the next gate site on the same edge

This is a **local, deterministic, best-effort** refinement.

**Expected outcome:** push success rate toward **~100%**.

---

### 2) Phase 2.5 — Soft Enforcement (NEXT PHASE)

With diagnostics now precise:

* Promote selected role warnings into **retry guidance**
* Apply **intent pressure**, not hard vetoes
* Preserve best-effort guarantees

This introduces *meaningful structure* without fragility.

---

### 3) Expand Composition Library

With confidence in the framework:

* Optional → Optional chains
* Soft shortcuts
* Foreshadow-before-gate patterns
* Multi-branch reward clusters

---

## MENTAL MODEL (FINALIZED)

* BSP creates space
* Content expresses intent
* Patterns compose structure
* Circuits encode logic
* Signals compose logic
* Runtime executes state
* Diagnostics quantify structure
* Batch harness turns intuition into data
* **Search order matters as much as logic**
* **Structural degeneracy is observable, not mysterious**
* **Phase 3 proved composition works**
* **Phase 4 will refine meaning, not mechanics**

---
