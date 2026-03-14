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
  THEME_CAVE,
  THEME_RUINS,
  THEME_CRYPT,
  THEME_TEMPLE,
  THEME_LAIR,
  DEFAULT_THEMES,
} from "./defaultThemes";
