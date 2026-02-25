// src/turn/monsterAI.ts
//
// Phase-2 monster AI: chase the player using A*.
//
// Replaces the phase-1 waitAI stub in turnSystem.ts.

import { aStar8 } from "../pathfinding/aStar8";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import type { DungeonRuntimeState } from "../dungeonState";
import type { TurnAction, ActorId } from "./turnTypes";
import type { TurnSystemState } from "./turnSystem";

/**
 * Monster AI that chases the player using 8-directional A*.
 *
 * Computes the full path to the player and returns a move action for the
 * first step. Falls back to wait if no path exists (player unreachable or
 * monster is already adjacent).
 *
 * Usage:
 *   deps.monsterDecide = (state, monsterId) =>
 *     decideChasePlayer(state, monsterId, dungeon, content, runtime);
 */
export function decideChasePlayer(
  state: TurnSystemState,
  monsterId: ActorId,
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  runtime: DungeonRuntimeState,
): TurnAction {
  const monster = state.actors[monsterId];
  const player = state.actors[state.playerId];

  if (!monster || !player || !monster.alive || !player.alive) {
    return { kind: "wait" };
  }

  const resolvers = {
    isDoorOpen: (doorId: number) => !!runtime.doors?.[doorId]?.isOpen,
    isSecretRevealed: (secretId: number) =>
      !!runtime.secrets?.[secretId]?.revealed,
  };

  const result = aStar8(
    dungeon,
    content,
    { x: monster.x, y: monster.y },
    { x: player.x, y: player.y },
    resolvers,
  );

  if (!result || result.path.length < 2) {
    // Already at target or unreachable.
    return { kind: "wait" };
  }

  // path[0] is the monster's current cell; path[1] is the next step.
  const next = result.path[1];
  const dx = next.x - monster.x;
  const dy = next.y - monster.y;

  return { kind: "move", dx, dy };
}
