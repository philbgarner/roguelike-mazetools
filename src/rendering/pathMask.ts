// src/rendering/pathMask.ts
//
// Path mask RGBA8 texture — mirrors the visibility.ts pattern.
//
// Channel layout per cell:
//   R – enemy path coverage (0 or 255)
//   G – npc/neutral path coverage (0 or 255)
//   B – player path coverage (0 or 255)
//   A – step index from path start (0–255); 0 means no path here

import * as THREE from "three";
import type { GridPos } from "../pathfinding/aStar8";

export type PathMaskKind = "enemy" | "npc" | "player";

/**
 * Allocate a W×H RGBA8 DataTexture for the path mask.
 * All channels start at 0 (no path).
 */
export function createPathMaskRGBA(
  W: number,
  H: number,
  name: string,
): { data: Uint8Array; tex: THREE.DataTexture } {
  const data = new Uint8Array(W * H * 4); // zeroed

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);

  tex.name = name;

  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;

  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;

  tex.needsUpdate = true;

  return { data, tex };
}

/** Zero all channels (call before re-stamping paths each tick). */
export function clearPathMaskRGBA(data: Uint8Array): void {
  data.fill(0);
}

/**
 * Write a path into the mask buffer.
 *
 * For each cell at step `s` (0-based from start):
 *   - Sets the appropriate channel (R=enemy, G=npc, B=player) to 255.
 *   - Sets alpha to the minimum of any existing non-zero alpha and s+1,
 *     or s+1 if alpha was 0.  This makes overlapping paths take the
 *     earlier (smaller) step index, giving a consistent "distance from
 *     start" gradient when paths cross.
 *
 * @param data   Uint8Array from createPathMaskRGBA
 * @param W      Dungeon width
 * @param path   Ordered path cells from start (index 0) to goal
 * @param kind   Which entity kind ("enemy"→R, "npc"→G, "player"→B)
 */
export function stampPath(
  data: Uint8Array,
  W: number,
  path: GridPos[],
  kind: PathMaskKind,
): void {
  const chOffset = kind === "enemy" ? 0 : kind === "npc" ? 1 : 2;

  for (let s = 0; s < path.length; s++) {
    const { x, y } = path[s];
    const base = (y * W + x) * 4;

    // Set kind channel
    data[base + chOffset] = 255;

    // Alpha: step index clamped to 1..255 (0 means "no path")
    const stepVal = Math.min(255, s + 1);
    const existing = data[base + 3];
    data[base + 3] = existing === 0 ? stepVal : Math.min(existing, stepVal);
  }
}
