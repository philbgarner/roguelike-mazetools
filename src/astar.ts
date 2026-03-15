// src/astar.ts
//
// 8-directional A* pathfinding using octile distance heuristic.
// Integer-scaled costs: orthogonal = 10, diagonal = 14 (≈ 10*sqrt(2)).

import type { DungeonOutputs } from "./bsp";
import { MinHeap, octile } from "./bspHelpers";

export type GridPos = { x: number; y: number };

export type AStarPath = { path: GridPos[]; cost: number } | null;

export type AStar8Options = {
  /** Extra predicate: return true to treat (x,y) as impassable at runtime. */
  isBlocked?: (x: number, y: number) => boolean;
  /**
   * Extra movement cost added when entering cell (x, y).
   * Return 0 (or omit) for normal cost. Use positive values to discourage
   * but not forbid specific cells.
   */
  cellCost?: (x: number, y: number) => number;
};

// 8-directional offsets: [dx, dy, cost]
const DIRS: [number, number, number][] = [
  [ 0, -1, 10], // N
  [ 1, -1, 14], // NE
  [ 1,  0, 10], // E
  [ 1,  1, 14], // SE
  [ 0,  1, 10], // S
  [-1,  1, 14], // SW
  [-1,  0, 10], // W
  [-1, -1, 14], // NW
];

/**
 * Find the shortest 8-directional path from `start` to `goal`.
 *
 * @param dungeon     BSP dungeon outputs (used for grid dimensions only)
 * @param isWalkable  Walkability predicate — use ContentLogic.isWalkable or a custom fn
 * @param start       Starting grid position
 * @param goal        Target grid position
 * @param opts        Optional extra options (runtime blockers, per-cell costs)
 * @returns           Path from start to goal (inclusive) and total cost, or null if unreachable.
 */
export function aStar8(
  dungeon: DungeonOutputs,
  isWalkable: (x: number, y: number) => boolean,
  start: GridPos,
  goal: GridPos,
  opts: AStar8Options = {},
): AStarPath {
  const W = dungeon.width;
  const H = dungeon.height;

  function cellOk(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (!isWalkable(x, y)) return false;
    if (opts.isBlocked?.(x, y)) return false;
    return true;
  }

  if (!cellOk(goal.x, goal.y)) return null;
  if (!cellOk(start.x, start.y)) return null;

  const gScore = new Int32Array(W * H).fill(2147483647);
  const cameFromX = new Int16Array(W * H).fill(-1);
  const cameFromY = new Int16Array(W * H).fill(-1);

  const startIdx = start.y * W + start.x;
  gScore[startIdx] = 0;

  const open = new MinHeap<number>();
  open.push(octile(start.x, start.y, goal.x, goal.y), startIdx);

  while (open.size > 0) {
    const idx = open.pop()!;
    const cx = idx % W;
    const cy = (idx / W) | 0;

    if (cx === goal.x && cy === goal.y) {
      const path: GridPos[] = [];
      let ni = idx;
      while (ni !== startIdx || path.length === 0) {
        path.push({ x: ni % W, y: (ni / W) | 0 });
        const px = cameFromX[ni];
        const py = cameFromY[ni];
        if (px === -1) break;
        ni = py * W + px;
      }
      if (path[path.length - 1].x !== start.x || path[path.length - 1].y !== start.y) {
        path.push({ x: start.x, y: start.y });
      }
      path.reverse();
      return { path, cost: gScore[idx] };
    }

    const curG = gScore[idx];

    for (const [dx, dy, moveCost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;

      if (!cellOk(nx, ny)) continue;

      // Block diagonal movement through corners
      if (dx !== 0 && dy !== 0) {
        if (!cellOk(cx + dx, cy) || !cellOk(cx, cy + dy)) continue;
      }

      const ni = ny * W + nx;
      const tentativeG = curG + moveCost + (opts.cellCost?.(nx, ny) ?? 0);

      if (tentativeG < gScore[ni]) {
        gScore[ni] = tentativeG;
        cameFromX[ni] = cx;
        cameFromY[ni] = cy;
        open.push(tentativeG + octile(nx, ny, goal.x, goal.y), ni);
      }
    }
  }

  return null;
}
