---

# PROJECT CONTEXT — BSP DUNGEON, CONTENT & PUZZLE SYSTEM

**CONTEXT VERSION:** **2026-01-18 (rev E)**
**LAST COMPLETED MILESTONE:** **Milestone 3 — Stateful Puzzle Execution**
**CURRENT MILESTONE:** **Milestone 4 — Puzzle Composition & Progression Grammar**
**CURRENT PHASE:** **Phase 2 — Puzzle Roles & Difficulty Ramping**
**PHASE STATUS:** **ROLE DIAGNOSTICS + STRUCTURAL LANDMARK VISUALIZATION (OBSERVATIONAL)**

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

are cleanly separated.

This separation is foundational, enforced in code, and **proven viable** through runtime execution, diagnostics, and large-scale batch validation.

---

## HIGH-LEVEL ARCHITECTURE

### STRUCTURAL DUNGEON GENERATION (BSP)

**Entry:** `generateBspDungeon()` in `mazeGen.ts`

**Responsibilities:**

* BSP partitioning of the grid
* Room carving
* Corridor carving
* Wall preservation (optional outer wall retention)
* Distance-to-wall calculation
* Region (room) identification

**Outputs:**

* `solid` mask (wall/floor)
* `regionId` mask
* `distanceToWall` mask
* BSP metadata (rooms, corridors, depth, seed)

This layer is **pure geometry** and contains no gameplay knowledge.

---

### CONTENT GENERATION (Milestones 1–3)

**Entry:** `generateDungeonContent()` in `mazeGen.ts`

**Responsibilities:**

* Place gameplay content on top of BSP geometry
* Encode progression, gating, and optional content
* Express puzzle intent declaratively
* Guarantee solvability by construction (best-effort)
* Remain fully deterministic from seed/options

This layer **does not execute puzzle logic**.

---

### RUNTIME / PUZZLE LOGIC (Milestone 3+)

**Core files:**

* `dungeonState.ts`
* `evaluateCircuits.ts`
* `walkability.ts`
* `App.tsx` (debug UI + batch harness)

**Responsibilities:**

* Hold mutable gameplay state (doors, levers, plates, blocks, hazards, secrets)
* Derive sensor state (plates from blocks; player later)
* Evaluate circuits deterministically
* Apply effects (open doors, toggle hazards, reveal passages)
* Drive interactive puzzle simulation (debug harness first)

---

## IMPLEMENTED & VERIFIED (DO NOT RE-DISCUSS)

### GEOMETRY MUTATION POLICY — OPTION A (DECIDED)

Puzzle patterns may carve geometry by mutating `dungeon.masks.solid`, invalidating the distance field.

**Policy:**

* All geometry-mutating patterns run before final distance usage
* `distanceToWall` is recomputed once if **any** pattern carved
* Implemented via `runPatternsBestEffort()` → `didCarve` flag

Implemented, verified, and stable.

---

### CONTENT MASKS & METADATA

Authoritative `featureType` values:

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

**Invariants:**

* featureType 9 MUST have non-zero featureId
* `meta.secrets[]` is authoritative for hidden passages
* Masks are for inspection; metadata is authoritative

---

### PUZZLE PATTERNS (MILESTONE 3)

Patterns are **generation-time macros**, not runtime logic.

Properties:

* Best-effort (never abort generation)
* Deterministic
* May mutate geometry (explicitly reported)
* Emit structured diagnostics
* Names are stable and batch-aggregatable

Implemented patterns:

1. **leverHiddenPocket**
2. **leverOpensDoor**
3. **plateOpensDoor**

---

### REACHABILITY DIAGNOSTICS

Hidden-pocket pattern records:

* reachablePre
* reachablePost
* shortestPathPost

Failure modes are classified and batch-aggregated.

---

### BATCH VALIDATION HARNESS

Implemented and trusted.

Capabilities:

