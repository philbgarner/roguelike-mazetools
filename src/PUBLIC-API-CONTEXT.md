# PUBLIC-API-CONTEXT.md

**CONTEXT VERSION:** **2026-02-16 (rev B)**
**OWNER AREA:** Milestone 6+ — Developer Interface / Public API / Theme & Resolver Layer
**STATUS:** **PLANNING LOCK — DISCRETE SESSIONS DEFINED; PROMPT TEMPLATES ADDED**

---

## GOAL

Provide a **stable, game-facing public API** that lets a developer:

1. Paste/copy the required runtime files into a new game project (or import as a package later).
2. Call a small set of functions to generate a dungeon for a given **seed + level + theme + authorial controls**.
3. Receive:
   - geometry + masks/textures
   - abstract content placements (doors, levers, monsters, chests, hazards, etc.)
   - **theme-resolved spawnables** (props/monsters/loot/NPCs/bosses)
   - render uniforms/colors aligned to the shader
   - diagnostics + budget validation so seed-curation is reliable

This must preserve the project’s locked invariants:

- deterministic generation (seeded)
- best-effort (never aborts)
- diagnostics are authoritative
- Option A geometry mutation rules remain intact (as already established in project context)

---

## NON-GOALS

- Rewriting the generator or puzzle system internals.
- Changing milestone 5/6 behavior or diagnostics definitions.
- Tight integration with the current Wizard/Inspection UI (that remains dev-harness).
- Implementing runtime enemy AI, loot rolling logic, or game engine bindings (only deterministic selection + stable outputs).

---

## CURRENT REPO STRUCTURE (AS OBSERVED)

### Core generation + content
- `src/mazeGen.ts`
  - exports:
    - `generateBspDungeon(...)`
    - `generateDungeonContent(...)`
    - types: `BspDungeonOutputs`, `ContentOutputs`, `FeatureType`, `DoorKind`, etc.
- `src/puzzlePatterns.ts`
- `src/patternDoorPlacement.ts`
- `src/doorSites.ts`
- `src/evaluateCircuits.ts`
- supporting: `src/walkability.ts`, `src/dungeonState.ts`, `src/graphEdgeId.ts`, etc.

### Milestone 6 authorial controls
- `src/contentBudget.ts`
- `src/pacingTargets.ts`
- `src/inclusionRules.ts`
- `src/wizard/wizardReducer.ts` (currently houses defaults and band/budget-ish config types used by the UI)

### Rendering/dev harness
- `src/rendering/*` (shader, tile tables, renderTheme)
- `src/inspect/*` and `src/debug/*` (inspection shell, batch results, diagnostics panels)
- `src/CONTEXT.md` (project context)
- `src/rendering/RENDERING-CONTEXT.md` (render pipeline context)

---

## PUBLIC API DESIGN (TARGET)

### Primary API Entry

A single “front door” function:

- `generateDungeon(request: GenerateDungeonRequest): GenerateDungeonResult`

Where `GenerateDungeonRequest` contains:
- identity:
  - `seed: number | string`
  - `level: number` (or “depth”)
  - `themeId: string`
- authorial controls:
  - `difficultyBandId?: string` OR inline `difficultyBand?: DifficultyBand`
  - `budgetId?: string` OR inline `budget?: ContentBudget`
  - `pacingId?: string` OR inline `pacing?: PacingTargets`
  - `inclusions?: InclusionRules` (or `excludePatterns`-style control)

And `GenerateDungeonResult` contains:
- `bsp: BspDungeonOutputs` (or subset) + textures/masks
- `content: ContentOutputs`
- `resolved: ResolvedSpawns` (theme-applied: monsters/loot/props/NPCs/boss)
- `theme: ThemeResolvedPayload` (render uniforms + resolved theme identifiers)
- `validation: BudgetValidationResult` (success/fail + reasons)
- `diagnostics: { patterns, roles, circuits, ... }` (pass-through + summaries)

