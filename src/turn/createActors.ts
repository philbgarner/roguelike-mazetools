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
import type { PlayerActor, MonsterActor } from "./turnTypes";

/** Default player speed (acts 10x per BASE_TIME unit with default BASE_TIME=100). */
const PLAYER_SPEED = 10;

/** Fallback stats when a spawnId isn't found in any stat table. */
const FALLBACK_STATS = { speed: 8, hp: 10, attack: 3, defense: 1, xp: 10, glyph: "M" };

/**
 * Create the player actor at the given start position.
 * Uses the id "player" for single-floor scenarios.
 */
export function createPlayerActor(startX: number, startY: number): PlayerActor {
  return {
    id: "player",
    kind: "player",
    x: startX,
    y: startY,
    speed: PLAYER_SPEED,
    alive: true,
    blocksMovement: true,
  };
}

/**
 * Map resolved monster spawns to runtime MonsterActor instances.
 * Stats (speed, hp, attack, defense, xp) are looked up from spawnTableData
 * using the theme-resolved spawnId.
 */
export function createMonstersFromResolved(
  resolved: ResolvedSpawns | null,
): MonsterActor[] {
  if (!resolved) return [];

  return resolved.monsters.map((spawn) => {
    const statBlock =
      MONSTER_STATS[spawn.spawnId] ??
      BOSS_STATS[spawn.spawnId] ??
      NPC_STATS[spawn.spawnId] ??
      FALLBACK_STATS;
    console.log("monster stat block", statBlock);
    return {
      id: spawn.entityId,
      kind: "monster" as const,
      x: spawn.x,
      y: spawn.y,
      glyph: "glyph" in statBlock ? statBlock.glyph : "M",
      speed: statBlock.speed,
      hp: statBlock.hp,
      maxHp: statBlock.hp,
      attack: statBlock.attack,
      defense: statBlock.defense,
      xp: statBlock.xp,
      alive: true,
      blocksMovement: true,
      spawnId: spawn.spawnId,
      danger: spawn.danger,
      roomId: spawn.roomId,
      alertState: "idle" as const,
      searchTurnsLeft: 0,
      lastKnownPlayerPos: null,
    };
  });
}
