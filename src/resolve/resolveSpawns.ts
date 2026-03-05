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
 *
 * Level-gated spawning:
 *   - Each dungeon level has an XP budget computed by levelBudget.ts.
 *   - Monsters whose base XP exceeds the budget are filtered from the table.
 *   - Monsters placed below their natural level receive HP scaling.
 *   - Leftover room XP budget is spent on equipment for monsters.
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
  ResolvedEquipment,
} from "./resolveTypes";
import { hashSeed, pickWeighted } from "./seededPicker";
import {
  computeBudgetK,
  xpBudgetForLevel,
  creatureUnlockLevel,
  hpScaleFactor,
} from "./levelBudget";
import {
  MONSTER_STATS,
  BOSS_STATS,
} from "../examples/data/spawnTableData";
import { ITEM_TEMPLATES } from "../game/data/itemData";
import type { SpawnTableEntry } from "../theme/themeTypes";

// ---------------------------------------------------------------------------
// Budget constant — autotuned from all monster XP values at module init
// ---------------------------------------------------------------------------

const ALL_MONSTER_XP = [
  ...Object.values(MONSTER_STATS).map((s) => s.xp),
  ...Object.values(BOSS_STATS).map((s) => s.xp),
].filter((xp) => xp > 0);

const BUDGET_K = computeBudgetK(ALL_MONSTER_XP);

// ---------------------------------------------------------------------------
// Stat ratios — autotuned from all monster stat blocks for equipment scaling
// ---------------------------------------------------------------------------

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const monsters = Object.values(MONSTER_STATS);
const ATK_PER_XP = avg(monsters.filter((m) => m.xp > 0).map((m) => m.attack / m.xp));
const DEF_PER_XP = avg(monsters.filter((m) => m.xp > 0).map((m) => m.defense / m.xp));
const HP_PER_XP  = avg(monsters.filter((m) => m.xp > 0).map((m) => m.hp / m.xp));

/** Minimum leftover XP to generate equipment. Prevents trivial trinkets. */
const MIN_EQUIP_BUDGET = 5;

// ---------------------------------------------------------------------------
// Stable entity ID helpers
// ---------------------------------------------------------------------------

function posKey(x: number, y: number, width: number): number {
  return y * width + x;
}

function buildEntityId(
  kind: string,
  roomId: number,
  indexInRoom: number,
): ResolvedEntityId {
  return `${kind}:${roomId}:${indexInRoom}`;
}