### Theme Responsibilities (single source of truth)

A theme must own:
- render uniforms / palette aligned with shader expectations
- dungeon-level spawn tables (monsters/loot/NPC/boss)
- room theme registry (operating room vs storage etc.)
- deterministic resolution logic (seeded picks)

---

## SESSION-BY-SESSION IMPLEMENTATION PLAN

Each session is intended to end with:
1) feature implemented
2) tested (via existing batch harness or a lightweight new test harness)
3) documented (this file + optionally `CONTEXT.md` / `RENDERING-CONTEXT.md`)
4) commit

### Session 1 — Public API Scaffolding (Types + Entry Points)

**Objective:** Introduce a stable public surface without changing generator behavior.

**Create**
- `src/api/publicTypes.ts`
  - export:
    - `GenerateDungeonRequest`
    - `GenerateDungeonResult`
    - `ThemeId`, `DifficultyBandId`, `BudgetId`, `PacingId`
    - `BudgetValidationResult` (or reuse from `contentBudget.ts` if already structured)
- `src/api/index.ts`
  - export:
    - `generateDungeon`
    - `registerThemes` / `getTheme` (stubbed for now)
    - `DEFAULT_*` identifiers if needed for quick start

**Modify**
- `src/mazeGen.ts`
  - ensure stable exports:
    - `generateBspDungeon`
    - `generateDungeonContent`
  - no behavior change

**Create**
- `src/api/generateDungeon.ts`
  - export:
    - `generateDungeon(request: GenerateDungeonRequest): GenerateDungeonResult`
  - initial behavior:
    - call `generateBspDungeon(...)`
    - call `generateDungeonContent(...)`
    - return `resolved` empty placeholder + `theme` placeholder
    - pass diagnostics through untouched

**Testing**
- Optional dev harness wiring to call API instead of direct generator.
- Optional node-friendly smoke script.

**Docs**
- finalize request/result shapes here.

**Commit label suggestion:** `api: add public types + generateDungeon scaffold`

---

### Session 2 — Separate Runtime Kit vs Dev Harness (Boundary Hygiene)

**Objective:** Make it obvious what a game project needs to copy/import.

**Create**
- `src/runtime/` folder (or `src/kit/`) for runtime-safe barrel exports.

**Modify**
- `src/api/index.ts`
  - re-export runtime-safe items only

**Rules (locked)**
- Runtime MUST NOT import:
  - `src/wizard/*`
  - `src/inspect/*`
  - `src/debug/*`
  - React / R3F modules

**Testing**
- Add a TypeScript “import fence” check later (optional).
- Convention and review in this phase.

**Docs**
- Add “Runtime File List” section and refine it.

**Commit label suggestion:** `api: define runtime boundary + exports`

---

### Session 3 — Theme Schema v1 (DungeonTheme + RoomTheme + RenderTheme sync)

**Objective:** Define theme as data + deterministic resolvers, without yet applying to spawns.

**Create**
- `src/theme/themeTypes.ts`
  - export:
    - `DungeonTheme`
    - `RoomTheme`
    - `SpawnTable<T>`
    - `RenderThemeUniforms` (align to shader uniforms)
    - `ThemeResolvedPayload`
- `src/theme/themeRegistry.ts`
  - export:
    - `registerThemes(themes: DungeonTheme[])`
    - `getTheme(themeId: string): DungeonTheme`
- `src/theme/defaultThemes.ts`
  - export:
    - `THEME_MEDIEVAL_KEEP: DungeonTheme`
    - `THEME_BABYLON_ZIGGURAT: DungeonTheme`
    - `THEME_SURGICAL_SUITE: DungeonTheme`

**Modify**
- `src/rendering/renderTheme.ts`
  - reconcile `RenderTheme` keys with shader expectations
  - export:
    - `toShaderUniforms(theme: RenderTheme): RenderThemeUniforms`

