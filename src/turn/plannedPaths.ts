// src/turn/plannedPaths.ts
//
// Computes each living monster's planned chase path for rendering overlays.
// Respects alert state: idle monsters have no planned path.
// Reuses the same A* logic as the AI so the visualised path matches what
// the monster will actually do on its next turn.

import type { TurnSystemState } from "./turnSystem";
import type { ActorId } from "./turnTypes";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import type { DungeonRuntimeState } from "../dungeonState";
import type { GridPos } from "../pathfinding/aStar8";
import { computeChasePathForOverlay } from "./monsterAI";

export type PlannedPath = { actorId: ActorId; path: GridPos[] };

/**
 * Compute the planned path for every living, alerted monster.
 *
 * Returns one entry per monster that is chasing or searching and has a
 * reachable path. Idle monsters and unreachable targets are omitted.
 *
 * @param maxSteps  Cap path length to keep alpha-gradient meaningful (default 32).
 */
export function computeEnemyPlannedPaths(args: {
  state: TurnSystemState;
  dungeon: BspDungeonOutputs;
  content: ContentOutputs;
  runtime: DungeonRuntimeState;
  maxSteps?: number;
}): PlannedPath[] {
  const { state, dungeon, content, runtime, maxSteps = 32 } = args;
  const results: PlannedPath[] = [];

  for (const actor of Object.values(state.actors)) {
    if (actor.kind !== "monster" || !actor.alive) continue;

    const path = computeChasePathForOverlay(
      state,
      actor.id,
      dungeon,
      content,
      runtime,
      { maxSteps },
    );

    if (path) {
      results.push({ actorId: actor.id, path });
    }
  }

  return results;
}
