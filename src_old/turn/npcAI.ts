// src/turn/npcAI.ts
//
// AI for NPC actors on the overworld.
// Currently implements merchant wagon behaviour: patrolling between dungeon portals.

import { aStar8 } from "../pathfinding/aStar8";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import type { DungeonPortal } from "../mazeGen";
import type { TurnAction, NpcActor } from "./turnTypes";
import type { TurnSystemState } from "./turnSystem";


export type NpcDecideResult = {
  action: TurnAction;
  npcPatch: Partial<NpcActor>;
};

/**
 * Decide the next action for a merchant wagon NPC.
 * Pathfinds toward its target portal; picks a new target when it arrives.
 */
export function decideMerchantWagon(
  state: TurnSystemState,
  npcId: string,
  bsp: BspDungeonOutputs,
  content: ContentOutputs,
  portals: DungeonPortal[],
): NpcDecideResult {
  const npc = state.actors[npcId] as NpcActor;

  if (portals.length < 2) {
    return { action: { kind: "wait" }, npcPatch: {} };
  }

  const target = portals[npc.targetPortalIndex];

  // Arrived at destination — pick the next portal in sequence.
  if (npc.x === target.x && npc.y === target.y) {
    const nextTarget =
      (npc.targetPortalIndex + 1) % portals.length;
    return {
      action: { kind: "wait" },
      npcPatch: {
        targetPortalIndex: nextTarget,
        sourcePortalIndex: npc.targetPortalIndex,
      },
    };
  }

  // Use the original BSP (real solid mask) so trees are impassable — NPCs
  // stay on pathways rather than cutting through the forest.
  const pathResult = aStar8(
    bsp,
    content,
    { x: npc.x, y: npc.y },
    { x: target.x, y: target.y },
  );

  if (!pathResult || pathResult.path.length < 2) {
    return { action: { kind: "wait" }, npcPatch: {} };
  }

  const next = pathResult.path[1];
  return {
    action: { kind: "move", dx: next.x - npc.x, dy: next.y - npc.y },
    npcPatch: {},
  };
}
