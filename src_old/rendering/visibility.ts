// src/rendering/visibility.ts
import * as THREE from "three";

export type VisibilityParams = {
  /** Outer visibility radius in cells. */
  radius: number;
  /** Cells within this distance are always fully visible (A=255). */
  innerRadius: number;
  /** When true, any visible cell is also marked as explored (G=255). */
  exploredOnVisible: boolean;
  /**
   * Return true if the cell at (x, y) blocks line-of-sight (walls, closed
   * doors, etc.).  When omitted every cell is transparent (pure radius check).
   */
  isOpaque?: (x: number, y: number) => boolean;
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
  const { radius, innerRadius, exploredOnVisible, isOpaque } = params;

  // 1. Wipe only the A channel (leave explored G as-is).
  for (let n = 0; n < W * H; n++) {
    data[n * 4 + 3] = 0;
  }

  // 2. Raycasting FOV: for each cell in the bounding box cast a ray from the
  //    player and walk it with the supercover DDA algorithm.  The first opaque
  //    intermediate cell on the ray blocks everything beyond it; the opaque
  //    cell itself remains visible (you see the wall face).
  const px = Math.floor(playerX);
  const py = Math.floor(playerY);
  const x0 = Math.max(0, px - Math.ceil(radius));
  const x1 = Math.min(W - 1, px + Math.ceil(radius));
  const y0 = Math.max(0, py - Math.ceil(radius));
  const y1 = Math.min(H - 1, py + Math.ceil(radius));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const d = Math.hypot(tx - px, ty - py);
      if (d > radius) continue;

      // --- Line-of-sight check via supercover DDA ---
      let visible = true;

      if (isOpaque) {
        const dx = tx - px;
        const dy = ty - py;
        const nx = Math.abs(dx);
        const ny = Math.abs(dy);
        const sx = dx > 0 ? 1 : -1;
        const sy = dy > 0 ? 1 : -1;
        let cx = px;
        let cy = py;
        let ix = 0;
        let iy = 0;

        while (ix < nx || iy < ny) {
          // Advance to the next cell along the ray.
          if (ny === 0 || (nx > 0 && (0.5 + ix) / nx < (0.5 + iy) / ny)) {
            cx += sx;
            ix++;
          } else {
            cy += sy;
            iy++;
          }

          if (cx < 0 || cx >= W || cy < 0 || cy >= H) {
            visible = false;
            break;
          }

          if (cx === tx && cy === ty) break; // reached target — visible

          // Intermediate cell: if opaque, target is blocked.
          if (isOpaque(cx, cy)) {
            visible = false;
            break;
          }
        }
      }

      if (!visible) continue;

      let a: number;
      if (d <= innerRadius) {
        a = 255;
      } else {
        a = Math.floor(255 * (1 - (d - innerRadius) / (radius - innerRadius)));
      }

      const base = (ty * W + tx) * 4;
      data[base + 3] = a;

      if (exploredOnVisible && a > 0) {
        data[base + 1] = 255; // G = explored
      }
    }
  }
}
