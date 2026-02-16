/**
 * Theme schema v1 — single source of truth for render uniforms,
 * room themes, and spawn tables.
 *
 * Session 3 scaffold. Spawn resolution (Session 5) and room theme
 * selection (Session 4) will consume these types.
 */

// ---------------------------------------------------------------------------
// Spawn tables (weighted picks for deterministic resolution)
// ---------------------------------------------------------------------------

export type SpawnTableEntry<T> = {
  value: T;
  weight: number;
};

export type SpawnTable<T> = SpawnTableEntry<T>[];

// ---------------------------------------------------------------------------
// Room theme
// ---------------------------------------------------------------------------

export type RoomTheme = {
  id: string;
  label: string;
  // Future (Session 4+5): room-specific decor spawn tables, prop overrides
};

// ---------------------------------------------------------------------------
// Dungeon theme — the top-level theme object
// ---------------------------------------------------------------------------

export type DungeonThemeRenderColors = {
  floor: string;
  wallEdge: string;
  player: string;
  interactable: string;
  hazard: string;
  enemy: string;
};

export type DungeonThemeRenderStrength = {
  floor: number;
  wallEdge: number;
  player: number;
  interactable: number;
  hazard: number;
  enemy: number;
};

export type DungeonTheme = {
  id: string;
  label: string;

  /** Render config — maps to shader uniforms via toShaderUniforms(). */
  render: {
    colors: DungeonThemeRenderColors;
    strength: DungeonThemeRenderStrength;
  };

  /** Room themes available in this dungeon theme. */
  roomThemes: RoomTheme[];

  /** Spawn tables — stubs until Session 5 resolver pipeline. */
  spawnTables: {
    monsters: SpawnTable<string>;
    loot: SpawnTable<string>;
    props: SpawnTable<string>;
    npcs: SpawnTable<string>;
    bosses: SpawnTable<string>;
  };
};

// ---------------------------------------------------------------------------
// Shader-ready uniform values
// ---------------------------------------------------------------------------

export type Vec4 = [number, number, number, number];

export type RenderThemeUniforms = {
  uFloorColor: Vec4;
  uWallColor: Vec4;
  uPlayerColor: Vec4;
  uItemColor: Vec4;
  uHazardColor: Vec4;
  uEnemyColor: Vec4;
};

// ---------------------------------------------------------------------------
// Theme resolved payload (returned in GenerateDungeonResult)
// ---------------------------------------------------------------------------

export type ThemeResolvedPayload = {
  themeId: string;
  uniforms: RenderThemeUniforms;
  // Future (Session 4): roomThemesByRoomId, roomTagsByRoomId
};