**Testing**
- In dev harness render view:
  - theme switch verifies uniforms visually.

**Docs**
- Update `src/rendering/RENDERING-CONTEXT.md` with theme→uniforms contract.
- Update this file with required theme fields.

**Commit label suggestion:** `theme: add schema + registry + render uniform mapping`

---

### Session 4 — Room Tagging + Deterministic Room Theme Selection

**Objective:** Choose room themes using generator facts, not UI vibes.

**Create**
- `src/theme/roomTags.ts`
  - export:
    - `RoomTag`
    - `computeRoomTags(content: ContentOutputs): Map<roomId, Set<RoomTag>>`
- `src/theme/selectRoomThemes.ts`
  - export:
    - `selectRoomThemeForRoom(...)` deterministic by `(seed, themeId, roomId)` plus tags.

**Modify**
- `src/api/generateDungeon.ts`
  - attach:
    - `theme.roomThemesByRoomId`
    - `theme.roomTagsByRoomId` (optional but strongly recommended)

**Testing**
- Dev harness: show theme distribution, ensure all rooms assigned.
- Batch sanity: “all rooms got a theme”.

**Docs**
- Add authoritative list of room tags, rules, tie-breakers, fallbacks.

**Commit label suggestion:** `theme: add room tags + deterministic room theme selection`

---

### Session 5 — Resolver Pipeline v1 (Abstract placements -> Game Spawnables)

**Objective:** Convert abstract placements into theme-resolved spawnables.

**Create**
- `src/resolve/resolveTypes.ts`
  - export:
    - `ResolvedSpawns`
    - `ResolvedMonsterSpawn`, `ResolvedLootSpawn`, `ResolvedPropSpawn`, `ResolvedNpcSpawn`, `ResolvedBossSpawn`
    - `ResolvedEntityId` strategy
- `src/resolve/seededPicker.ts`
  - export:
    - `hashSeed(...)`
    - `pickWeighted(...)`
- `src/resolve/resolveSpawns.ts`
  - export:
    - `resolveSpawns({ theme, content, seed, level }): ResolvedSpawns`
  - deterministic resolution: stable per-entity seed = hash(seed, themeId, entityKind, entityStableId)

**Modify**
- `src/api/generateDungeon.ts`
  - populate `resolved` using `resolveSpawns(...)`

**Testing**
- Determinism: same request -> identical resolved spawns.
- Theme constraints: no cross-theme spawn leakage.

**Docs**
- Seed hashing rules and entity id definition.

**Commit label suggestion:** `resolve: add deterministic spawn resolution pipeline`

---

### Session 6 — Authorial Controls Integration (Bands/Budgets/Pacing in Public API)

**Objective:** Make band/budget/pacing selectable from request, returning validation output.

**Create**
- `src/api/authorialPresets.ts`
  - export:
    - `DEFAULT_BANDS`, `DEFAULT_BUDGETS`, `DEFAULT_PACING`
  - isolate runtime from wizard UI types.

**Modify**
- `src/wizard/wizardReducer.ts`
  - remove runtime dependency from UI (move shared defaults to runtime/shared module).
  - runtime must not import wizard UI.

**Modify**
- `src/contentBudget.ts`
  - expose stable validator:
    - `validateContentBudget({ content, band, budget, pacing }): BudgetValidationResult`

**Modify**
- `src/api/generateDungeon.ts`
  - apply request-specified authorial controls
  - attach `validation`
  - never abort; preserve seed curation workflow

**Testing**
- Batch-run seeds: validate pass/fail rates and diagnostic clarity.

**Docs**
- Update `src/CONTEXT.md` with public API + authorial controls addendum.
- Update this file with preset IDs.

**Commit label suggestion:** `api: integrate authorial controls into generateDungeon + validation output`

---

### Session 7 — “Copy/Paste Developer Kit” Cookbook + Runtime File Manifest

**Objective:** Make adoption trivial.