* Hundreds of seeds per run
* Per-pattern aggregation
* Success / failure rates
* Reachability metrics
* Failure histograms
* JSON export

---

## STRUCTURAL LANDMARK VISUALIZATION (NEW)

To support progression reasoning and diagnostics clarity, **structural landmarks** are now rendered in the content composite image:

### Entrance Tile (NEW)

* Entrance room is identified via `content.meta.entranceRoomId`
* The room footprint is derived from `dungeon.masks.regionId`
* The **center tile** of the entrance room is rendered as a **cyan pixel**
* Render-only change (no metadata or gameplay impact)

### Exit Tile (NEW)

* Exit room is defined as `content.meta.farthestRoomId`

  * Farthest room by room-graph distance from the entrance
* The room footprint is derived from `dungeon.masks.regionId`
* The **center tile** of the exit room is rendered as a **purple pixel**
* Render-only change; no new featureType introduced

These markers:

* Make dungeon flow visually legible
* Support role diagnostics interpretation
* Are batch-safe and deterministic
* Do not affect runtime logic or generation outcomes

---

## MILESTONE STATUS

### Milestone 3 — COMPLETE, STABLE, MEASURABLE

* Runtime puzzle execution works end-to-end
* Geometry mutation is safe and repaired
* Pattern reliability is quantifiable
* No silent failures remain

---

### Milestone 4 — Puzzle Composition & Progression Grammar

Milestone 4 shifts focus from **mechanical correctness** to
**player-facing meaning, escalation, and composition**.

No new mechanics are introduced in this milestone.

---

## MILESTONE 4 — PHASE BREAKDOWN

### Phase 1 — Circuit Chaining (FOUNDATIONAL)

**STATUS:** COMPLETE
**STATUS:** DIAGNOSTICS PARITY ACHIEVED
**STATUS:** CLOSED

---

### Phase 2 — Puzzle Roles & Difficulty Ramping (CURRENT)

**STATUS:** ROLE DIAGNOSTICS IMPLEMENTED
**STATUS:** UI SURFACED
**STATUS:** STRUCTURAL LANDMARKS VISIBLE
**STATUS:** OBSERVATIONAL ONLY

Phase 2 introduces *semantic meaning* to composed puzzles
without enforcing behavior.

#### Completed in Phase 2

* Role diagnostics engine (`roleDiagnostics.ts`)
* Stable schema (`RoleDiagnosticsV1`)
* Deterministic anchor derivation
* Role-aware metrics per circuit
* Rule evaluation (warnings only)
* Aggregate role & rule statistics
* Dedicated Role Diagnostics UI
* Entrance + exit tile visualization

No tuning or enforcement occurs in this phase.

---

## NEXT STEPS (IMMEDIATE)

1. **Batch integration**

   * Export compact role-diagnostics summaries
   * Run large batches (500–1000 seeds)
   * Examine distributions by role and depth

2. **Threshold calibration**

   * Adjust default role thresholds using empirical data
   * Keep all rules non-fatal
   * Explicitly version thresholds (e.g. v2)

3. **UI polish (optional)**

   * Stronger visual distinction for main-path vs optional
   * Lightweight histograms or sparklines (read-only)

---

## PLANNED FOLLOW-UPS

### Phase 2.5 — Soft Enforcement (PLANNED)

* Promote selected warnings to **best-effort rejections**
* Never abort generation
* Deterministic outcomes preserved

---

### Phase 3 — Composition Patterns (PLANNED)

Introduce multi-circuit composition informed by roles:

* Lever → Gate → Plate → Reward
* Consequence-before-cause setups
* Intentional foreshadow → payoff chains

No new mechanics introduced.

---

## MENTAL MODEL SUMMARY

* BSP creates space
* Content generation expresses intent
* Patterns add structured puzzles
* Circuits encode logic
* Signals compose logic
* Runtime executes state
* Diagnostics quantify structure
* Batch harness converts intuition into data
* **Milestone 4 turns correctness into progression grammar**

---
