---

PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

CONTEXT VERSION: 2026-01-17
LAST COMPLETED MILESTONE: **Milestone 3 — Stateful Puzzle Execution**
CURRENT FOCUS: **Planning Milestone 4 — Puzzle Composition & Progression Grammar**

SAFE ASSUMPTIONS (DO NOT RE-DISCUSS):

* Geometry mutation uses **Option A** (distance field recomputed post-patterns)
* Pattern diagnostics are authoritative
* Batch harness is correct and trusted
* Generation is deterministic and best-effort (never aborts)

============================================================
PROJECT OVERVIEW

This project is an experimental procedural dungeon generator built in TypeScript
with a React-based debug and validation harness.

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

This separation is foundational, enforced in code, and now **proven viable**
through diagnostics and batch validation.

============================================================
HIGH-LEVEL ARCHITECTURE

The system has three conceptual layers:

---

## STRUCTURAL DUNGEON GENERATION (BSP)

Entry: `generateBspDungeon()` in `mazeGen.ts`

Responsibilities:

* BSP partitioning of the grid
* Room carving
* Corridor carving
* Wall preservation (optional outer wall retention)
* Distance-to-wall calculation
* Region (room) identification

Outputs:

* solid mask (wall/floor)
* regionId mask
* distanceToWall mask
* BSP metadata (rooms, corridors, depth, seed)

This layer is **pure geometry** and contains no gameplay knowledge.

---

## CONTENT GENERATION (Milestones 1–3)

Entry: `generateDungeonContent()` in `mazeGen.ts`

Responsibilities:

* Place gameplay content on top of BSP geometry
* Encode progression, gating, and optional content
* Express puzzle intent declaratively
* Guarantee solvability by construction (best-effort)
* Remain fully deterministic from seed/options

This layer **does not execute puzzle logic**.

---

## RUNTIME / PUZZLE LOGIC (Milestone 3)

Core files:

* `dungeonState.ts`
* `evaluateCircuits.ts`
* `walkability.ts`
* `App.tsx` (debug + batch harness)

Responsibilities:

* Hold mutable gameplay state (doors, levers, plates, blocks, hazards, secrets)
* Derive sensor state (plates from blocks; player later)
* Evaluate circuits deterministically
* Apply effects (open doors, toggle hazards, reveal passages)
* Drive interactive puzzle simulation (debug harness first)

============================================================
IMPLEMENTED & VERIFIED (DO NOT RE-DISCUSS)

---

## STRUCTURAL MASKS (BSP OUTPUT)

All masks are `Uint8Array` of size `width * height`:

`index = y * width + x`

Masks:

* solid

  * 255 = wall
  * 0 = floor

* regionId

  * 0 = not a room (corridors, pockets)
  * 1..255 = room id

* distanceToWall

  * Manhattan distance to nearest wall
  * 0 at walls, capped at 255

Structural metadata:

* meta.rooms : Rect[]
* meta.corridors : { a, b, bends? }[]
* meta.bspDepth : number
* meta.seedUsed : number

---

## GEOMETRY MUTATION POLICY (OPTION A — DECIDED)

Some puzzle patterns may carve additional geometry by mutating
`dungeon.masks.solid`. When this happens, `distanceToWall` becomes stale.

Chosen solution (Option A):

* `distanceToWall` is recomputed **after all puzzle patterns that may carve**
* Content placement relying on `distanceToWall` must occur before patterns
  or after recomputation

Implementation:

* `runPatternsBestEffort()` aggregates `didCarve`
* `recomputeDungeonDistanceToWall(dungeon)` runs if `didCarve == true`

This policy is implemented, verified, and stable.

---

## CONTENT MASKS (GAMEPLAY LAYERS)

featureType values:

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

featureId:

* Logical entity / circuit id (1..255)

INVARIANTS:

* featureType 9 MUST have non-zero featureId
* meta.secrets[] is authoritative for hidden passages
* Masks are for inspection; metadata is authoritative

---

