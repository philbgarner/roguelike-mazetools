---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-21 (rev L)**
**LAST COMPLETED MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT MILESTONE:** **Milestone 5 — Intent Steering & Progression Policy**
**CURRENT PHASE:** **Milestone 5 Kickoff — Phase 2.5 Soft Enforcement (INTENT PRESSURE, BEST-EFFORT)**
**PHASE STATUS:** **MILESTONE 4 CLOSED; COMPOSITION RELIABLE; INTENT MISALIGNMENTS NOW VISIBLE**

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

## MILESTONE 4 — PUZZLE COMPOSITION & PROGRESSION GRAMMAR

Milestone 4 focuses on **meaning, escalation, and structure**, not new mechanics.

### Phase 1 — Circuit Chaining

**STATUS:** COMPLETE
**STATUS:** CLOSED

### Phase 2 — Puzzle Roles & Difficulty Ramping

**STATUS:** ROLE DIAGNOSTICS IMPLEMENTED
**STATUS:** UI SURFACED
**STATUS:** OBSERVATIONAL ONLY (BY DESIGN)

### Phase 3 — Composition Patterns

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

## NEWLY DIAGNOSED ISSUE — INTENT / PLACEMENT MISALIGNMENT (rev L)

### Symptom

In some seeds (e.g. seed-1234), multiple lever-linked doors appear **stacked within the same room or corridor cluster**, often near an early chokepoint.
This results in:

* Multiple doors controlling the *same* logical passage
* Redundant gating
* Broken perceived progression (two levers open what is effectively one gate)

### Root Cause

Current placement logic correctly enforces **tile-level validity**, but does **not enforce graph-level intent**.

The system is effectively interpreting:

> “spawn N lever-linked doors”

instead of the intended meaning:

> “spawn N progression gates, each controlling a distinct chokepoint deeper in the room graph”

Because corridors can expose multiple valid door tiles along the same logical connector, multiple doors may be placed on the **same room-graph edge**, producing visual and mechanical stacking.

This is **not a bug**, but an *intent modeling gap* now visible due to Milestone 4’s reliability.

---

## INTERPRETATION (CANONICAL)

* Doors are **mechanical actuators**
* Gates are **graph separations**
* Progression intent operates at the **room-graph level**, not the tile level

Milestone 4 proved composition works.
Milestone 5 exists to align *placement intent* with *progression meaning*.

---

## NEXT STEPS — MILESTONE 5 (UPDATED)

### Phase 2.5 — Soft Enforcement (ACTIVE)

#### Intent-Aware Gate Selection (PROPOSED)

Introduce **soft, graph-level constraints** for multi-gate placement:

1. **Gate De-Duplication by Graph Edge**

   * Treat each corridor / room-connector as a canonical “gate edge”
   * Enforce **at most one door per edge**
   * Prevents stacked doors at the same chokepoint

2. **Monotonic Depth Progression**

   * When placing multiple gates:

     * Gate *i+1* must be placed **strictly deeper in the room graph** than Gate *i*
     * Depth measured by:

       * distance from entrance room, or
       * main-path index toward `farthestRoomId`
   * Ensures each lever unlocks a *new region*

3. **Soft Enforcement Only**

   * These rules:

     * influence candidate ordering
     * apply only on retries
     * never hard-veto placement
   * Best-effort guarantees preserved

---

### Expand Composition Library (UNCHANGED)

With intent alignment now explicit:

* Optional → Optional chains
* Soft shortcuts
* Foreshadow-before-gate patterns
* Multi-branch reward clusters

---

## MENTAL MODEL (REFINED)

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
