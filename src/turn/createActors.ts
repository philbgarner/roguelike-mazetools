// src/turn/createActors.ts
//
// Deterministic conversion from generator output into runtime actors.
// The same dungeon + resolved spawns always produces the same actor set.

import type { ResolvedSpawns } from "../resolve/resolveTypes";
import { clamp } from "./actionCosts";
import type { PlayerActor, MonsterActor } from "./turnTypes";

/** Default player speed (acts 10x per BASE_TIME unit with default BASE_TIME=100). */
const PLAYER_SPEED = 10;

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
 * Returns an empty array if resolved is null (theme-less path).
 *
 * Speed is derived deterministically from danger level so that more
 * dangerous monsters act more frequently:
 *   speed = clamp(1, 10, 4 + danger)
 */
export function createMonstersFromResolved(
  resolved: ResolvedSpawns | null,
): MonsterActor[] {
  if (!resolved) return [];

  return resolved.monsters.map((spawn) => {
    const speed = 15;
    console.log("monster", spawn.entityId, "speed", speed, "spawn", spawn);
    return {
      id: spawn.entityId,
      kind: "monster" as const,
      x: spawn.x,
      y: spawn.y,
      speed,
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
