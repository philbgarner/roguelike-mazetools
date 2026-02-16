/**
 * Resolver pipeline — Session 5.
 *
 * Converts abstract content placements into theme-resolved spawnables
 * deterministically. Every entity gets a stable seed derived from:
 *
 *   hash(globalSeed, themeId, entityKind, entityStableId)
 *
 * where entityStableId = `{roomId}:{positionKey}` (positionKey = y * width + x).
 * This ensures the same request always produces identical resolved spawns
 * regardless of array iteration quirks.
 */

import type { ContentOutputs } from "../mazeGen";
import type { DungeonTheme } from "../theme/themeTypes";
import type {
  ResolvedSpawns,
  ResolvedMonsterSpawn,
  ResolvedLootSpawn,
  ResolvedPropSpawn,
  ResolvedNpcSpawn,
  ResolvedBossSpawn,
  ResolvedEntityId,
} from "./resolveTypes";
import { hashSeed, pickWeighted } from "./seededPicker";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type ResolveSpawnsInput = {
  theme: DungeonTheme;
  content: ContentOutputs;
  seed: number;
  level: number;
};

// ---------------------------------------------------------------------------
// Stable entity ID helpers
// ---------------------------------------------------------------------------

function posKey(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * Build a stable entity ID.
 *
 * Within each (kind, roomId) group, entities are indexed by their grid
 * position so that the ID is independent of insertion order.
 */
function buildEntityId(
  kind: string,
  roomId: number,
  indexInRoom: number,
): ResolvedEntityId {
  return `${kind}:${roomId}:${indexInRoom}`;
}

/**
 * Sort items by position key (y * width + x) for stable ordering, then
 * assign per-room indices.
 */
function assignStableIds<T extends { x: number; y: number; roomId: number }>(
  items: T[],
  kind: string,
  width: number,
): Array<T & { entityId: ResolvedEntityId; stableId: string }> {
  // Sort by position for deterministic ordering
  const sorted = items.slice().sort((a, b) => {
    const pa = posKey(a.x, a.y, width);
    const pb = posKey(b.x, b.y, width);
    return pa - pb;
  });

  // Assign per-room index
  const roomCounters = new Map<number, number>();
  return sorted.map((item) => {
    const idx = roomCounters.get(item.roomId) ?? 0;
    roomCounters.set(item.roomId, idx + 1);
    const entityId = buildEntityId(kind, item.roomId, idx);
    const stableId = `${item.roomId}:${posKey(item.x, item.y, width)}`;
    return { ...item, entityId, stableId };
  });
}

// ---------------------------------------------------------------------------
// resolveSpawns
// ---------------------------------------------------------------------------

/**
 * Resolve abstract content placements into theme-based spawnables.
 *
 * - Deterministic: same input → identical output.
 * - Best-effort: empty spawn tables produce entities with spawnId = "".
 * - Never throws.
 */
export function resolveSpawns(input: ResolveSpawnsInput): ResolvedSpawns {
  const { theme, content, seed, level } = input;
  const width = content.width;
  const tables = theme.spawnTables;

  // --- Monsters -----------------------------------------------------------

  const monsterItems = assignStableIds(
    content.meta.monsters,
    "monster",
    width,
  );
  const monsters: ResolvedMonsterSpawn[] = monsterItems.map((m) => {
    const entitySeed = hashSeed(seed, theme.id, "monster", m.stableId, level);
    const spawnId = pickWeighted(tables.monsters, entitySeed) ?? "";
    return {
      entityId: m.entityId,
      sourceId: m.id,
      x: m.x,
      y: m.y,
      roomId: m.roomId,
      danger: m.danger,
      spawnId,
    };
  });

  // --- Loot (chests) ------------------------------------------------------

  const lootItems = assignStableIds(content.meta.chests, "loot", width);
  const loot: ResolvedLootSpawn[] = lootItems.map((c) => {
    const entitySeed = hashSeed(seed, theme.id, "loot", c.stableId, level);
    const spawnId = pickWeighted(tables.loot, entitySeed) ?? "";
    return {
      entityId: c.entityId,
      sourceId: c.id,
      x: c.x,
      y: c.y,
      roomId: c.roomId,
      tier: c.tier,
      spawnId,
    };
  });

  // --- Props (secrets) ----------------------------------------------------

  const propItems = assignStableIds(content.meta.secrets, "prop", width);
  const props: ResolvedPropSpawn[] = propItems.map((s) => {
    const entitySeed = hashSeed(seed, theme.id, "prop", s.stableId, level);
    const spawnId = pickWeighted(tables.props, entitySeed) ?? "";
    return {
      entityId: s.entityId,
      sourceId: s.id,
      x: s.x,
      y: s.y,
      roomId: s.roomId,
      kind: s.kind,
      spawnId,
    };
  });

  // --- NPCs (currently no NPC placements in content — future-ready) -------

  const npcs: ResolvedNpcSpawn[] = [];

  // --- Bosses (farthest room monster with highest danger, if any) ---------
  // Best-effort: promote the first monster in the farthest room to a boss
  // if the boss spawn table is non-empty. This is a simple heuristic;
  // future sessions can add explicit boss placement in content.

  const bosses: ResolvedBossSpawn[] = [];
  if (tables.bosses.length > 0 && content.meta.monsters.length > 0) {
    const farthestRoomId = content.meta.farthestRoomId;
    const bossCandidate = content.meta.monsters.find(
      (m) => m.roomId === farthestRoomId,
    );
    if (bossCandidate) {
      const stableId = `${bossCandidate.roomId}:${posKey(bossCandidate.x, bossCandidate.y, width)}`;
      const entitySeed = hashSeed(seed, theme.id, "boss", stableId, level);
      const spawnId = pickWeighted(tables.bosses, entitySeed) ?? "";
      bosses.push({
        entityId: buildEntityId("boss", bossCandidate.roomId, 0),
        x: bossCandidate.x,
        y: bossCandidate.y,
        roomId: bossCandidate.roomId,
        spawnId,
      });
    }
  }

  return { monsters, loot, props, npcs, bosses };
}
