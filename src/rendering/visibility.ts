// src/rendering/visibility.ts
import * as THREE from "three";

export type VisibilityParams = {
  /** Outer visibility radius in cells. */
  radius: number;
  /** Cells within this distance are always fully visible (A=255). */
  innerRadius: number;
  /** When true, any visible cell is also marked as explored (G=255). */
  exploredOnVisible: boolean;
};

/**
 * Allocate a W×H RGBA8 DataTexture for the visibility + explored mask.
 *
 * Channel layout per cell:
 *   R – unused (0)
 *   G – explored: 0 or 255
 *   B – unused (0)
 *   A – visibility: 0 (not visible) … 255 (fully visible)
 *
 * The returned `data` buffer is owned by the caller; mutate it with
 * `updateVisExploredRGBA` then set `tex.needsUpdate = true`.
 */
export function createVisExploredRGBA(
  W: number,
  H: number,
  name: string,
): { data: Uint8Array; tex: THREE.DataTexture } {
  const data = new Uint8Array(W * H * 4); // zeroed — unexplored

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

/**
 * Recompute the visibility (A) channel around the player, accumulating the
 * explored (G) channel.  Call this whenever playerX or playerY changes, then
 * set `tex.needsUpdate = true`.
 *
 * @param data   The `Uint8Array` returned by `createVisExploredRGBA`.
 * @param W      Dungeon width in cells.
 * @param H      Dungeon height in cells.
 */
export function updateVisExploredRGBA(
  data: Uint8Array,
  W: number,
  H: number,
  playerX: number,
  playerY: number,
  params: VisibilityParams,
): void {
  const { radius, innerRadius, exploredOnVisible } = params;

  // 1. Wipe only the A channel (leave explored G as-is).
  for (let n = 0; n < W * H; n++) {
    data[n * 4 + 3] = 0;
  }

  // 2. Recompute visibility within bounding box.
  const x0 = Math.max(0, Math.floor(playerX - radius));
  const x1 = Math.min(W - 1, Math.ceil(playerX + radius));
  const y0 = Math.max(0, Math.floor(playerY - radius));
  const y1 = Math.min(H - 1, Math.ceil(playerY + radius));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - playerX, y - playerY);

      let a: number;
      if (d <= innerRadius) {
        a = 255;
      } else if (d <= radius) {
        a = Math.floor(255 * (1 - (d - innerRadius) / (radius - innerRadius)));
      } else {
        continue;
      }

      const base = (y * W + x) * 4;
      data[base + 3] = a;

      if (exploredOnVisible && a > 0) {
        data[base + 1] = 255; // G = explored
      }
    }
  }
}
