// src/cellular.ts
//
// Cellular-automata cave dungeon generator.
// Produces irregular, organic floor regions well-suited for cave/ruin themes.
// Output shares the same DungeonOutputs texture layout as BspDungeonOutputs,
// so it works directly with generateContent, aStar8, computeFov, etc.

import * as THREE from "three";
import type { GridPos } from "./astar";
import type { DungeonOutputs } from "./bsp";

// --------------------------------
// Types
// --------------------------------

export type CellularOptions = {
  width: number;
  height: number;
  seed?: number | string;

  /** Initial wall fill probability. Default: 0.45 */
  fillProbability?: number;
  /** Number of smoothing passes. Default: 5 */
  iterations?: number;
  /**
   * A cell becomes wall if it has >= this many wall neighbours (Moore neighbourhood).
   * Default: 5
   */
  birthThreshold?: number;
  /**
   * A wall cell survives if it has >= this many wall neighbours. Default: 4
   */
  survivalThreshold?: number;

  keepOuterWalls?: boolean;
};

export type CellularDungeonOutputs = DungeonOutputs & {
  /**
   * The largest connected floor region, chosen as the playable area.
   * Cells outside it are re-solidified so the output is always fully connected.
   */
  textures: {
    solid: THREE.DataTexture;
    /** Region flood-fill ID per cell — 0 = wall, 1 = the single remaining region. */
    regionId: THREE.DataTexture;
    distanceToWall: THREE.DataTexture;
    hazards: THREE.DataTexture;
  };
  /** Floor cell closest to the centroid of the largest region — good spawn point. */
  startPos: GridPos;
};

// --------------------------------
// RNG (seeded mulberry32)
// --------------------------------

function hashSeed(seed: number | string | undefined): number {
  if (seed === undefined) return 0x12345678;
  if (typeof seed === "number") return seed >>> 0 || 0x12345678;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seedU32: number) {
  let t = seedU32 >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------------------
// Helpers
// --------------------------------

function idx(x: number, y: number, W: number): number {
  return y * W + x;
}

function countWallNeighbours(solid: Uint8Array, x: number, y: number, W: number, H: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      // Out-of-bounds counts as wall
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || solid[idx(nx, ny, W)] !== 0) {
        count++;
      }
    }
  }
  return count;
}

// BFS flood fill — returns array of all cell indices in the connected floor region.
function floodFill(
  solid: Uint8Array,
  W: number,
  H: number,
  startIdx: number,
  visited: Uint8Array,
): number[] {
  const region: number[] = [];
  const queue: number[] = [startIdx];
  visited[startIdx] = 1;

  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    region.push(i);
    const x = i % W;
    const y = (i / W) | 0;

    // 4-connected flood fill
    const neighbours = [
      x - 1 >= 0     ? idx(x - 1, y, W) : -1,
      x + 1 < W      ? idx(x + 1, y, W) : -1,
      y - 1 >= 0     ? idx(x, y - 1, W) : -1,
      y + 1 < H      ? idx(x, y + 1, W) : -1,
    ];
    for (const ni of neighbours) {
      if (ni !== -1 && !visited[ni] && solid[ni] === 0) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  return region;
}

function computeDistanceToWall(solid: Uint8Array, W: number, H: number): Uint8Array {
  const dist = new Uint16Array(W * H).fill(0xffff);
  const queue = new Int32Array(W * H);
  let qh = 0;
  let qt = 0;

  for (let i = 0; i < W * H; i++) {
    if (solid[i] !== 0) {
      dist[i] = 0;
      queue[qt++] = i;
    }
  }

  const DX = [1, -1, 0, 0];
  const DY = [0, 0, 1, -1];

  while (qh < qt) {
    const i = queue[qh++];
    const x = i % W;
    const y = (i / W) | 0;
    const next = dist[i] + 1;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny, W);
      if (next < dist[ni]) {
        dist[ni] = next;
        queue[qt++] = ni;
      }
    }
  }

  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = dist[i];
    out[i] = d === 0xffff ? 255 : d > 255 ? 255 : d;
  }
  return out;
}

