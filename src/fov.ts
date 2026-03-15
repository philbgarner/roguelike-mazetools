// src/fov.ts
//
// Field-of-view computation using recursive shadowcasting (Björn Bergström's algorithm).
// Covers all 8 octants, O(r²) with no heap allocations.

export type FovOptions = {
  /**
   * Return true if the cell blocks light (usually: solid === "wall").
   * Called with every candidate cell during the octant sweep.
   * Should return true for out-of-bounds coordinates.
   */
  isOpaque: (x: number, y: number) => boolean;

  /**
   * Called once per visible cell, including the origin itself.
   * Use this to write to a visibility mask, reveal map tiles, etc.
   */
  visit: (x: number, y: number) => void;

  /** Chebyshev radius. Cells beyond this distance are never visited. Default: 1024. */
  radius?: number;
};

// Octant transform table: each entry is [xx, xy, yx, yy].
// Maps octant-space (dx, dy) to world offset via:
//   worldX = originX + dx*xx + dy*xy
//   worldY = originY + dx*yx + dy*yy
const OCTANTS: [number, number, number, number][] = [
  [ 1,  0,  0,  1],
  [ 0,  1,  1,  0],
  [ 0, -1,  1,  0],
  [-1,  0,  0,  1],
  [-1,  0,  0, -1],
  [ 0, -1, -1,  0],
  [ 0,  1, -1,  0],
  [ 1,  0,  0, -1],
];

/**
 * Compute the set of cells visible from (originX, originY) using recursive
 * shadowcasting across all 8 octants.
 *
 * Example:
 *   computeFov(px, py, {
 *     isOpaque: (x, y) => x < 0 || y < 0 || x >= W || y >= H || solidData[y*W+x] !== 0,
 *     visit: (x, y) => visibilityMask[y * W + x] = 1,
 *     radius: 12,
 *   });
 */
export function computeFov(
  originX: number,
  originY: number,
  options: FovOptions,
): void {
  const { isOpaque, visit } = options;
  const radius = options.radius ?? 1024;
  const radiusSq = radius * radius;

  visit(originX, originY);

  for (const [xx, xy, yx, yy] of OCTANTS) {
    castLight(originX, originY, 1, 1.0, 0.0, radius, radiusSq, xx, xy, yx, yy, isOpaque, visit);
  }
}

function castLight(
  cx: number,
  cy: number,
  row: number,
  startSlope: number,
  endSlope: number,
  radius: number,
  radiusSq: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  isOpaque: (x: number, y: number) => boolean,
  visit: (x: number, y: number) => void,
): void {
  if (startSlope < endSlope) return;

  for (let j = row; j <= radius; j++) {
    const dy = -j;
    let blocked = false;
    let newStartSlope = 0.0;

    for (let dx = -j; dx <= 0; dx++) {
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;

      const mapX = cx + dx * xx + dy * xy;
      const mapY = cy + dx * yx + dy * yy;

      if (dx * dx + dy * dy <= radiusSq) {
        visit(mapX, mapY);
      }

      if (blocked) {
        if (isOpaque(mapX, mapY)) {
          newStartSlope = rSlope;
        } else {
          blocked = false;
          startSlope = newStartSlope;
        }
      } else if (isOpaque(mapX, mapY) && j < radius) {
        blocked = true;
        castLight(
          cx, cy, j + 1, startSlope, lSlope,
          radius, radiusSq, xx, xy, yx, yy,
          isOpaque, visit,
        );
        newStartSlope = rSlope;
      }
    }

    if (blocked) break;
  }
}

/**
 * Allocate a zeroed Uint8Array of size width×height.
 * After calling computeFov with `visit: (x, y) => mask[y * width + x] = 1`,
 * non-zero entries are the visible cells.
 */
export function createVisibilityMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}
