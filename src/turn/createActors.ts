// src/turn/createActors.ts
//
// Deterministic conversion from generator output into runtime actors.
// The same dungeon + resolved spawns always produces the same actor set.

import type { ResolvedSpawns } from "../resolve/resolveTypes";
import {
  MONSTER_STATS,
  BOSS_STATS,
  NPC_STATS,
} from "../examples/data/spawnTableData";
import type { PlayerActor, MonsterActor, NpcActor } from "./turnTypes";
import type { DungeonPortal } from "../mazeGen";
import type { Player } from "../game/player";
import { createInventory, createInventoryItem, type Inventory } from "../game/inventory";
import { getItemTemplate } from "../game/data/itemData";

/** Default player speed (acts 10x per BASE_TIME unit with default BASE_TIME=100). */
const PLAYER_SPEED = 10;
const PLAYER_BASE_HP = 20;
const PLAYER_BASE_ATTACK = 5;
const PLAYER_BASE_DEFENSE = 1;

/** Fallback stats when a spawnId isn't found in any stat table. */
const FALLBACK_STATS = {
  speed: 8,
  hp: 10,
  attack: 3,
  defense: 1,
  xp: 10,
  glyph: "M",
};

/**
 * Create the player actor at the given start position.
 * When `seed` is provided, its stats override the hardcoded defaults —
 * use this to carry persistent player state across dungeon floors.
 */
export function createPlayerActor(
  startX: number,
  startY: number,
  seed?: Player,
): PlayerActor {
  return {
    id: "player",
    kind: "player",
    x: startX,
    y: startY,
    hp: seed?.hp ?? PLAYER_BASE_HP,
    maxHp: seed?.maxHp ?? PLAYER_BASE_HP,
    xp: seed?.xp ?? 0,
    level: seed?.level ?? 1,
    attack: seed?.attack ?? PLAYER_BASE_ATTACK,
    defense: seed?.defense ?? PLAYER_BASE_DEFENSE,
    gold: seed?.gold ?? 100,
    inventory: seed?.inventory ?? createInventory(),
    resistances: seed?.resistances ?? [],
    speed: PLAYER_SPEED,
    alive: true,
    blocksMovement: true,
  };
}

/** Speed for merchant wagon NPCs (slightly slower than the player's 10). */
const MERCHANT_SPEED = 8;

/**
 * Create merchant wagon NPC actors that patrol between dungeon portals.
 * Spawns `count` wagons, each starting at a different portal.
 */
export function createMerchantWagons(
  portals: DungeonPortal[],
  count: number,
): NpcActor[] {
  if (portals.length < 2) return [];
  const wagons: NpcActor[] = [];
  for (let i = 0; i < count; i++) {
    const sourceIdx = i % portals.length;
    const targetIdx = (sourceIdx + 1) % portals.length;
    const portal = portals[sourceIdx];
    wagons.push({
      id: `merchant_wagon_${i}`,
      kind: "npc",
      x: portal.x,
      y: portal.y,
      speed: MERCHANT_SPEED,
      alive: true,
      blocksMovement: false,
      glyph: "@",
      npcType: "merchant_wagon",
      targetPortalIndex: targetIdx,
      sourcePortalIndex: sourceIdx,
    });
  }
  return wagons;
}

type AnySpawn = {
  entityId: string;
  x: number;
  y: number;
  roomId: number;
  spawnId: string;
  scaledHp: number;
  equipment: import("../resolve/resolveTypes").ResolvedEquipment | null;
  danger?: number;
};

function spawnToActor(spawn: AnySpawn): MonsterActor {
  const statBlock =
    MONSTER_STATS[spawn.spawnId] ??
    BOSS_STATS[spawn.spawnId] ??
    NPC_STATS[spawn.spawnId] ??
    FALLBACK_STATS;
  const eq = spawn.equipment;
  const baseHp = spawn.scaledHp > 0 ? spawn.scaledHp : statBlock.hp;
  const hp     = baseHp + (eq?.bonusMaxHp ?? 0);

  // Build inventory — bonuses are already baked into attack/defense/hp above,
  // so we place the item directly into equipped without re-applying deltas.
  let inventory: Inventory = createInventory();
  if (eq) {
    const template = getItemTemplate(eq.itemId);
    if (template) {
      const instanceId = `${spawn.entityId}_eq`;
      const item = createInventoryItem(
        instanceId,
        template,
        eq.bonusAttack,
        eq.bonusDefense,
        eq.bonusMaxHp,
        eq.value,
        eq.displayName,
      );
      inventory = {
        items: [item],
        equipped: { [template.slot]: instanceId },
      };
    }
  }

  return {
    id: spawn.entityId,
    kind: "monster" as const,
    x: spawn.x,
    y: spawn.y,
    name: "name" in statBlock ? statBlock.name : spawn.spawnId,
    glyph: "glyph" in statBlock ? statBlock.glyph : "M",
    speed: statBlock.speed,
    hp,
    maxHp: hp,
    attack: statBlock.attack + (eq?.bonusAttack ?? 0),
    defense: statBlock.defense + (eq?.bonusDefense ?? 0),
    xp: statBlock.xp,
    inventory,
    weaknesses: ("weaknesses" in statBlock ? statBlock.weaknesses : undefined) ?? [],
    resistances: ("resistances" in statBlock ? statBlock.resistances : undefined) ?? [],
    attackDamageType: ("attackDamageType" in statBlock ? statBlock.attackDamageType : undefined),
    alive: true,
    blocksMovement: true,
    spawnId: spawn.spawnId,
    danger: spawn.danger ?? 0,
    roomId: spawn.roomId,
    alertState: "idle" as const,
    searchTurnsLeft: 0,
    lastKnownPlayerPos: null,
  };
}

/**
 * Map resolved monster and boss spawns to runtime MonsterActor instances.
 * Stats (speed, hp, attack, defense, xp) are looked up from spawnTableData
 * using the theme-resolved spawnId. Bosses are included and use BOSS_STATS.
 */
export function createMonstersFromResolved(
  resolved: ResolvedSpawns | null,
): MonsterActor[] {
  if (!resolved) return [];

  const monsters = resolved.monsters.map(spawnToActor);
  const bosses   = resolved.bosses.map(spawnToActor);
  return [...monsters, ...bosses];
}
