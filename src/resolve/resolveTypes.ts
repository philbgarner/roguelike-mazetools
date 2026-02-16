/**
 * Resolver pipeline types — Session 5.
 *
 * Defines the shape of theme-resolved spawnables produced from
 * abstract content placements (monsters, chests, secrets, etc.).
 */

// ---------------------------------------------------------------------------
// Stable entity ID
// ---------------------------------------------------------------------------

/**
 * A stable entity ID encodes the entity kind and a positional key so that
 * the same dungeon request always produces the same IDs regardless of
 * iteration order.
 *
 * Format: `{kind}:{roomId}:{index}`
 *   - kind   — "monster" | "loot" | "prop" | "npc" | "boss"
 *   - roomId — the room the entity was placed in (from content.meta)
 *   - index  — a 0-based counter per (kind, roomId) pair, ordered by
 *              the entity's position (y * width + x) for stability
 */
export type ResolvedEntityId = string;

// ---------------------------------------------------------------------------
// Per-entity resolved spawn types
// ---------------------------------------------------------------------------

export type ResolvedMonsterSpawn = {
  entityId: ResolvedEntityId;
  /** Source placement from content.meta.monsters */
  sourceId: number;
  x: number;
  y: number;
  roomId: number;
  danger: number;
  /** Theme-resolved monster identifier (from spawnTables.monsters) */
  spawnId: string;
};

export type ResolvedLootSpawn = {
  entityId: ResolvedEntityId;
  /** Source placement from content.meta.chests */
  sourceId: number;
  x: number;
  y: number;
  roomId: number;
  tier: number;
  /** Theme-resolved loot identifier (from spawnTables.loot) */
  spawnId: string;
};

export type ResolvedPropSpawn = {
  entityId: ResolvedEntityId;
  /** Source placement from content.meta.secrets */
  sourceId: number;
  x: number;
  y: number;
  roomId: number;
  kind: string;
  /** Theme-resolved prop identifier (from spawnTables.props) */
  spawnId: string;
};

export type ResolvedNpcSpawn = {
  entityId: ResolvedEntityId;
  x: number;
  y: number;
  roomId: number;
  /** Theme-resolved NPC identifier (from spawnTables.npcs) */
  spawnId: string;
};

export type ResolvedBossSpawn = {
  entityId: ResolvedEntityId;
  x: number;
  y: number;
  roomId: number;
  /** Theme-resolved boss identifier (from spawnTables.bosses) */
  spawnId: string;
};

// ---------------------------------------------------------------------------
// Top-level resolved spawns container
// ---------------------------------------------------------------------------

export type ResolvedSpawns = {
  monsters: ResolvedMonsterSpawn[];
  loot: ResolvedLootSpawn[];
  props: ResolvedPropSpawn[];
  npcs: ResolvedNpcSpawn[];
  bosses: ResolvedBossSpawn[];
};