function maskToDataTextureR8(
  mask: Uint8Array,
  W: number,
  H: number,
  name: string,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(mask, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.name = name;
  tex.needsUpdate = true;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  return tex;
}

// --------------------------------
// Public generator
// --------------------------------

/**
 * Generate a cellular-automata cave dungeon.
 * Unlike BSP, there is no explicit room graph; use regionId for flood-fill regions.
 * Pass the output directly to generateContent() as it shares the same texture layout.
 */
export function generateCellularDungeon(options: CellularOptions): CellularDungeonOutputs {
  const W = options.width;
  const H = options.height;

  if (W <= 2 || H <= 2) throw new Error("generateCellularDungeon: width/height must be > 2");

  const fillProbability   = options.fillProbability   ?? 0.45;
  const iterations        = options.iterations        ?? 5;
  const birthThreshold    = options.birthThreshold    ?? 5;
  const survivalThreshold = options.survivalThreshold ?? 4;
  const keepOuterWalls    = options.keepOuterWalls    ?? true;

  const seedU32 = hashSeed(options.seed);
  const rand = makeRng(seedU32);

  // Step 1: initialise with random walls
  let solid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (keepOuterWalls && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) {
        solid[idx(x, y, W)] = 255;
      } else {
        solid[idx(x, y, W)] = rand() < fillProbability ? 255 : 0;
      }
    }
  }

  // Step 2: smooth with cellular automata rules
  const next = new Uint8Array(W * H);
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (keepOuterWalls && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) {
          next[idx(x, y, W)] = 255;
          continue;
        }
        const walls = countWallNeighbours(solid, x, y, W, H);
        const isWall = solid[idx(x, y, W)] !== 0;
        next[idx(x, y, W)] = isWall
          ? (walls >= survivalThreshold ? 255 : 0)
          : (walls >= birthThreshold   ? 255 : 0);
      }
    }
    solid.set(next);
  }

  // Step 3: find all connected floor regions via flood fill
  const visited = new Uint8Array(W * H);
  let largestRegion: number[] = [];

  for (let i = 0; i < W * H; i++) {
    if (solid[i] === 0 && !visited[i]) {
      const region = floodFill(solid, W, H, i, visited);
      if (region.length > largestRegion.length) {
        largestRegion = region;
      }
    }
  }

  // Step 4: re-solidify all cells not in the largest region
  solid.fill(255);
  for (const i of largestRegion) {
    solid[i] = 0;
  }

  // Step 5: build regionId — 1 for all cells in the surviving region, 0 for walls
  const regionId = new Uint8Array(W * H);
  for (const i of largestRegion) {
    regionId[i] = 1;
  }

  // Step 6: find startPos — floor cell closest to the centroid of the largest region
  let cx = 0;
  let cy = 0;
  for (const i of largestRegion) {
    cx += i % W;
    cy += (i / W) | 0;
  }
  cx = Math.round(cx / largestRegion.length);
  cy = Math.round(cy / largestRegion.length);

  // Find the nearest floor cell to centroid (BFS from centroid outward)
  let startPos: GridPos = { x: cx, y: cy };
  if (solid[idx(cx, cy, W)] !== 0) {
    // Centroid is in a wall — scan nearby cells
    let bestDist = Infinity;
    for (const i of largestRegion) {
      const fx = i % W;
      const fy = (i / W) | 0;
      const d = (fx - cx) * (fx - cx) + (fy - cy) * (fy - cy);
      if (d < bestDist) {
        bestDist = d;
        startPos = { x: fx, y: fy };
      }
    }
  }

  // Step 7: compute distanceToWall
  const distanceToWall = computeDistanceToWall(solid, W, H);
  const hazards = new Uint8Array(W * H);

  return {
    width: W,
    height: H,
    seed: seedU32,
    startPos,
    textures: {
      solid:           maskToDataTextureR8(solid,           W, H, "cellular_solid"),
      regionId:        maskToDataTextureR8(regionId,        W, H, "cellular_region_id"),
      distanceToWall:  maskToDataTextureR8(distanceToWall,  W, H, "cellular_distance_to_wall"),
      hazards:         maskToDataTextureR8(hazards,         W, H, "cellular_hazards"),
    },
  };
}