**Create**
- `RUNTIME-FILE-MANIFEST.md`
  - explicit runtime-safe file list to copy
- `API-QUICKSTART.md`
  - minimal usage example:
    - call `generateDungeon`
    - apply uniforms
    - seed curation via diagnostics/validation

**Modify**
- `README.md`
  - short public API intro + pointers

**Testing**
- Fresh project smoke checklist:
  - runtime-only imports
  - generate + render

**Commit label suggestion:** `docs: add runtime manifest + quickstart`

---

## RUNTIME MODULES LIKELY REQUIRED (INITIAL LIST)

To be finalized during Session 2.

**Core**
- `src/mazeGen.ts`
- `src/puzzlePatterns.ts`
- `src/patternDoorPlacement.ts`
- `src/doorSites.ts`
- `src/evaluateCircuits.ts`
- `src/walkability.ts`
- `src/dungeonState.ts`
- `src/graphEdgeId.ts`
- `src/contentBudget.ts`
- `src/inclusionRules.ts`
- `src/pacingTargets.ts`
- `src/compositionDiagnostics.ts`
- `src/roleDiagnostics.ts`

**Theme/Resolve (to be created)**
- `src/api/*`
- `src/theme/*`
- `src/resolve/*`

**Render (optional runtime)**
- `src/rendering/renderTheme.ts` (or runtime subset)
- shader sources + tile tables as needed

---

## TEST STRATEGY (MINIMUM ACCEPTANCE)

A session is done only if:
- determinism holds (including resolved spawns)
- best-effort preserved (failures -> diagnostics, not throws)
- theme fidelity (uniforms + spawn tables + room theme props)
- runtime boundary (no React/R3F/UI imports)

---

# FUTURE SESSION PROMPT TEMPLATES

These are copy-paste prompts for later sessions.  
Each session prompt assumes:
- the repo is present
- this PUBLIC-API-CONTEXT.md exists
- you want minimal diffs and targeted edits

---

## Session 1 — Public API Scaffold (Types + Entry)

**Prompt**
- We are implementing Session 1 from PUBLIC-API-CONTEXT.md.
- Goal: add public API scaffolding only (types + entry function). Do NOT change generator behavior.
- Please:
  1) Create `src/api/publicTypes.ts` with:
     - `GenerateDungeonRequest`
     - `GenerateDungeonResult`
  2) Create `src/api/generateDungeon.ts` exporting:
     - `generateDungeon(request)`
  3) Ensure generateDungeon calls:
     - `generateBspDungeon`
     - `generateDungeonContent`
  4) Create `src/api/index.ts` exporting only public symbols.
- Constraints:
  - no UI imports
  - no theme/resolve logic yet
  - diagnostics pass-through untouched
- Output:
  - full file contents for new files
  - git-style diff for all changes
  - brief “how to test” notes

---

## Session 2 — Runtime Boundary (Kit vs Harness)

**Prompt**
- We are implementing Session 2 from PUBLIC-API-CONTEXT.md.
- Goal: define runtime boundary and ensure no runtime code imports wizard/inspect/debug/React/R3F.
- Please:
  1) Identify runtime-safe modules.
  2) Ensure `src/api/index.ts` exports runtime-safe symbols only.
  3) Suggest a folder layout (`src/runtime/` or `src/kit/`) and move files only if necessary.
  4) Produce a preliminary `RUNTIME-FILE-MANIFEST.md` (draft).
- Output:
  - module list
  - any file moves (minimal)
  - diffs
  - test checklist

---

## Session 3 — Theme Schema v1 (Registry + Uniform Mapping)

