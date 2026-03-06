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

/**
 * Equipment generated for a monster using leftover XP budget.
 * Stat bonuses are computed at generation time based on dungeon level.
 */
export type ResolvedEquipment = {
  /** Item template id (e.g. "sword", "shield", "ring") */
  itemId: string;
  bonusAttack: number;
  bonusDefense: number;
  bonusMaxHp: number;
  /** Gold value if dropped as loot */
  value: number;
  /** Display name including level suffix (e.g. "Axe +1"). Set when level > 1. */
  displayName?: string;
};

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
  /** HP after level-based scaling (may exceed base stat block hp). */
  scaledHp: number;
  /** Equipment granted from leftover room XP budget, or null. */
  equipment: ResolvedEquipment | null;
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
  /** Generated item inside the chest, or null if budget was too low. */
  equipment: ResolvedEquipment | null;
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
  /** HP after level-based scaling. */
  scaledHp: number;
  /** Equipment on the boss, or null. */
  equipment: ResolvedEquipment | null;
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
