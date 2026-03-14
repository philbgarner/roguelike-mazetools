// src/walkability.ts
//
// Shared walkability rules used by:
// - runtime movement / pushing (dungeonState.ts)
// - generation-time reachability validation (puzzlePatterns.ts)
//
// IMPORTANT:
// - Walls are never walkable.
// - Doors are walkable only if "open" (according to provided resolver).
// - Hidden passages (featureType=9) are blocked until revealed (according to provided resolver).
// - Hazards never block movement (consequence-only for now).

import type { BspDungeonOutputs, ContentOutputs } from "./mazeGen";

type DoorOpenResolver = (doorId: number) => boolean;
type SecretRevealedResolver = (secretId: number) => boolean;

export type WalkabilityResolvers = {
  isDoorOpen?: DoorOpenResolver;
  isSecretRevealed?: SecretRevealedResolver;
};

function idxOf(W: number, x: number, y: number) {
  return y * W + x;
}

export function isTileWalkable(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  x: number,
  y: number,
  resolvers: WalkabilityResolvers = {},
): boolean {
  const W = dungeon.width;
  const H = dungeon.height;
  if (x < 0 || y < 0 || x >= W || y >= H) return false;

  const i = idxOf(W, x, y);

  // walls
  if (dungeon.masks.solid[i] === 255) return false;

  const ft = content.masks.featureType[i] | 0;
  const fid = content.masks.featureId[i] | 0;

  // Hidden passage: blocked until revealed
  if (ft === 9 && fid !== 0) {
    const isRevealed = resolvers.isSecretRevealed
      ? resolvers.isSecretRevealed(fid)
      : false;
    if (!isRevealed) return false;
  }

  // Door: blocked until open
  if (ft === 4 && fid !== 0) {
    const isOpen = resolvers.isDoorOpen ? resolvers.isDoorOpen(fid) : false;
    if (!isOpen) return false;
  }

  // Hazards do not block (by design, for now)

  return true;
}
