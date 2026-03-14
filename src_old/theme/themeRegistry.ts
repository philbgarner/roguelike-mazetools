/**
 * In-memory theme registry.
 *
 * Default themes are auto-registered on first import.
 * Games can call registerThemes() to add or override themes.
 */

import type { DungeonTheme } from "./themeTypes";
import { DEFAULT_THEMES } from "./defaultThemes";

const registry = new Map<string, DungeonTheme>();

export function registerThemes(themes: DungeonTheme[]): void {
  for (const theme of themes) {
    registry.set(theme.id, theme);
  }
}

export function getTheme(themeId: string): DungeonTheme {
  const theme = registry.get(themeId);
  if (!theme) {
    throw new Error(`Theme not found: "${themeId}". Registered: [${getAllThemeIds().join(", ")}]`);
  }
  return theme;
}

export function getAllThemeIds(): string[] {
  return Array.from(registry.keys());
}

// Auto-register defaults
registerThemes(DEFAULT_THEMES);
