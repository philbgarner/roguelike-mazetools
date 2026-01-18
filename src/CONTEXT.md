---

PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

CONTEXT VERSION: 2026-01-17
LAST COMPLETED MILESTONE: **Milestone 3 — Stateful Puzzle Execution**
CURRENT MILESTONE: **Milestone 4 — Puzzle Composition & Progression Grammar**
CURRENT PHASE: **Phase 1 — Circuit Chaining (in progress)**

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

This separation is foundational, enforced in code, and **proven viable**
through diagnostics and batch validation.

============================================================
HIGH-LEVEL ARCHITECTURE

The system has three conceptual layers:

---

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

* solid mask (wall/floor)
* regionId mask
* distanceToWall mask
* BSP metadata (rooms, corridors, depth, seed)

This layer is **pure geometry** and contains no gameplay knowledge.

---

CONTENT GENERATION (Milestones 1–3)

Entry: `generateDungeonContent()` in `mazeGen.ts`

Responsibilities:

* Place gameplay content on top of BSP geometry
* Encode progression, gating, and optional content
* Express puzzle intent declaratively
* Guarantee solvability by construction (best-effort)
* Remain fully deterministic from seed/options

This layer **does not execute puzzle logic**.

---

RUNTIME / PUZZLE LOGIC (Milestone 3+)

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

STRUCTURAL MASKS (BSP OUTPUT)

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

GEOMETRY MUTATION POLICY (OPTION A — DECIDED)

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

CONTENT MASKS (GAMEPLAY LAYERS)

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

CONTENT METADATA (AUTHORITATIVE)

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
* plates
* blocks
* hazards

Circuits:

* meta.circuits : CircuitDef[]

Pattern diagnostics:

* meta.patternDiagnostics : PatternDiagnostics[]

---

PUZZLE PATTERNS (MILESTONE 3)

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

REACHABILITY DIAGNOSTICS

Hidden-pocket pattern computes:

* reachablePre
* reachablePost
* shortestPathPost

Diagnostics distinguish:

* Isolation failures
* Connectivity failures
* Trivial solutions (future tuning)

---

BATCH VALIDATION HARNESS

Implemented and verified.

Capabilities:

* Hundreds of seeds per run
* Per-pattern aggregation
* Success/failure rates
* Reachability metrics
* Failure reason histograms
* JSON export

============================================================
MILESTONE STATUS

---

Milestone 3 — COMPLETE, STABLE, AND MEASURABLE

* Runtime puzzle execution works end-to-end
* Geometry mutation is safe and repaired
* Pattern reliability is quantifiable
* No silent failures remain

---

Milestone 4 — Puzzle Composition & Progression Grammar

Milestone 4 shifts focus from *mechanical correctness* to
**player-facing meaning, escalation, and composition**.

This milestone primarily **composes existing systems**
rather than introducing new mechanics.

============================================================
MILESTONE 4 — PHASE BREAKDOWN

---

Phase 1 — Circuit Chaining (FOUNDATIONAL)

STATUS: **CORE IMPLEMENTATION COMPLETE**

Completed this session:

* Added `SIGNAL` as a first-class circuit trigger kind
* Extended trigger schema with:

  * `signal?: { name?: "ACTIVE" | "SATISFIED" | "SATISFIED_RISE" }`
* Updated `evaluateCircuits.ts` to:

  * Topologically sort circuits by SIGNAL dependencies
  * Support same-tick chained evaluation
  * Remain deterministic and best-effort (cycle-safe)
* Corrected runtime target application to respect:

  * DoorKind / HazardType initialization contracts
* Preserved full backward compatibility with Milestone 3 circuits

Result:

* Multi-step puzzles are now expressible **without new entities**
* Circuit graphs form a compositional language
* Runtime remains deterministic, debuggable, and measurable

---

Phase 1 — Remaining (IMMEDIATE NEXT STEP)

* Add **chaining-aware diagnostics** to circuit evaluation:

  * SIGNAL dependency count per circuit
  * Topological depth (longest prerequisite chain)
  * Cycle participation flags
  * Evaluation order index
* Expose these diagnostics through:

  * Debug UI
  * Batch harness summaries

This step has **no gameplay impact** and maximizes design leverage.

---

Phase 2 — Puzzle Roles & Difficulty Ramping (PLANNED)

Goals:

* Assign semantic roles to composed puzzles:

  * MAIN_PATH_GATE
  * OPTIONAL_REWARD
  * SHORTCUT
  * FORESHADOW
* Use diagnostics to enforce:

  * Minimum puzzle depth after progression thresholds
  * Rejection of trivial main-path gates
  * Controlled escalation over dungeon length

---

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
* Diagnostics must remain authoritative

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

---