**Prompt**
- We are implementing Session 3 from PUBLIC-API-CONTEXT.md.
- Goal: introduce theme schema + registry; sync renderTheme to shader uniforms.
- Please:
  1) Create `src/theme/themeTypes.ts` with:
     - `DungeonTheme`, `RoomTheme`, `SpawnTable<T>`, `RenderThemeUniforms`, `ThemeResolvedPayload`
  2) Create `src/theme/themeRegistry.ts`:
     - `registerThemes`, `getTheme`
  3) Create `src/theme/defaultThemes.ts` with 2–3 starter themes:
     - medieval keep, babylon ziggurat, surgical suite
  4) Modify `src/rendering/renderTheme.ts`:
     - add `toShaderUniforms(...)` and fill missing semantic colors needed by shader
- Constraints:
  - no spawn resolution yet
  - no generator behavior changes
- Output:
  - full new files
  - diffs
  - list of shader uniforms covered

---

## Session 4 — Room Tags + Deterministic Room Theme Selection

**Prompt**
- We are implementing Session 4 from PUBLIC-API-CONTEXT.md.
- Goal: compute room tags from generator/content outputs and select room themes deterministically.
- Please:
  1) Create `src/theme/roomTags.ts`:
     - `RoomTag`
     - `computeRoomTags(content: ContentOutputs)`
  2) Create `src/theme/selectRoomThemes.ts`:
     - `selectRoomThemeForRoom(...)`
     - deterministic by `(seed, themeId, roomId)` plus computed tags
  3) Modify `src/api/generateDungeon.ts`:
     - attach `theme.roomTagsByRoomId` and `theme.roomThemesByRoomId`
- Constraints:
  - deterministic
  - best-effort
  - no UI
- Output:
  - diffs
  - examples of tags and selection behavior
  - minimal tests (batch sanity or smoke)

---

## Session 5 — Resolver Pipeline v1 (Abstract -> Resolved Spawnables)

**Prompt**
- We are implementing Session 5 from PUBLIC-API-CONTEXT.md.
- Goal: resolve abstract content placements into theme-based spawnables deterministically.
- Please:
  1) Create `src/resolve/resolveTypes.ts` defining:
     - `ResolvedSpawns` and per-entity spawn types
  2) Create `src/resolve/seededPicker.ts`:
     - `hashSeed`, `pickWeighted`
  3) Create `src/resolve/resolveSpawns.ts`:
     - `resolveSpawns({ theme, content, seed, level })`
     - stable per-entity seed hashing rules
  4) Modify `src/api/generateDungeon.ts` to populate `resolved`.
- Constraints:
  - determinism test: same request => identical resolved spawns
  - do not throw on validation failures
- Output:
  - diffs
  - determinism test snippet (node-friendly)
  - explanation of stable entity ids

---

## Session 6 — Authorial Controls in Public API (Bands/Budgets/Pacing)

**Prompt**
- We are implementing Session 6 from PUBLIC-API-CONTEXT.md.
- Goal: request chooses difficulty band + budget + pacing; attach validation.
- Please:
  1) Create `src/api/authorialPresets.ts` exporting:
     - `DEFAULT_BANDS`, `DEFAULT_BUDGETS`, `DEFAULT_PACING`
     - ensure runtime does NOT import wizard UI
  2) Modify `src/contentBudget.ts` to export:
     - `validateContentBudget(...)` stable callable
  3) Modify `src/api/generateDungeon.ts` to:
     - accept ids or inline values
     - call validator
     - attach result to `GenerateDungeonResult.validation`
- Output:
  - diffs
  - sample request payloads
  - test checklist (batch runs)

---

## Session 7 — Runtime Kit Docs + Manifest + Cookbook

**Prompt**
- We are implementing Session 7 from PUBLIC-API-CONTEXT.md.
- Goal: finalize adoption docs and runtime file list.
- Please:
  1) Create `RUNTIME-FILE-MANIFEST.md` listing:
     - required runtime files
     - optional render files
     - external deps (THREE, etc.)
  2) Create `API-QUICKSTART.md`:
     - generateDungeon usage
     - apply render uniforms
     - seed curation workflow using diagnostics/validation
  3) Update `README.md` with links.
- Output:
  - full doc file contents
  - no code changes unless required for docs accuracy

---
