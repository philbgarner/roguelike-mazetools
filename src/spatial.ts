// src/spatial.ts
//
// Pure geometric spatial query functions. No dungeon state required.
// All functions operate in grid coordinates; callers are responsible for
// clamping results to valid dungeon bounds.

import type { GridPos } from "./astar";

export type SpatialShape = "chebyshev" | "euclidean" | "manhattan";

/**
 * Returns all grid positions within `radius` of (cx, cy) using the chosen metric.
 * Does NOT perform bounds-checking — callers are responsible for clamping.
 *
 * "chebyshev"  — square neighbourhood, the standard roguelike "range"
 * "euclidean"  — circular neighbourhood
 * "manhattan"  — diamond neighbourhood
 */
export function tilesInRadius(
  cx: number,
  cy: number,
  radius: number,
  shape: SpatialShape = "chebyshev",
): GridPos[] {
  const result: GridPos[] = [];
  const r = Math.ceil(radius);

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inRange(dx, dy, radius, shape)) {
        result.push({ x: cx + dx, y: cy + dy });
      }
    }
  }

  return result;
}

/**
 * Returns all grid positions in a cone originating at (ox, oy).
 * directionRad: angle in radians (0 = east, positive = counter-clockwise in math coords).
 * halfAngle: half-width of the cone in radians (e.g. Math.PI/4 for a 90° cone).
 * range: Chebyshev reach.
 */
export function tilesInCone(
  ox: number,
  oy: number,
  directionRad: number,
  halfAngle: number,
  range: number,
): GridPos[] {
  const result: GridPos[] = [];
  const r = Math.ceil(range);

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue;

      const angle = Math.atan2(dy, dx);
      let diff = angle - directionRad;
      // Normalise to [-π, π]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      if (Math.abs(diff) <= halfAngle) {
        result.push({ x: ox + dx, y: oy + dy });
      }
    }
  }

  return result;
}

/**
 * Returns all grid cells intersected by a Bresenham line from `from` to `to`,
 * inclusive of both endpoints. Useful for projectile paths and area scans.
 */
export function tilesInLine(from: GridPos, to: GridPos): GridPos[] {
  const result: GridPos[] = [];

  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let err = dx - dy;

  while (true) {
    result.push({ x, y });
    if (x === to.x && y === to.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }

  return result;
}

/**
 * Callback variant of tilesInRadius — avoids allocating an array.
 * Calls visit(x, y) for each cell; return false from visit to stop early.
 */
export function visitTilesInRadius(
  cx: number,
  cy: number,
  radius: number,
  visit: (x: number, y: number) => boolean | void,
  shape: SpatialShape = "chebyshev",
): void {
  const r = Math.ceil(radius);

  outer: for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inRange(dx, dy, radius, shape)) {
        if (visit(cx + dx, cy + dy) === false) break outer;
      }
    }
  }
}

// Internal distance check helper.
function inRange(dx: number, dy: number, radius: number, shape: SpatialShape): boolean {
  switch (shape) {
    case "chebyshev":  return Math.max(Math.abs(dx), Math.abs(dy)) <= radius;
    case "euclidean":  return dx * dx + dy * dy <= radius * radius;
    case "manhattan":  return Math.abs(dx) + Math.abs(dy) <= radius;
  }
}
