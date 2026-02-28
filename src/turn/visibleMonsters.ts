// src/turn/visibleMonsters.ts
//
// Helpers to query which monsters are currently visible to the player.
//
// Uses the same pure-distance algorithm as the renderer (visibility.ts):
// a cell is visible when Math.hypot(dx, dy) <= radius.  No wall occlusion.
// This avoids the async timing problem of reading the renderer's vis buffer.

import type { ActorBase } from "./turnTypes";

export type ActorLike = Pick<ActorBase, "id" | "kind" | "x" | "y" | "alive">;

export function countVisibleMonsters(args: {
  playerX: number;
  playerY: number;
  radius: number;
  actors: Record<string, ActorLike>;
}): number {
  const { playerX, playerY, radius, actors } = args;

  let n = 0;
  for (const id in actors) {
    const a = actors[id];
    if (!a) continue;
    if (a.kind !== "monster") continue;
    if (!a.alive) continue;
    if (Math.hypot(a.x - playerX, a.y - playerY) <= radius) n++;
  }
  return n;
}

export function getVisibleMonsterIds(args: {
  playerX: number;
  playerY: number;
  radius: number;
  actors: Record<string, ActorLike>;
}): string[] {
  const { playerX, playerY, radius, actors } = args;

  const out: string[] = [];
  for (const id in actors) {
    const a = actors[id];
    if (!a) continue;
    if (a.kind !== "monster") continue;
    if (!a.alive) continue;
    if (Math.hypot(a.x - playerX, a.y - playerY) <= radius) out.push(id);
  }
  return out;
}