function assignStableIds<T extends { x: number; y: number; roomId: number }>(
  items: T[],
  kind: string,
  width: number,
): Array<T & { entityId: ResolvedEntityId; stableId: string }> {
  const sorted = items.slice().sort((a, b) => {
    const pa = posKey(a.x, a.y, width);
    const pb = posKey(b.x, b.y, width);
    return pa - pb;
  });

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
// Level-filtered spawn table
// ---------------------------------------------------------------------------

/**
 * Filter a monster spawn table to only entries eligible at the given level.
 * Falls back to the lowest-xp entry if everything is filtered out.
 */
function filteredMonsterTable(
  table: SpawnTableEntry<string>[],
  level: number,
): SpawnTableEntry<string>[] {
  const budget = xpBudgetForLevel(level, BUDGET_K);
  const eligible = table.filter((entry) => {
    const stats = MONSTER_STATS[entry.value] ?? BOSS_STATS[entry.value];
    if (!stats) return true; // unknown creature — let it through
    return stats.xp <= budget;
  });

  if (eligible.length > 0) return eligible;

  // Fallback: pick the cheapest creature in the original table
  let cheapest: SpawnTableEntry<string> | null = null;
  let cheapestXp = Infinity;
  for (const entry of table) {
    const stats = MONSTER_STATS[entry.value] ?? BOSS_STATS[entry.value];
    const xp = stats?.xp ?? 0;
    if (xp < cheapestXp) {
      cheapestXp = xp;
      cheapest = entry;
    }
  }
  return cheapest ? [cheapest] : table;
}

// ---------------------------------------------------------------------------
// HP scaling
// ---------------------------------------------------------------------------

function computeScaledHp(spawnId: string, level: number): number {
  const stats = MONSTER_STATS[spawnId] ?? BOSS_STATS[spawnId];
  if (!stats) return 10;
  const naturalLevel = creatureUnlockLevel(stats.xp, BUDGET_K);
  const factor = hpScaleFactor(level, naturalLevel);
  return Math.max(1, Math.round(stats.hp * factor));
}

// ---------------------------------------------------------------------------
// Equipment generation
// ---------------------------------------------------------------------------

function generateEquipment(
  equipBudget: number,
  seed: number,
): ResolvedEquipment | null {
  if (equipBudget < MIN_EQUIP_BUDGET) return null;

  const templateIndex = Math.abs(seed) % ITEM_TEMPLATES.length;
  const template = ITEM_TEMPLATES[templateIndex];

  let bonusAttack = 0;
  let bonusDefense = 0;
  let bonusMaxHp = 0;

  switch (template.type) {
    case "weapon":
      bonusAttack = Math.max(1, Math.round(equipBudget * ATK_PER_XP * 0.6));
      break;
    case "armor":
      bonusDefense = Math.max(0, Math.round(equipBudget * DEF_PER_XP * 0.5));
      bonusMaxHp   = Math.max(0, Math.round(equipBudget * HP_PER_XP  * 0.3));
      break;
    case "trinket":
      bonusAttack  = Math.max(0, Math.round(equipBudget * ATK_PER_XP * 0.2));
      bonusDefense = Math.max(0, Math.round(equipBudget * DEF_PER_XP * 0.2));
      bonusMaxHp   = Math.max(0, Math.round(equipBudget * HP_PER_XP  * 0.2));
      break;
  }

  return {
    itemId: template.id,
    bonusAttack,
    bonusDefense,
    bonusMaxHp,
    value: Math.round(equipBudget),
  };
}

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

  // Precompute budget for this dungeon level
  const roomBudget = xpBudgetForLevel(level, BUDGET_K);

  // --- Monsters -----------------------------------------------------------

  const monsterItems = assignStableIds(
    content.meta.monsters,
    "monster",
    width,
  );

  // Compute per-room remaining XP budget after monster placement
  const roomRemainingXp = new Map<number, number>();
  for (const m of monsterItems) {
    if (!roomRemainingXp.has(m.roomId)) {
      roomRemainingXp.set(m.roomId, roomBudget);
    }
  }

  const levelFilteredTable = filteredMonsterTable(tables.monsters, level);

  const monsters: ResolvedMonsterSpawn[] = monsterItems.map((m) => {
    const entitySeed = hashSeed(seed, theme.id, "monster", m.stableId, level);
    const spawnId = pickWeighted(levelFilteredTable, entitySeed) ?? "";

    const scaledHp = computeScaledHp(spawnId, level);

    // Deduct creature XP from the room budget
    const creatureStats = MONSTER_STATS[spawnId] ?? BOSS_STATS[spawnId];
    const creatureXp = creatureStats?.xp ?? 0;
    const prev = roomRemainingXp.get(m.roomId) ?? 0;
    roomRemainingXp.set(m.roomId, Math.max(0, prev - creatureXp));

    return {
      entityId: m.entityId,
      sourceId: m.id,
      x: m.x,
      y: m.y,
      roomId: m.roomId,
      danger: m.danger,
      spawnId,
      scaledHp,
      equipment: null, // assigned in second pass below
    };
  });

  // Second pass: assign equipment to one monster per room using leftover budget
  const roomEquipAssigned = new Set<number>();
  for (const monster of monsters) {
    if (roomEquipAssigned.has(monster.roomId)) continue;
    const leftover = roomRemainingXp.get(monster.roomId) ?? 0;
    if (leftover >= MIN_EQUIP_BUDGET) {
      const equipSeed = hashSeed(seed, theme.id, "equip", monster.entityId, level);
      const equipment = generateEquipment(leftover, equipSeed);
      if (equipment) {
        monster.equipment = equipment;
        roomEquipAssigned.add(monster.roomId);
      }
    }
  }

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
