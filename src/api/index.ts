/**
 * mazegen public API — barrel exports.
 *
 * Consumers should import from "src/api" (or "src/api/index")
 * rather than reaching into internal modules.
 */

export { generateDungeon } from "./generateDungeon";

export type {
  GenerateDungeonRequest,
  GenerateDungeonResult,

  // Re-exported convenience types (originate in internal modules)
  BspDungeonOptions,
  BspDungeonOutputs,
  ContentOutputs,
  ContentBudget,
  ContentStrategy,
  DifficultyBand,
  InclusionRules,
  PacingTargets,
  PatternConfig,
  BudgetResult,
  DifficultyResult,
  PacingResult,
  InclusionResult,
  PatternDiagnostics,
  PuzzleRole,
  ThemeResolvedPayload,
} from "./publicTypes";

// Theme module re-exports
export type {
  DungeonTheme,
  RoomTheme,
  SpawnTable,
  RenderThemeUniforms,
} from "../theme/themeTypes";

export type {
  ResolvedSpawns,
  ResolvedMonsterSpawn,
  ResolvedLootSpawn,
  ResolvedPropSpawn,
  ResolvedNpcSpawn,
  ResolvedBossSpawn,
  ResolvedEntityId,
} from "../resolve/resolveTypes";

export {
  registerThemes,
  getTheme,
  getAllThemeIds,
} from "../theme/themeRegistry";
