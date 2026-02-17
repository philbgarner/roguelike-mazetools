# Runtime File Manifest

Files required to use the mazegen public API in a standalone project.
Copy these into your project and import from `src/api/index.ts`.

---

## Required: Core Generation

These files implement BSP dungeon generation, content placement, and puzzle circuits.

| File | Purpose |
|------|---------|
| `src/mazeGen.ts` | BSP tree + room/corridor generation, content placement |
| `src/puzzlePatterns.ts` | Puzzle pattern definitions and attempt logic |
| `src/patternDoorPlacement.ts` | Pattern-driven door placement |
| `src/doorSites.ts` | Door site candidate discovery |
| `src/evaluateCircuits.ts` | Circuit graph evaluation |
| `src/walkability.ts` | Walkability / reachability checks |
| `src/dungeonState.ts` | Mutable dungeon grid state helpers |
| `src/graphEdgeId.ts` | Stable edge ID encoding for room graphs |
| `src/compositionDiagnostics.ts` | Phase 3 composition diagnostics |
| `src/roleDiagnostics.ts` | Circuit role classification diagnostics |

## Required: Configuration & Validation

Types, defaults, and post-generation validators for authorial controls.

| File | Purpose |
|------|---------|
| `src/configTypes.ts` | All config types (`BspConfig`, `PatternConfig`, `ContentBudget`, `DifficultyBand`, `PacingTargets`, `InclusionRules`) + defaults |
| `src/contentBudget.ts` | `validateContentBudget`, `validateDifficultyBand` |
| `src/pacingTargets.ts` | `validatePacingTargets` |
| `src/inclusionRules.ts` | `validateInclusionRules` |

## Required: Public API

The stable public surface. Import from `src/api/index.ts`.

| File | Purpose |
|------|---------|
| `src/api/index.ts` | Barrel exports (the single import target) |
| `src/api/publicTypes.ts` | `GenerateDungeonRequest`, `GenerateDungeonResult`, re-exported types |
| `src/api/generateDungeon.ts` | `generateDungeon()` entry point |
| `src/api/authorialPresets.ts` | Preset registries for bands, budgets, pacing + defaults |

## Required: Theme System

Theme schema, registry, room tagging, and deterministic room theme selection.

| File | Purpose |
|------|---------|
| `src/theme/themeTypes.ts` | `DungeonTheme`, `RoomTheme`, `SpawnTable<T>`, `RenderThemeUniforms`, `ThemeResolvedPayload` |
| `src/theme/themeRegistry.ts` | `registerThemes`, `getTheme`, `getAllThemeIds` |
| `src/theme/defaultThemes.ts` | Three built-in themes: medieval keep, babylon ziggurat, surgical suite |
| `src/theme/roomTags.ts` | `RoomTag` vocabulary, `computeRoomTags()` |
| `src/theme/selectRoomThemes.ts` | Deterministic room theme selection by seed + tags |

## Required: Resolver Pipeline

Converts abstract content placements into theme-resolved spawnables.

| File | Purpose |
|------|---------|
| `src/resolve/resolveTypes.ts` | `ResolvedSpawns`, per-entity types, `ResolvedEntityId` |
| `src/resolve/seededPicker.ts` | `hashSeed`, `seededFloat`, `pickWeighted` |
| `src/resolve/resolveSpawns.ts` | `resolveSpawns()` deterministic resolver |

---

## Optional: Render Utilities

Needed only if you use the shader uniform pipeline (e.g. with Three.js / R3F).

| File | Purpose |
|------|---------|
| `src/rendering/renderTheme.ts` | `toShaderUniforms()`, `dungeonThemeToShaderUniforms()` — hex-to-Vec4 conversion with strength multipliers |

The render utilities have **no external dependencies** beyond the theme types.
If you only need the uniform values (e.g. to feed a custom shader), this single
file is sufficient. The actual R3F rendering pipeline (`DungeonRenderView.tsx`,
`tileShader.ts`, etc.) is dev-harness only and not part of the runtime kit.

---

## NOT Runtime-Safe (Dev Harness Only)

Do **not** copy these into a game project. They depend on React, R3F, and
dev-harness infrastructure.

| Directory | Contents |
|-----------|----------|
| `src/wizard/` | Configuration UI (WizardScreen, wizardReducer) |
| `src/inspect/` | Batch inspection and single-seed inspection views |
| `src/debug/` | Circuit diagnostics panels, inspectors |
| `src/rendering/DungeonRenderView.tsx` | R3F render component |
| `src/rendering/tileShader.ts` | GLSL shader source |
| `src/rendering/codepage437Tiles.ts` | CP437 tile atlas mapping |
| `src/rendering/tiles.ts` | Tile ID constants |
| `src/App.tsx` | Dev harness root |
| `src/main.tsx` | Dev harness entry point |

---

## External Dependencies

### Required (runtime)

**None.** The generation pipeline is pure TypeScript with zero external
dependencies. It uses no `three`, `react`, or other library imports.

### Optional (render utilities)

| Dependency | Version | Used By |
|------------|---------|---------|
| `three` | ^0.182.0 | Only if you consume `RenderThemeUniforms` as `THREE.Vector4` — the runtime kit returns plain `[r, g, b, a]` tuples, so THREE is not required for uniform data |

### Dev harness only

| Dependency | Version | Purpose |
|------------|---------|---------|
| `react` | ^19.2.3 | UI framework |
| `react-dom` | ^19.2.3 | DOM renderer |
| `@react-three/fiber` | ^9.5.0 | R3F render pipeline |
| `@react-three/drei` | ^10.7.7 | R3F helpers |
| `three` | ^0.182.0 | 3D engine (render pipeline) |
| `framer-motion` | ^12.29.0 | UI animations |

---

## File Count Summary

| Category | Files |
|----------|-------|
| Core generation | 10 |
| Config & validation | 4 |
| Public API | 4 |
| Theme system | 5 |
| Resolver pipeline | 3 |
| **Required total** | **26** |
| Optional (render) | 1 |
