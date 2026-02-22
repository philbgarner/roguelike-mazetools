// src/pathfinding/aStar8.ts
//
// 8-directional A* pathfinding using octile distance heuristic.
// Integer-scaled costs: orthogonal = 10, diagonal = 14 (≈ 10*sqrt(2)).

import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import { isTileWalkable, type WalkabilityResolvers } from "../walkability";
import { MinHeap } from "./minHeap";

export type GridPos = { x: number; y: number };

export type AStarPath = { path: GridPos[]; cost: number } | null;

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
 * Octile distance heuristic for 8-directional grids.
 * Scaled to match the integer costs above (orthogonal=10, diagonal=14).
 */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  // h = 10*(dx+dy) + (14-20)*min(dx,dy)  = 10*(dx+dy) - 6*min(dx,dy)
  return 10 * (dx + dy) - 6 * Math.min(dx, dy);
}

/**
 * Find the shortest 8-directional path from `start` to `goal`.
 *
 * @param dungeon   BSP dungeon outputs (for walkability checks)
 * @param content   Content outputs (for feature walkability)
 * @param start     Starting grid position
 * @param goal      Target grid position
 * @param resolvers Optional walkability resolvers (door open, secret revealed)
 * @returns         Path from start to goal (inclusive) and total cost, or null if unreachable.
 */
export function aStar8(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  start: GridPos,
  goal: GridPos,
  resolvers: WalkabilityResolvers = {},
): AStarPath {
  const W = dungeon.width;
  const H = dungeon.height;

  // Quick bounds + walkability check on goal
  if (!isTileWalkable(dungeon, content, goal.x, goal.y, resolvers)) return null;
  if (!isTileWalkable(dungeon, content, start.x, start.y, resolvers)) return null;

  // Flat-array maps for gScore and cameFrom
  const gScore = new Int32Array(W * H).fill(2147483647); // MAX_INT
  const cameFromX = new Int16Array(W * H).fill(-1);
  const cameFromY = new Int16Array(W * H).fill(-1);

  const startIdx = start.y * W + start.x;
  gScore[startIdx] = 0;

  const open = new MinHeap<number>(); // stores flat cell index
  open.push(octile(start.x, start.y, goal.x, goal.y), startIdx);

  while (open.size > 0) {
    const idx = open.pop()!;
    const cx = idx % W;
    const cy = (idx / W) | 0;

    if (cx === goal.x && cy === goal.y) {
      // Reconstruct path
      const path: GridPos[] = [];
      let ni = idx;
      while (ni !== startIdx || path.length === 0) {
        path.push({ x: ni % W, y: (ni / W) | 0 });
        const px = cameFromX[ni];
        const py = cameFromY[ni];
        if (px === -1) break;
        ni = py * W + px;
      }
      // Add start if not already there
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

      if (!isTileWalkable(dungeon, content, nx, ny, resolvers)) continue;

      // For diagonals: block if both orthogonal neighbors are walls (corner cutting)
      if (dx !== 0 && dy !== 0) {
        if (
          !isTileWalkable(dungeon, content, cx + dx, cy, resolvers) ||
          !isTileWalkable(dungeon, content, cx, cy + dy, resolvers)
        ) {
          continue;
        }
      }

      const ni = ny * W + nx;
      const tentativeG = curG + moveCost;

      if (tentativeG < gScore[ni]) {
        gScore[ni] = tentativeG;
        cameFromX[ni] = cx;
        cameFromY[ni] = cy;
        const h = octile(nx, ny, goal.x, goal.y);
        open.push(tentativeG + h, ni);
      }
    }
  }

  return null; // no path found
}
