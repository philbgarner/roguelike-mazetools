/**
 * Theme module barrel exports.
 */

export type {
  DungeonTheme,
  DungeonThemeRenderColors,
  DungeonThemeRenderStrength,
  RoomTheme,
  SpawnTable,
  SpawnTableEntry,
  RenderThemeUniforms,
  Vec4,
  ThemeResolvedPayload,
} from "./themeTypes";

export { registerThemes, getTheme, getAllThemeIds } from "./themeRegistry";

export {
  THEME_MEDIEVAL_KEEP,
  THEME_BABYLON_ZIGGURAT,
  THEME_SURGICAL_SUITE,
  DEFAULT_THEMES,
} from "./defaultThemes";