## CONTENT METADATA (AUTHORITATIVE)

Key fields:

* meta.seedUsed
* meta.roomGraph
* meta.roomDistance
* meta.entranceRoomId
* meta.farthestRoomId
* meta.mainPathRoomIds

Placement records:

* monsters
* chests
* secrets
* doors
* keys
* levers

Milestone 3 additions:

* plates
* blocks
* hazards
* hidden

Circuits:

meta.circuits : {
id,
logic,
behavior,
triggers,
targets
}[]

Pattern diagnostics:

meta.patternDiagnostics : PatternDiagnostics[]

---

## PUZZLE PATTERNS (MILESTONE 3)

Puzzle patterns are **generation-time content macros**.

Module: `puzzlePatterns.ts`
Helpers: `doorSites.ts`

Properties:

* Patterns are best-effort; failure never aborts generation
* Patterns may mutate geometry (explicitly reported)
* Patterns are deterministic
* Patterns emit structured diagnostics
* Pattern names are stable and batch-aggregatable

Implemented patterns:

1. leverHiddenPocket

   * Carving + hidden passage reveal
   * Lever → Hidden(REVEAL), PERSISTENT
   * Retry loop with reachability validation

2. leverOpensDoor

   * Lever → Door(TOGGLE)
   * Non-carving

3. plateOpensDoor

   * Plate(+Block) → Door(OPEN), MOMENTARY
   * Non-carving

---

## REACHABILITY DIAGNOSTICS

Hidden-pocket pattern computes:

* reachablePre
* reachablePost
* shortestPathPost

Diagnostics distinguish:

* Isolation failures
* Connectivity failures
* Trivial solutions (future tuning)

---

## BATCH VALIDATION HARNESS

Implemented and verified.

Capabilities:

* Hundreds of seeds per run
* Per-pattern aggregation
* Success/failure rates
* Reachability metrics
* Failure reason histograms
* JSON export

============================================================
CURRENT MILESTONE STATUS

Milestone 3 — **COMPLETE, STABLE, AND MEASURABLE**

* Runtime puzzle execution works end-to-end
* Geometry mutation is safe and repaired
* Pattern reliability is quantifiable
* No silent failures remain

============================================================
PLANNED / OPEN DESIGN SPACE

---

## Milestone 4 — Puzzle Composition & Progression Grammar

Milestone 4 shifts focus from *mechanical correctness* to
**player-facing meaning, escalation, and composition**.

This milestone primarily **composes existing systems** rather than
introducing many new mechanics.

Core goals:

1. Multi-step / chained puzzles

   * Circuits depending on other circuits
   * Explicit puzzle phases

2. Difficulty ramping

   * Enforce minimum complexity
   * Use reachability metrics to reject trivial layouts
   * Increase puzzle depth with dungeon progression

3. Player-centric semantics

   * Consequence before cause
   * Visual/spatial telegraphing

4. Dungeon-scale composition

   * Puzzle roles (main-path gate, optional reward, shortcut)
   * Puzzle budgeting

Recommended Milestone 4 entry point:

**Circuit Chaining v1**

* Allow circuits to depend on other circuits
  OR
* Allow circuits to enable/disable other triggers

This enables:

* Multi-step puzzles
* Escalation without new entities
* Full diagnostic and batch validation

---

## KNOWN CONSTRAINTS

* Generation must remain deterministic
* Patterns must never abort generation
* Runtime logic must not mutate geometry
* Diagnostics must remain authoritative

---

## NON-GOALS (FUTURE MILESTONES)

* Combat-triggered puzzles
* Time-pressure mechanics
* Inventory-based puzzle items
* Scripted narrative events

============================================================
MENTAL MODEL SUMMARY

* BSP creates space
* Content generation expresses intent
* Patterns add structured puzzles
* Runtime executes logic
* Geometry mutation is explicit and repaired
* Diagnostics quantify reliability
* Batch harness turns design intuition into data
* Milestone 4 composes these systems into intentional progression

---
