// src/mazeGen.ts
//
// Basic BSP dungeon generator (RogueBasin-inspired):
// - Split space into a BSP tree
// - Create one room per leaf
// - Connect sibling subtrees bottom-up with straight or Z corridors
//
// Outputs (browser-friendly):
// - ASCII debug string
// - ImageData debug previews (grayscale layers)
// - THREE.DataTextures (single-channel R8 masks)
//
// Masks / textures included:
// - solid         : 0=floor, 255=wall
// - regionId      : 0=not room, 1..255=room id (corridors remain 0 by default)
// - distanceToWall: Manhattan distance to nearest wall (0 at walls), capped to 255

import * as THREE from "three";
import {
  applyLeverRevealsHiddenPocketPattern,
  applyPlateOpensDoorPattern,
  runPatternsBestEffort,
  applyLeverOpensDoorPattern,
  applyGateThenOptionalRewardPattern,
} from "./puzzlePatterns";
import type {
  PatternDiagnostics,
  PatternEntry,
  PuzzleRole,
} from "./puzzlePatterns";

import { findDoorSiteCandidatesAndStatsFromCorridors } from "./doorSites";

// -----------------------------
// Types
// -----------------------------

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

function writeCircuitRole(
  circuitRoles: Record<number, PuzzleRole> | undefined,
  circuitId: number,
  role: PuzzleRole,
) {
  if (!circuitRoles) return;

  // Best-effort: don’t overwrite an existing role silently.
  // If you want “last writer wins”, replace this with direct assignment.
  if (circuitRoles[circuitId] && circuitRoles[circuitId] !== role) return;

  circuitRoles[circuitId] = role;
}

export type BspDungeonOptions = {
  width: number;
  height: number;

  // Determinism
  seed?: number | string;

  // BSP splitting
  maxDepth?: number; // default 6
  minLeafSize?: number; // default 12
  maxLeafSize?: number; // default 28
  splitPadding?: number; // default 2 (prevents splits too close to edges)

  // Room generation
  roomPadding?: number; // default 1 (padding inside leaf)
  minRoomSize?: number; // default 5
  maxRoomSize?: number; // default 14
  roomFillLeafChance?: number; // default 0.08 (occasionally make room fill most of leaf)

  // Corridors
  corridorWidth?: number; // default 1
  corridorStyle?: "straight-or-z"; // only style supported for now

  // Borders
  keepOuterWalls?: boolean; // default true (do not carve outermost border)
};

export type BspDungeonOutputs = {
  width: number;
  height: number;

  // Core data
  masks: {
    solid: Uint8Array; // length = width*height ; 0=floor, 255=wall
    regionId: Uint8Array; // 0=not room, 1..255=room id
    distanceToWall: Uint8Array; // 0 at walls, increasing into walkable cells, capped at 255
  };

  // THREE textures
  textures: {
    solid: THREE.DataTexture;
    regionId: THREE.DataTexture;
    distanceToWall: THREE.DataTexture;
  };

  // Debug
  debug: {
    ascii: string;
    imageData: {
      solid: ImageData; // white=wall black=floor
      regionId: ImageData; // grayscale (value=room id)
      distanceToWall: ImageData; // grayscale (value=distance)
    };
  };

  // Optional metadata for debugging / future expansions
  meta: {
    seedUsed: number;
    rooms: Rect[];
    corridors: Array<{ a: Point; b: Point; bends?: Point[] }>;
    bspDepth: number;
  };
};

// -----------------------------
// RNG (seeded)
// -----------------------------

function hashSeedToUint32(seed: number | string | undefined): number {
  if (seed === undefined) return 0x12345678;
  if (typeof seed === "number") return seed >>> 0 || 0x12345678;

  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type RNG = {
  next(): number; // [0,1)
  int(minIncl: number, maxIncl: number): number;
  chance(p: number): boolean;
};

function makeRng(seedU32: number): RNG {
  const r = mulberry32(seedU32);
  return {
    next: () => r(),
    int: (minIncl, maxIncl) => {
      const lo = Math.min(minIncl, maxIncl);
      const hi = Math.max(minIncl, maxIncl);
      return lo + Math.floor(r() * (hi - lo + 1));
    },
    chance: (p) => r() < p,
  };
}

// -----------------------------
// Grid helpers
// -----------------------------
function idx(x: number, y: number, w: number) {
  return y * w + x;
}

function carveRect(
  solid: Uint8Array,
  W: number,
  H: number,
  r: Rect,
  keepOuterWalls: boolean,
) {
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w - 1;
  const y1 = r.y + r.h - 1;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y, W, H)) continue;
      if (keepOuterWalls) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
      }
      solid[idx(x, y, W)] = 0; // floor
    }
  }
}

function carvePoint(
  solid: Uint8Array,
  W: number,
  H: number,
  p: Point,
  keepOuterWalls: boolean,
) {
  if (!inBounds(p.x, p.y, W, H)) return;
  if (keepOuterWalls) {
    if (p.x === 0 || p.y === 0 || p.x === W - 1 || p.y === H - 1) return;
  }
  solid[idx(p.x, p.y, W)] = 0;
}

function carveCorridor(
  solid: Uint8Array,
  W: number,
  H: number,
  a: Point,
  b: Point,
  corridorWidth: number,
  keepOuterWalls: boolean,
) {
  // Thickened Manhattan segment between points a and b.
  const w = Math.max(1, corridorWidth);

  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);

  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  let x = a.x;
  let y = a.y;

  for (let i = 0; i <= steps; i++) {
    const half = Math.floor(w / 2);
    for (let oy = -half; oy <= half; oy++) {
      for (let ox = -half; ox <= half; ox++) {
        carvePoint(solid, W, H, { x: x + ox, y: y + oy }, keepOuterWalls);
      }
    }
    x += dx;
    y += dy;
  }
}

// -----------------------------
// BSP tree
// -----------------------------

type BspNode = {
  rect: Rect;
  depth: number;
  left?: BspNode;
  right?: BspNode;

  room?: Rect; // set for leaf nodes
  rep?: Point; // representative point for connections (set bottom-up)
  roomId?: number; // 1..255 for leaf room
};

function rectCenter(r: Rect): Point {
  return {
    x: r.x + Math.floor(r.w / 2),
    y: r.y + Math.floor(r.h / 2),
  };
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function buildBsp(
  rect: Rect,
  depth: number,
  opts: Required<
    Pick<
      BspDungeonOptions,
      "maxDepth" | "minLeafSize" | "maxLeafSize" | "splitPadding"
    >
  >,
  rng: RNG,
): { node: BspNode; maxDepthReached: number } {
  const node: BspNode = { rect, depth };

  const canSplitBySize = rect.w > opts.maxLeafSize || rect.h > opts.maxLeafSize;
  const shouldSplitByDepth = depth < opts.maxDepth;

  if (!shouldSplitByDepth && !canSplitBySize) {
    return { node, maxDepthReached: depth };
  }

  const aspect = rect.w / rect.h;
  let splitVertical: boolean;
  if (aspect > 1.25) splitVertical = true;
  else if (aspect < 0.8) splitVertical = false;
  else splitVertical = rng.chance(0.5);

  if (splitVertical) {
    const minSplitX = rect.x + opts.splitPadding + opts.minLeafSize;
    const maxSplitX = rect.x + rect.w - opts.splitPadding - opts.minLeafSize;
    if (minSplitX > maxSplitX) return { node, maxDepthReached: depth };

    const splitX = rng.int(minSplitX, maxSplitX);
    const leftRect: Rect = {
      x: rect.x,
      y: rect.y,
      w: splitX - rect.x,
      h: rect.h,
    };
    const rightRect: Rect = {
      x: splitX,
      y: rect.y,
      w: rect.x + rect.w - splitX,
      h: rect.h,
    };

    const L = buildBsp(leftRect, depth + 1, opts, rng);
    const R = buildBsp(rightRect, depth + 1, opts, rng);
    node.left = L.node;
    node.right = R.node;
    return {
      node,
      maxDepthReached: Math.max(L.maxDepthReached, R.maxDepthReached),
    };
  } else {
    const minSplitY = rect.y + opts.splitPadding + opts.minLeafSize;
    const maxSplitY = rect.y + rect.h - opts.splitPadding - opts.minLeafSize;
    if (minSplitY > maxSplitY) return { node, maxDepthReached: depth };

    const splitY = rng.int(minSplitY, maxSplitY);
    const topRect: Rect = {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: splitY - rect.y,
    };
    const bottomRect: Rect = {
      x: rect.x,
      y: splitY,
      w: rect.w,
      h: rect.y + rect.h - splitY,
    };

    const L = buildBsp(topRect, depth + 1, opts, rng);
    const R = buildBsp(bottomRect, depth + 1, opts, rng);
    node.left = L.node;
    node.right = R.node;
    return {
      node,
      maxDepthReached: Math.max(L.maxDepthReached, R.maxDepthReached),
    };
  }
}

function forEachLeaf(node: BspNode, fn: (leaf: BspNode) => void) {
  if (!node.left && !node.right) {
    fn(node);
    return;
  }
  if (node.left) forEachLeaf(node.left, fn);
  if (node.right) forEachLeaf(node.right, fn);
}

function pickRandomPointInRect(r: Rect, rng: RNG): Point {
  return {
    x: rng.int(r.x, r.x + r.w - 1),
    y: rng.int(r.y, r.y + r.h - 1),
  };
}

// -----------------------------
// Rooms + regionId labeling
// -----------------------------

function writeRegionRect(
  regionId: Uint8Array,
  W: number,
  H: number,
  r: Rect,
  idVal: number,
) {
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w - 1;
  const y1 = r.y + r.h - 1;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y, W, H)) continue;
      regionId[idx(x, y, W)] = idVal;
    }
  }
}

function createRooms(
  root: BspNode,
  solid: Uint8Array,
  regionId: Uint8Array,
  W: number,
  H: number,
  opts: Required<
    Pick<
      BspDungeonOptions,
      | "roomPadding"
      | "minRoomSize"
      | "maxRoomSize"
      | "roomFillLeafChance"
      | "keepOuterWalls"
    >
  >,
  rng: RNG,
): Rect[] {
  const rooms: Rect[] = [];

  let nextRoomId = 1; // 1..255 (wrap if huge counts)
  forEachLeaf(root, (leaf) => {
    const leafRect = leaf.rect;
    const pad = Math.max(0, opts.roomPadding);

    const availW = Math.max(1, leafRect.w - pad * 2);
    const availH = Math.max(1, leafRect.h - pad * 2);

    let rw: number;
    let rh: number;

    if (rng.chance(opts.roomFillLeafChance)) {
      rw = clampInt(availW, 1, availW);
      rh = clampInt(availH, 1, availH);
      rw = clampInt(rw, Math.min(opts.minRoomSize, availW), availW);
      rh = clampInt(rh, Math.min(opts.minRoomSize, availH), availH);
    } else {
      rw = rng.int(opts.minRoomSize, opts.maxRoomSize);
      rh = rng.int(opts.minRoomSize, opts.maxRoomSize);
      rw = clampInt(rw, 1, availW);
      rh = clampInt(rh, 1, availH);
    }

    rw = clampInt(rw, 1, availW);
    rh = clampInt(rh, 1, availH);

    const minX = leafRect.x + pad;
    const minY = leafRect.y + pad;
    const maxX = leafRect.x + leafRect.w - pad - rw;
    const maxY = leafRect.y + leafRect.h - pad - rh;

    const rx = rng.int(minX, Math.max(minX, maxX));
    const ry = rng.int(minY, Math.max(minY, maxY));

    const room: Rect = { x: rx, y: ry, w: rw, h: rh };
    leaf.room = room;

    // Assign a room id (wrap at 255 to keep it in Uint8 range)
    const rid = nextRoomId;
    leaf.roomId = rid;
    nextRoomId++;
    if (nextRoomId > 255) nextRoomId = 1;

    // Representative point (used for corridor connections)
    leaf.rep = pickRandomPointInRect(room, rng);

    // Carve room in solid
    carveRect(solid, W, H, room, opts.keepOuterWalls);

    // Label regionId for room cells (corridors remain 0)
    writeRegionRect(regionId, W, H, room, rid);

    rooms.push(room);
  });

  return rooms;
}

// -----------------------------
// Corridors (connect siblings bottom-up)
// -----------------------------

function connectSiblings(
  node: BspNode,
  solid: Uint8Array,
  W: number,
  H: number,
  opts: Required<Pick<BspDungeonOptions, "corridorWidth" | "keepOuterWalls">>,
  rng: RNG,
  corridorsOut: Array<{ a: Point; b: Point; bends?: Point[] }>,
): Point {
  if (!node.left && !node.right) {
    if (!node.rep)
      node.rep = node.room ? rectCenter(node.room) : rectCenter(node.rect);
    return node.rep;
  }

  const left = node.left!;
  const right = node.right!;
  const repL = connectSiblings(left, solid, W, H, opts, rng, corridorsOut);
  const repR = connectSiblings(right, solid, W, H, opts, rng, corridorsOut);

  const a = repL;
  const b = repR;

  const bends: Point[] = [];

  if (a.x === b.x || a.y === b.y) {
    carveCorridor(solid, W, H, a, b, opts.corridorWidth, opts.keepOuterWalls);
  } else {
    const horizFirst = rng.chance(0.5);
    if (horizFirst) {
      const mid: Point = { x: b.x, y: a.y };
      bends.push(mid);
      carveCorridor(
        solid,
        W,
        H,
        a,
        mid,
        opts.corridorWidth,
        opts.keepOuterWalls,
      );
      carveCorridor(
        solid,
        W,
        H,
        mid,
        b,
        opts.corridorWidth,
        opts.keepOuterWalls,
      );
    } else {
      const mid: Point = { x: a.x, y: b.y };
      bends.push(mid);
      carveCorridor(
        solid,
        W,
        H,
        a,
        mid,
        opts.corridorWidth,
        opts.keepOuterWalls,
      );
      carveCorridor(
        solid,
        W,
        H,
        mid,
        b,
        opts.corridorWidth,
        opts.keepOuterWalls,
      );
    }
  }

  corridorsOut.push({ a, b, bends: bends.length ? bends : undefined });

  node.rep = rng.chance(0.5) ? a : b;
  return node.rep;
}

// -----------------------------
// Distance-to-wall (Manhattan) via multi-source BFS
// -----------------------------

function computeDistanceToWall(
  solid: Uint8Array,
  W: number,
  H: number,
): Uint8Array {
  // We compute Manhattan distance to nearest wall for every cell.
  // Walls start at distance 0 and flood outward.
  //
  // This results in:
  // - wall cells: 0
  // - floor cells: >= 1 (unless entire map is floor)
  //
  // We cap results to 255 for Uint8 storage.
  const dist = new Uint16Array(W * H);
  const INF = 0xffff;
  dist.fill(INF);

  // Queue for BFS (store indices)
  const q = new Int32Array(W * H);
  let qh = 0;
  let qt = 0;

  // Initialize with all walls as sources distance 0
  for (let i = 0; i < W * H; i++) {
    if (solid[i] === 255) {
      dist[i] = 0;
      q[qt++] = i;
    }
  }

  // If somehow no walls exist, return all 255 (max distance) for floors
  if (qt === 0) {
    const out = new Uint8Array(W * H);
    out.fill(255);
    return out;
  }

  const neighbors = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  while (qh < qt) {
    const i = q[qh++];
    const x = i % W;
    const y = (i / W) | 0;

    const base = dist[i];
    const next = base + 1;

    for (const n of neighbors) {
      const nx = x + n.dx;
      const ny = y + n.dy;
      if (!inBounds(nx, ny, W, H)) continue;
      const ni = idx(nx, ny, W);
      if (next < dist[ni]) {
        dist[ni] = next;
        q[qt++] = ni;
      }
    }
  }

  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = dist[i];
    // Cap and clamp
    out[i] = d === INF ? 255 : d > 255 ? 255 : d;
  }
  return out;
}

// -----------------------------
// Distance-to-wall recompute (Option A)
// -----------------------------

/**
 * Recompute dungeon.masks.distanceToWall after any mutation to dungeon.masks.solid.
 *
 * Option A policy:
 * - Some puzzle patterns may carve geometry by mutating dungeon.masks.solid.
 * - When that happens, distanceToWall becomes stale and must be recomputed.
 *
 * This function updates:
 * - dungeon.masks.distanceToWall
 * - dungeon.textures.distanceToWall
 * - dungeon.debug.imageData.distanceToWall
 */
export function recomputeDungeonDistanceToWall(dungeon: BspDungeonOutputs) {
  const W = dungeon.width;
  const H = dungeon.height;

  const nextDist = computeDistanceToWall(dungeon.masks.solid, W, H);

  // Update mask
  dungeon.masks.distanceToWall = nextDist;

  // Update texture + debug image
  dungeon.textures.distanceToWall = maskToDataTextureR8(
    nextDist,
    W,
    H,
    "bsp_dungeon_distance_to_wall",
  );

  dungeon.debug.imageData.distanceToWall = maskToImageDataGrayscale(
    nextDist,
    W,
    H,
  );
}

// -----------------------------
// Debug outputs
// -----------------------------

export function solidMaskToAscii(
  solid: Uint8Array,
  W: number,
  H: number,
  chars: { wall?: string; floor?: string } = {},
): string {
  const wall = chars.wall ?? "#";
  const floor = chars.floor ?? ".";
  let out = "";
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const v = solid[idx(x, y, W)];
      row += v === 255 ? wall : floor;
    }
    out += row + (y === H - 1 ? "" : "\n");
  }
  return out;
}

export function maskToImageDataGrayscale(
  mask: Uint8Array,
  W: number,
  H: number,
): ImageData {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = mask[i];
    const o = i * 4;
    rgba[o + 0] = v;
    rgba[o + 1] = v;
    rgba[o + 2] = v;
    rgba[o + 3] = 255;
  }
  return new ImageData(rgba, W, H);
}

// White = wall (255), Black = floor (0)
export function solidMaskToImageData(
  solid: Uint8Array,
  W: number,
  H: number,
): ImageData {
  return maskToImageDataGrayscale(solid, W, H);
}

// Helper: render debug ImageData to a canvas (nearest-neighbor scaling recommended via CSS)
export function drawImageDataToCanvas(
  canvas: HTMLCanvasElement,
  imageData: ImageData,
) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(imageData, 0, 0);
}

// Helper: get a PNG data URL from ImageData (in-browser "PNG view")
export function imageDataToPngDataUrl(imageData: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

// -----------------------------
// THREE.DataTexture (single-channel)
// -----------------------------

export function maskToDataTextureR8(
  mask: Uint8Array,
  W: number,
  H: number,
  name: string,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    mask,
    W,
    H,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );

  tex.name = name;
  tex.needsUpdate = true;

  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;

  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  // Data textures should not be treated as color
  tex.colorSpace = THREE.NoColorSpace;

  tex.flipY = false;
  return tex;
}

export function solidMaskToDataTexture(
  solid: Uint8Array,
  W: number,
  H: number,
): THREE.DataTexture {
  return maskToDataTextureR8(solid, W, H, "bsp_dungeon_solid_mask");
}

// -----------------------------
// Public generator
// -----------------------------

/**
 * Generates a BSP-based dungeon using a RogueBasin-style algorithm.
 *
 * The dungeon is created by:
 * 1. Recursively splitting the map into a BSP tree.
 * 2. Placing one rectangular room inside each leaf node.
 * 3. Connecting sibling subtrees bottom-up with straight or Z-shaped corridors.
 *
 * Outputs:
 * - `masks.solid` (0=floor, 255=wall)
 * - `masks.regionId` (0=not room/corridor, 1..255=room id for room cells)
 * - `masks.distanceToWall` (0 at walls, increasing into walkable space, capped at 255)
 *
 * Each mask is also provided as a single-channel `THREE.DataTexture` (RedFormat, UnsignedByteType)
 * with nearest-neighbor sampling and no mipmaps.
 */
export function generateBspDungeon(
  options: BspDungeonOptions,
): BspDungeonOutputs {
  const opts: Required<BspDungeonOptions> = {
    width: options.width,
    height: options.height,
    seed: options.seed ?? 0x12345678,

    maxDepth: options.maxDepth ?? 6,
    minLeafSize: options.minLeafSize ?? 12,
    maxLeafSize: options.maxLeafSize ?? 28,
    splitPadding: options.splitPadding ?? 2,

    roomPadding: options.roomPadding ?? 1,
    minRoomSize: options.minRoomSize ?? 5,
    maxRoomSize: options.maxRoomSize ?? 14,
    roomFillLeafChance: options.roomFillLeafChance ?? 0.08,

    corridorWidth: options.corridorWidth ?? 1,
    corridorStyle: options.corridorStyle ?? "straight-or-z",

    keepOuterWalls: options.keepOuterWalls ?? true,
  };

  if (opts.width <= 2 || opts.height <= 2) {
    throw new Error("generateBspDungeon: width/height must be > 2");
  }
  if (opts.minLeafSize < 4) {
    throw new Error(
      "generateBspDungeon: minLeafSize too small (recommend >= 4)",
    );
  }

  const seedUsed = hashSeedToUint32(opts.seed);
  const rng = makeRng(seedUsed);

  const W = opts.width;
  const H = opts.height;

  // Masks
  const solid = new Uint8Array(W * H);
  solid.fill(255); // start as all walls

  const regionId = new Uint8Array(W * H);
  regionId.fill(0);

  // Build BSP
  const rootRect: Rect = { x: 0, y: 0, w: W, h: H };
  const { node: root, maxDepthReached } = buildBsp(
    rootRect,
    0,
    {
      maxDepth: opts.maxDepth,
      minLeafSize: opts.minLeafSize,
      maxLeafSize: opts.maxLeafSize,
      splitPadding: opts.splitPadding,
    },
    rng,
  );

  // Rooms + region labeling
  const rooms = createRooms(
    root,
    solid,
    regionId,
    W,
    H,
    {
      roomPadding: opts.roomPadding,
      minRoomSize: opts.minRoomSize,
      maxRoomSize: opts.maxRoomSize,
      roomFillLeafChance: opts.roomFillLeafChance,
      keepOuterWalls: opts.keepOuterWalls,
    },
    rng,
  );

  // Corridors
  const corridors: Array<{ a: Point; b: Point; bends?: Point[] }> = [];
  connectSiblings(
    root,
    solid,
    W,
    H,
    { corridorWidth: opts.corridorWidth, keepOuterWalls: opts.keepOuterWalls },
    rng,
    corridors,
  );

  // Distance field
  const distanceToWall = computeDistanceToWall(solid, W, H);

  // Debug outputs
  const ascii = solidMaskToAscii(solid, W, H);
  const solidImageData = solidMaskToImageData(solid, W, H);
  const regionImageData = maskToImageDataGrayscale(regionId, W, H);
  const distanceImageData = maskToImageDataGrayscale(distanceToWall, W, H);

  // Textures
  const solidTex = solidMaskToDataTexture(solid, W, H);
  const regionTex = maskToDataTextureR8(
    regionId,
    W,
    H,
    "bsp_dungeon_region_id",
  );
  const distTex = maskToDataTextureR8(
    distanceToWall,
    W,
    H,
    "bsp_dungeon_distance_to_wall",
  );

  return {
    width: W,
    height: H,
    masks: { solid, regionId, distanceToWall },
    textures: { solid: solidTex, regionId: regionTex, distanceToWall: distTex },
    debug: {
      ascii,
      imageData: {
        solid: solidImageData,
        regionId: regionImageData,
        distanceToWall: distanceImageData,
      },
    },
    meta: {
      seedUsed,
      rooms,
      corridors,
      bspDepth: maxDepthReached,
    },
  };
}

// Convenience wrapper matching your earlier naming
export function generateBspDungeonTexture(options: BspDungeonOptions) {
  return generateBspDungeon(options);
}

// -----------------------------
// Content generation (Milestone 2)
// -----------------------------

export type FeatureType =
  | 0 // none
  | 1 // monster spawn
  | 2 // chest
  | 3 // secret door (wall tile)
  | 4 // door (floor tile)
  | 5 // key (floor tile)
  | 6 // lever (floor tile)
  // Milestone 3 (stateful puzzles)
  | 7 // pressure plate (floor tile)
  | 8 // pushable block (floor tile; entity)
  | 9 // hidden passage (wall tile; illusion/breakable)
  | 10; // hazard (floor tile; hard-block for now)

export type DoorKind =
  | 0 // unused
  | 1 // locked door (requires key)
  | 2; // lever door (requires lever toggle)

export type HazardType =
  | 0 // none
  | 1 // lava
  | 2 // poison gas
  | 3 // water
  | 4; // spikes (etc; extend later)

export type CircuitLogicType = "OR" | "AND" | "THRESHOLD";
export type CircuitBehaviorMode = "MOMENTARY" | "TOGGLE" | "PERSISTENT";

export type CircuitTriggerKind =
  | "LEVER"
  | "KEY"
  | "PLATE"
  | "COMBAT_CLEAR"
  | "INTERACT"
  | "SIGNAL";

export type CircuitSignalName = "ACTIVE" | "SATISFIED" | "SATISFIED_RISE";

export type CircuitTargetKind = "DOOR" | "HAZARD" | "HIDDEN";

export type CircuitSignalRef = {
  /**
   * Which upstream circuit output to read.
   * - ACTIVE: upstream circuit's evaluated active state (post-behavior)
   * - SATISFIED: upstream circuit's raw satisfiable (pre-behavior) result
   * - SATISFIED_RISE: rising edge of SATISFIED (pulse)
   */
  name?: CircuitSignalName; // default "ACTIVE"
};

export type CircuitTargetEffect =
  | "OPEN"
  | "CLOSE"
  | "TOGGLE"
  | "REVEAL"
  | "HIDE"
  | "ENABLE"
  | "DISABLE";

// Extend trigger ref (backwards-compatible)
export type CircuitTriggerRef = {
  kind: CircuitTriggerKind;
  refId: number;

  /**
   * Only used when kind === "SIGNAL".
   * If omitted, defaults to { name: "ACTIVE" }.
   */
  signal?: CircuitSignalRef;
};

export type CircuitTargetRef = {
  kind: CircuitTargetKind;
  refId: number; // see note above
  effect: CircuitTargetEffect;
};
export type CircuitOutputDef = {
  name: string; // e.g. "SOLVED"
  mode?: "LEVEL" | "PULSE"; // default "LEVEL"
};

export type CircuitDef = {
  id: number;
  logic: { type: CircuitLogicType; threshold?: number };
  behavior: { mode: CircuitBehaviorMode; invert?: boolean };
  triggers: CircuitTriggerRef[];
  targets: CircuitTargetRef[];
  outputs?: CircuitOutputDef[]; // (optional)
};

export type ContentOptions = {
  seed?: number | string;

  // How to pick the entrance room.
  entranceMode?: "bottom" | "top" | "random";

  // Placement tuning
  minClearanceToWall?: number;
  monstersPerRoomMin?: number;
  monstersPerRoomMax?: number;
  monsterRoomChance?: number;

  chestsTargetCount?: number;
  secretRoomChance?: number;
  maxLootTier?: number;

  // Milestone 2 gating knobs
  lockedDoorCount?: number; // best-effort (default based on path length)
  leverDoorCount?: number; // best-effort (default based on path length)
  gateMinDepth?: number; // avoid placing gates too close to entrance

  // Milestone 3 toggles
  includePuzzleFixture?: boolean;
  includeLeverHiddenPocket?: boolean;
  leverHiddenPocketSize?: number; // odd >= 3 (default 3)
  includeAsciiOverlay?: boolean;

  includeLeverOpensDoor?: boolean;
  leverOpensDoorCount?: number; // “N times”
  includePlateOpensDoor?: boolean;
  plateOpensDoorCount?: number; // “N times”

  // Optional: budget for each pattern’s internal search (passed to pattern options)
  patternMaxAttempts?: number; // default 60

  // -----------------------------
  // Milestone 4 — Phase 3 (composition)
  // -----------------------------
  includePhase3Compositions?: boolean;

  // MAIN_PATH_GATE -> OPTIONAL_REWARD (signal-gated)
  gateThenOptionalRewardCount?: number; // default 0
};

export type ContentOutputs = {
  width: number;
  height: number;

  masks: {
    featureType: Uint8Array;
    featureId: Uint8Array;
    featureParam: Uint8Array;

    danger: Uint8Array;
    lootTier: Uint8Array;

    // Milestone 3 scaffolding
    hazardType: Uint8Array; // meaningful only when featureType == 10
  };

  textures: {
    featureType: THREE.DataTexture;
    featureId: THREE.DataTexture;
    featureParam: THREE.DataTexture;
    danger: THREE.DataTexture;
    lootTier: THREE.DataTexture;

    // Milestone 3 scaffolding
    hazardType: THREE.DataTexture;
  };

  debug: {
    ascii: string;
    imageData: {
      featureType: ImageData;
      featureId: ImageData;
      featureParam: ImageData;
      danger: ImageData;
      lootTier: ImageData;

      // Milestone 3 scaffolding
      hazardType: ImageData;
    };
  };

  meta: {
    seedUsed: number;

    roomGraph: Map<number, Set<number>>;
    entranceRoomId: number;
    farthestRoomId: number;
    roomDistance: Map<number, number>;
    mainPathRoomIds: number[];
    rooms: Rect[];

    // Placement records
    monsters: Array<{
      id: number;
      x: number;
      y: number;
      roomId: number;
      danger: number;
    }>;
    chests: Array<{
      id: number;
      x: number;
      y: number;
      roomId: number;
      tier: number;
    }>;
    secrets: Array<{ id: number; x: number; y: number; roomId: number }>;

    // Milestone 2: circuits
    doors: Array<{
      id: number; // circuit id
      x: number;
      y: number;
      roomA: number;
      roomB: number;
      kind: DoorKind; // 1=locked, 2=lever
      depth: number; // depth of the edge on main path
    }>;
    keys: Array<{ id: number; x: number; y: number; roomId: number }>;
    levers: Array<{ id: number; x: number; y: number; roomId: number }>;

    // Milestone 3 scaffolding (no placement yet)
    plates: Array<{
      id: number; // circuit id for now
      x: number;
      y: number;
      roomId: number;
      // Param decoding (redundant with featureParam, but convenient runtime view)
      mode: "momentary" | "toggle";
      activatedByPlayer: boolean;
      activatedByBlock: boolean;
      /**
       * Explicit mode derived from the two flags:
       * true when (activatedByPlayer && activatedByBlock).
       */
      activatedByBlockOrPlayer: boolean;
      inverted: boolean;
    }>;

    blocks: Array<{
      id: number; // unique entity id (can be simple increment)
      x: number;
      y: number;
      roomId: number;
      weightClass: number; // 0..3
    }>;

    hidden: Array<{
      id: number; // circuit id for now
      x: number;
      y: number;
      roomId: number;
      kind: "illusion" | "breakable" | "crumble";
      revealedInitial: boolean;
      permanent: boolean;
    }>;

    hazards: Array<{
      id: number; // circuit id for now
      x: number;
      y: number;
      roomId: number;
      hazardType: HazardType;
      activeInitial: boolean;
    }>;

    circuits: CircuitDef[];

    patternDiagnostics: PatternDiagnostics[];

    circuitRoles?: Record<number, PuzzleRole>;
  };
};

export function clamp255(v: number) {
  return Math.max(0, Math.min(255, v | 0));
}

function pickRandom<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function roomCenter(r: Rect): Point {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
}

function keyXY(W: number, x: number, y: number) {
  return y * W + x;
}

function inBounds(x: number, y: number, W: number, H: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

/**
 * Find the nearest room id around a point.
 * Corridor endpoints often land in a room, but we allow searching outward
 * so we can robustly map corridors to room-room edges.
 */
function findNearestRoomId(
  regionId: Uint8Array,
  W: number,
  H: number,
  p: Point,
  maxRadius = 8,
): number {
  const { x: cx, y: cy } = p;
  if (inBounds(cx, cy, W, H)) {
    const v = regionId[keyXY(W, cx, cy)];
    if (v !== 0) return v;
  }

  for (let r = 1; r <= maxRadius; r++) {
    // scan square ring
    const x0 = cx - r;
    const x1 = cx + r;
    const y0 = cy - r;
    const y1 = cy + r;

    for (let x = x0; x <= x1; x++) {
      for (const y of [y0, y1]) {
        if (!inBounds(x, y, W, H)) continue;
        const v = regionId[keyXY(W, x, y)];
        if (v !== 0) return v;
      }
    }
    for (let y = y0 + 1; y <= y1 - 1; y++) {
      for (const x of [x0, x1]) {
        if (!inBounds(x, y, W, H)) continue;
        const v = regionId[keyXY(W, x, y)];
        if (v !== 0) return v;
      }
    }
  }

  return 0;
}

function findCorridorConnectingRooms(
  dungeon: BspDungeonOutputs,
  roomA: number,
  roomB: number,
): { a: Point; b: Point } | null {
  const { width: W, height: H } = dungeon;
  const regionId = dungeon.masks.regionId;

  for (const c of dungeon.meta.corridors) {
    const ra = findNearestRoomId(regionId, W, H, c.a, 10);
    const rb = findNearestRoomId(regionId, W, H, c.b, 10);
    if ((ra === roomA && rb === roomB) || (ra === roomB && rb === roomA))
      return c;
  }
  return null;
}

// Build candidate points along two L-shaped Manhattan paths.
// We choose the first point that is floor and (preferably) corridor (regionId == 0).
function pickDoorTileOnCorridor(
  dungeon: BspDungeonOutputs,
  corridor: { a: Point; b: Point },
): Point | null {
  const { width: W, height: H } = dungeon;
  const solid = dungeon.masks.solid;
  const regionId = dungeon.masks.regionId;
  const distWall = dungeon.masks.distanceToWall;

  const a = corridor.a;
  const b = corridor.b;

  const corner1: Point = { x: a.x, y: b.y };
  const corner2: Point = { x: b.x, y: a.y };

  function pathPoints(p0: Point, p1: Point, p2: Point): Point[] {
    const pts: Point[] = [];
    // p0 -> p1 (axis-aligned)
    if (p0.x === p1.x) {
      const sy = p0.y <= p1.y ? 1 : -1;
      for (let y = p0.y; y !== p1.y + sy; y += sy) pts.push({ x: p0.x, y });
    } else {
      const sx = p0.x <= p1.x ? 1 : -1;
      for (let x = p0.x; x !== p1.x + sx; x += sx) pts.push({ x, y: p0.y });
    }
    // p1 -> p2
    if (p1.x === p2.x) {
      const sy = p1.y <= p2.y ? 1 : -1;
      for (let y = p1.y; y !== p2.y + sy; y += sy) pts.push({ x: p2.x, y });
    } else {
      const sx = p1.x <= p2.x ? 1 : -1;
      for (let x = p1.x; x !== p2.x + sx; x += sx) pts.push({ x, y: p2.y });
    }
    return pts;
  }

  const candidates = [pathPoints(a, corner1, b), pathPoints(a, corner2, b)];

  function isGoodFloor(p: Point) {
    if (!inBounds(p.x, p.y, W, H)) return false;
    const i = p.y * W + p.x;
    if (solid[i] !== 0) return false; // must be floor
    if (distWall[i] < 1) return false; // avoid hugging walls
    return true;
  }

  // Prefer corridor floor tiles (regionId == 0), fall back to any floor.
  for (const pts of candidates) {
    for (const p of pts) {
      if (!isGoodFloor(p)) continue;
      const i = p.y * W + p.x;
      if (regionId[i] === 0) return p;
    }
  }
  for (const pts of candidates) {
    for (const p of pts) {
      if (!isGoodFloor(p)) continue;
      return p;
    }
  }

  return null;
}

function buildRoomGraphFromCorridors(
  dungeon: BspDungeonOutputs,
): Map<number, Set<number>> {
  const { width: W, height: H } = dungeon;
  const regionId = dungeon.masks.regionId;

  const graph = new Map<number, Set<number>>();

  // Ensure all rooms appear as nodes
  for (let i = 0; i < dungeon.meta.rooms.length; i++) {
    const id = i + 1;
    graph.set(id, new Set<number>());
  }

  for (const c of dungeon.meta.corridors) {
    const ra = findNearestRoomId(regionId, W, H, c.a, 10);
    const rb = findNearestRoomId(regionId, W, H, c.b, 10);
    if (ra === 0 || rb === 0) continue;
    if (ra === rb) continue;

    if (!graph.has(ra)) graph.set(ra, new Set());
    if (!graph.has(rb)) graph.set(rb, new Set());

    graph.get(ra)!.add(rb);
    graph.get(rb)!.add(ra);
  }

  return graph;
}

function bfsRoomDistances(
  graph: Map<number, Set<number>>,
  startRoomId: number,
): { dist: Map<number, number>; parent: Map<number, number> } {
  const dist = new Map<number, number>();
  const parent = new Map<number, number>();
  const q: number[] = [];

  dist.set(startRoomId, 0);
  q.push(startRoomId);

  while (q.length) {
    const cur = q.shift()!;
    const dcur = dist.get(cur)!;

    for (const nb of graph.get(cur) ?? []) {
      if (dist.has(nb)) continue;
      dist.set(nb, dcur + 1);
      parent.set(nb, cur);
      q.push(nb);
    }
  }

  return { dist, parent };
}

function reconstructPath(
  parent: Map<number, number>,
  start: number,
  end: number,
): number[] {
  if (start === end) return [start];
  const path: number[] = [];
  let cur = end;

  // If unreachable, return just end
  const seen = new Set<number>();
  while (cur !== start) {
    path.push(cur);
    seen.add(cur);
    const p = parent.get(cur);
    if (p === undefined || seen.has(p)) {
      path.push(start);
      path.reverse();
      return path;
    }
    cur = p;
  }
  path.push(start);
  path.reverse();
  return path;
}

function pickEntranceRoomId(
  dungeon: BspDungeonOutputs,
  rng: () => number,
  mode: ContentOptions["entranceMode"],
): number {
  const rooms = dungeon.meta.rooms;
  if (rooms.length === 0) return 1;

  if (mode === "random") {
    return 1 + Math.floor(rng() * rooms.length);
  }

  let bestIdx = 0;
  let bestY =
    mode === "top" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

  for (let i = 0; i < rooms.length; i++) {
    const c = roomCenter(rooms[i]);
    if (mode === "top") {
      if (c.y < bestY) {
        bestY = c.y;
        bestIdx = i;
      }
    } else {
      // bottom
      if (c.y > bestY) {
        bestY = c.y;
        bestIdx = i;
      }
    }
  }
  return bestIdx + 1;
}

/**
 * Sample a walkable (floor) point inside a room rectangle with clearance to walls.
 * Returns null if no suitable tile found within tries.
 */
function sampleRoomFloorPoint(
  dungeon: BspDungeonOutputs,
  room: Rect,
  rng: () => number,
  minClearance: number,
  tries = 80,
): Point | null {
  const { width: W, height: H } = dungeon;
  const solid = dungeon.masks.solid;
  const distWall = dungeon.masks.distanceToWall;

  const xMin = room.x;
  const xMax = room.x + room.w - 1;
  const yMin = room.y;
  const yMax = room.y + room.h - 1;

  for (let t = 0; t < tries; t++) {
    const x = xMin + Math.floor(rng() * Math.max(1, xMax - xMin + 1));
    const y = yMin + Math.floor(rng() * Math.max(1, yMax - yMin + 1));
    if (!inBounds(x, y, W, H)) continue;

    const i = keyXY(W, x, y);
    if (solid[i] !== 0) continue; // must be floor
    if (distWall[i] < minClearance) continue;

    return { x, y };
  }

  return null;
}

/**
 * Pick a wall tile adjacent to a room’s floor (good for secret doors).
 * Returns the wall tile position (not the floor tile).
 */
function findSecretDoorWallTile(
  dungeon: BspDungeonOutputs,
  room: Rect,
  rng: () => number,
  tries = 200,
): Point | null {
  const { width: W, height: H } = dungeon;
  const solid = dungeon.masks.solid;

  // gather candidate wall tiles adjacent to floor within the room bounds
  const candidates: Point[] = [];

  const xMin = room.x;
  const xMax = room.x + room.w - 1;
  const yMin = room.y;
  const yMax = room.y + room.h - 1;

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (!inBounds(x, y, W, H)) continue;
      const i = keyXY(W, x, y);
      if (solid[i] !== 0) continue; // floor only

      const nbs = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];
      for (const nb of nbs) {
        if (!inBounds(nb.x, nb.y, W, H)) continue;
        const j = keyXY(W, nb.x, nb.y);
        if (solid[j] === 255) {
          // avoid putting secrets on the outermost border (usually ugly / trivial)
          if (nb.x === 0 || nb.y === 0 || nb.x === W - 1 || nb.y === H - 1)
            continue;
          candidates.push({ x: nb.x, y: nb.y });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // try random picks (bias away from corners by repeated sampling)
  for (let t = 0; t < tries; t++) {
    const p = candidates[Math.floor(rng() * candidates.length)];
    return p;
  }

  return null;
}

function overlayAscii(
  baseAscii: string,
  W: number,
  H: number,
  overlay: Array<{ x: number; y: number; ch: string }>,
): string {
  const lines = baseAscii.split("\n");
  const grid: string[][] = [];
  for (let y = 0; y < H; y++) {
    grid.push((lines[y] ?? "").padEnd(W, " ").slice(0, W).split(""));
  }

  for (const o of overlay) {
    if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) continue;
    grid[o.y][o.x] = o.ch;
  }

  return grid.map((row) => row.join("")).join("\n");
}

export function generateDungeonContent(
  dungeon: BspDungeonOutputs,
  opts?: Partial<ContentOptions>,
): ContentOutputs {
  const options: Required<ContentOptions> = {
    seed: opts?.seed ?? dungeon.meta.seedUsed + 1337,
    entranceMode: opts?.entranceMode ?? "bottom",

    minClearanceToWall: opts?.minClearanceToWall ?? 2,
    monstersPerRoomMin: opts?.monstersPerRoomMin ?? 1,
    monstersPerRoomMax: opts?.monstersPerRoomMax ?? 3,
    monsterRoomChance: opts?.monsterRoomChance ?? 0.75,

    chestsTargetCount:
      opts?.chestsTargetCount ??
      Math.max(1, Math.floor(dungeon.meta.rooms.length / 4)),
    secretRoomChance: opts?.secretRoomChance ?? 0.45,

    maxLootTier: opts?.maxLootTier ?? 5,

    // Milestone 2 gating knobs (derived defaults computed later, after mainPathRoomIds exists)
    lockedDoorCount: opts?.lockedDoorCount ?? 0,
    leverDoorCount: opts?.leverDoorCount ?? 0,
    gateMinDepth: opts?.gateMinDepth ?? 2,

    // Milestone 3
    includePuzzleFixture: opts?.includePuzzleFixture ?? true,
    includeAsciiOverlay: opts?.includeAsciiOverlay ?? true,
    includeLeverHiddenPocket: opts?.includeLeverHiddenPocket ?? false,
    leverHiddenPocketSize: opts?.leverHiddenPocketSize ?? 3,

    includeLeverOpensDoor: opts?.includeLeverOpensDoor ?? false,
    leverOpensDoorCount: opts?.leverOpensDoorCount ?? 1,

    includePlateOpensDoor: opts?.includePlateOpensDoor ?? false,
    plateOpensDoorCount: opts?.plateOpensDoorCount ?? 1,

    patternMaxAttempts: opts?.patternMaxAttempts ?? 60,

    // -----------------------------
    // Milestone 4 — Phase 3 (composition)
    // -----------------------------
    includePhase3Compositions: opts?.includePhase3Compositions ?? false,
    gateThenOptionalRewardCount: opts?.gateThenOptionalRewardCount ?? 0,
  };

  const seedUsed = hashSeedToUint32(options.seed);
  const rng = mulberry32(seedUsed);

  const W = dungeon.width;
  const H = dungeon.height;
  const N = W * H;

  // Build room graph and BFS distances
  const roomGraph = buildRoomGraphFromCorridors(dungeon);
  const entranceRoomId = pickEntranceRoomId(dungeon, rng, options.entranceMode);

  const { dist: roomDistance, parent } = bfsRoomDistances(
    roomGraph,
    entranceRoomId,
  );

  // Find farthest reachable room
  let farthestRoomId = entranceRoomId;
  let farthestDist = 0;
  for (const [rid, d] of roomDistance.entries()) {
    if (d > farthestDist) {
      farthestDist = d;
      farthestRoomId = rid;
    }
  }
  const mainPathRoomIds = reconstructPath(
    parent,
    entranceRoomId,
    farthestRoomId,
  );

  // Allocate masks
  const featureType = new Uint8Array(N);
  const featureId = new Uint8Array(N);
  const featureParam = new Uint8Array(N);
  const danger = new Uint8Array(N);
  const lootTier = new Uint8Array(N);
  const hazardType = new Uint8Array(N); // Milestone 3 (scaffold)

  // Placement results
  const monsters: ContentOutputs["meta"]["monsters"] = [];
  const chests: ContentOutputs["meta"]["chests"] = [];
  const secrets: ContentOutputs["meta"]["secrets"] = [];
  const doors: ContentOutputs["meta"]["doors"] = [];
  const keys: ContentOutputs["meta"]["keys"] = [];
  const levers: ContentOutputs["meta"]["levers"] = [];
  // Milestone 3 scaffolding (no placement yet)
  const plates: ContentOutputs["meta"]["plates"] = [];
  const blocks: ContentOutputs["meta"]["blocks"] = [];
  const hidden: ContentOutputs["meta"]["hidden"] = [];
  const hazards: ContentOutputs["meta"]["hazards"] = [];

  let nextId = 1;

  const rooms = dungeon.meta.rooms;

  // Helper for depth normalization
  const maxDepth = Math.max(1, farthestDist);

  function depthForRoom(roomId: number) {
    return roomDistance.get(roomId) ?? 0;
  }

  function dangerForDepth(d: number) {
    // 32..255 range feels better than 0..255
    const t = d / maxDepth;
    return clamp255(32 + t * 223);
  }

  function tierForDepth(d: number) {
    const t = d / maxDepth;
    return Math.max(
      1,
      Math.min(
        options.maxLootTier,
        1 + Math.floor(t * (options.maxLootTier - 1)),
      ),
    );
  }

  // Identify side rooms (degree 1) excluding entrance (best-effort)
  const roomDegree = new Map<number, number>();
  for (const [rid, nbs] of roomGraph.entries()) roomDegree.set(rid, nbs.size);

  const sideRoomIds = Array.from(roomGraph.keys()).filter((rid) => {
    if (rid === entranceRoomId) return false;
    const deg = roomDegree.get(rid) ?? 0;
    return deg <= 1;
  });

  // -----------------------------
  // Monsters
  // -----------------------------
  for (let i = 0; i < rooms.length; i++) {
    const roomId = i + 1;
    if (roomId === entranceRoomId) continue;

    // unreachable rooms: skip
    if (!roomDistance.has(roomId)) continue;

    if (rng() > options.monsterRoomChance) continue;

    const d = depthForRoom(roomId);
    const room = rooms[i];

    const count =
      options.monstersPerRoomMin +
      Math.floor(
        rng() * (options.monstersPerRoomMax - options.monstersPerRoomMin + 1),
      );

    for (let k = 0; k < count; k++) {
      const p = sampleRoomFloorPoint(
        dungeon,
        room,
        rng,
        options.minClearanceToWall,
      );
      if (!p) continue;

      const idx = keyXY(W, p.x, p.y);
      if (featureType[idx] !== 0) continue; // don't overlap with something else

      const id = clamp255(nextId++);
      const dng = dangerForDepth(d);

      featureType[idx] = 1;
      featureId[idx] = id;
      danger[idx] = dng;

      monsters.push({ id, x: p.x, y: p.y, roomId, danger: dng });
    }
  }

  // -----------------------------
  // Chests (biased to side rooms & depth)
  // -----------------------------
  const chestCandidates =
    sideRoomIds.length > 0 ? sideRoomIds.slice() : mainPathRoomIds.slice(1);

  // Sort candidates by depth descending so deeper rooms tend to get chests
  chestCandidates.sort((a, b) => depthForRoom(b) - depthForRoom(a));

  let chestPlaced = 0;
  for (const roomId of chestCandidates) {
    if (chestPlaced >= options.chestsTargetCount) break;

    const room = rooms[roomId - 1];
    if (!room) continue;

    const p = sampleRoomFloorPoint(
      dungeon,
      room,
      rng,
      Math.max(1, options.minClearanceToWall),
    );
    if (!p) continue;

    const idx = keyXY(W, p.x, p.y);
    if (featureType[idx] !== 0) continue;

    const id = clamp255(nextId++);
    const d = depthForRoom(roomId);
    const tier = clamp255(tierForDepth(d));

    featureType[idx] = 2;
    featureId[idx] = id;
    lootTier[idx] = tier;

    chests.push({ id, x: p.x, y: p.y, roomId, tier });
    chestPlaced++;
  }

  // -----------------------------
  // Secrets (secret doors placed on wall tiles adjacent to leaf rooms)
  // -----------------------------
  for (const roomId of sideRoomIds) {
    if (rng() > options.secretRoomChance) continue;

    const room = rooms[roomId - 1];
    if (!room) continue;

    const wallP = findSecretDoorWallTile(dungeon, room, rng);
    if (!wallP) continue;

    const idx = keyXY(W, wallP.x, wallP.y);
    if (featureType[idx] !== 0) continue;

    const id = clamp255(nextId++);

    featureType[idx] = 3;
    featureId[idx] = id;

    secrets.push({ id, x: wallP.x, y: wallP.y, roomId });
  }

  // -----------------------------
  // Milestone 2: Doors + Keys + Levers (circuits)
  // -----------------------------

  // ------------------------------------------------------------
  // Door-site budgeting for optional patterns
  // ------------------------------------------------------------
  // Some optional patterns (Lever→Door, Plate→Door) place *new doors* on
  // corridor tiles that separate two rooms (a “door site”).
  //
  // Milestone 2 gate doors also consume these corridor door sites. If we place
  // too many gates, patterns can fail simply because there are no remaining
  // viable corridor door sites.
  //
  // Policy:
  // - Count available corridor door sites after room/chest/monster/secret placement.
  // - Reserve enough sites for enabled patterns (counts).
  // - Clamp Milestone 2 desiredLocked/desiredLever so we don’t exceed the budget.
  function countCorridorDoorSites(
    dungeon: BspDungeonOutputs,
    featureType: Uint8Array,
  ): number {
    const W = dungeon.width;
    const { candidates } = findDoorSiteCandidatesAndStatsFromCorridors(
      dungeon,
      featureType,
      {
        maxRadius: 10,
        minDistToWall: 1,
        preferCorridor: true,
        trimEnds: 2,
        duplicateBias: 1,
      },
    );
    const seen = new Set<number>();
    for (const c of candidates) {
      seen.add(keyXY(W, c.x, c.y));
    }
    return seen.size;
  }

  const gateMinDepth = options.gateMinDepth;

  // mainPathRoomIds MUST already be computed above this point.
  const mainPathLen = mainPathRoomIds.length;

  let desiredLocked =
    opts?.lockedDoorCount !== undefined
      ? opts.lockedDoorCount
      : Math.max(1, Math.floor(mainPathLen / 5));

  let desiredLever =
    opts?.leverDoorCount !== undefined
      ? opts.leverDoorCount
      : Math.max(0, Math.floor(mainPathLen / 7));
  // We place gates on edges along the main path: (room[i] -> room[i+1]).
  // Avoid edges too close to entrance, and avoid reusing the same edge twice.
  type PathEdge = { a: number; b: number; depth: number };
  const pathEdges: PathEdge[] = [];
  for (let i = 0; i < mainPathRoomIds.length - 1; i++) {
    const a = mainPathRoomIds[i];
    const b = mainPathRoomIds[i + 1];
    const depth = Math.max(depthForRoom(a), depthForRoom(b));
    pathEdges.push({ a, b, depth });
  }

  const eligibleEdges = pathEdges.filter((e) => e.depth >= gateMinDepth);
  // Shuffle edges
  for (let i = eligibleEdges.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligibleEdges[i], eligibleEdges[j]] = [eligibleEdges[j], eligibleEdges[i]];
  }

  // Budget Milestone 2 gates so optional patterns still have corridor door sites.
  const reservedForPatterns =
    (options.includePlateOpensDoor ? options.plateOpensDoorCount | 0 : 0) +
    (options.includeLeverOpensDoor ? options.leverOpensDoorCount | 0 : 0);

  if (reservedForPatterns > 0) {
    const totalDoorSites = countCorridorDoorSites(dungeon, featureType);
    const maxGatesByEdges = eligibleEdges.length;
    const maxGatesBySites = Math.max(0, totalDoorSites - reservedForPatterns);
    const maxGateDoors = Math.min(maxGatesByEdges, maxGatesBySites);

    // Clamp requested gate counts to the budget (prefer keeping locked doors over lever doors).
    if (desiredLocked > maxGateDoors) {
      desiredLocked = maxGateDoors;
      desiredLever = 0;
    } else {
      desiredLever = Math.min(desiredLever, maxGateDoors - desiredLocked);
    }
  }

  const desiredLockedClamped = Math.max(0, desiredLocked | 0);
  const desiredLeverClamped = Math.max(0, desiredLever | 0);

  function pickKeyOrLeverRoom(maxDepthAllowed: number): number | null {
    // Prefer side rooms, but any reachable room <= depth works (backtracking allowed)
    const candidates = Array.from(roomGraph.keys()).filter((rid) => {
      if (rid === entranceRoomId) return false;
      const d = depthForRoom(rid);
      if (d > maxDepthAllowed) return false;
      return roomDistance.has(rid);
    });

    const sideFirst = candidates.filter(
      (rid) => (roomDegree.get(rid) ?? 0) <= 1,
    );
    const pool = sideFirst.length > 0 ? sideFirst : candidates;
    if (pool.length === 0) return null;
    return pickRandom(rng, pool);
  }

  function placeKeyInRoom(roomId: number, circuitId: number) {
    const room = rooms[roomId - 1];
    if (!room) return;

    const p = sampleRoomFloorPoint(
      dungeon,
      room,
      rng,
      Math.max(1, options.minClearanceToWall),
    );
    if (!p) return;

    const idx = keyXY(W, p.x, p.y);
    if (featureType[idx] !== 0) return;

    featureType[idx] = 5; // key
    featureId[idx] = clamp255(circuitId);

    keys.push({ id: circuitId, x: p.x, y: p.y, roomId });
  }

  function placeLeverInRoom(roomId: number, circuitId: number) {
    const room = rooms[roomId - 1];
    if (!room) return;

    const p = sampleRoomFloorPoint(
      dungeon,
      room,
      rng,
      Math.max(1, options.minClearanceToWall),
    );
    if (!p) return;

    const idx = keyXY(W, p.x, p.y);
    if (featureType[idx] !== 0) return;

    featureType[idx] = 6; // lever
    featureId[idx] = clamp255(circuitId);

    levers.push({ id: circuitId, x: p.x, y: p.y, roomId });
  }

  function placeDoorOnEdge(edge: PathEdge, kind: DoorKind): boolean {
    const corr = findCorridorConnectingRooms(dungeon, edge.a, edge.b);
    if (!corr) return false;

    const doorP = pickDoorTileOnCorridor(dungeon, corr);
    if (!doorP) return false;

    const idx = keyXY(W, doorP.x, doorP.y);
    if (featureType[idx] !== 0) return false;

    const circuitId = clamp255(nextId++);

    featureType[idx] = 4; // door
    featureId[idx] = circuitId;
    featureParam[idx] = kind; // 1 locked, 2 lever

    doors.push({
      id: circuitId,
      x: doorP.x,
      y: doorP.y,
      roomA: edge.a,
      roomB: edge.b,
      kind,
      depth: edge.depth,
    });

    // Place corresponding key/lever in an allowed room <= door depth
    const keyRoom = pickKeyOrLeverRoom(edge.depth);
    if (keyRoom == null) return true; // still keep door; worst-case it's "future content"

    if (kind === 1) placeKeyInRoom(keyRoom, circuitId);
    if (kind === 2) placeLeverInRoom(keyRoom, circuitId);

    return true;
  }

  // Place locked doors
  let placedLocked = 0;
  for (const e of eligibleEdges) {
    if (placedLocked >= desiredLockedClamped) break;
    if (placeDoorOnEdge(e, 1)) placedLocked++;
  }

  // Place lever doors
  let placedLever = 0;
  for (let i = placedLocked; i < eligibleEdges.length; i++) {
    if (placedLever >= desiredLeverClamped) break;
    if (placeDoorOnEdge(eligibleEdges[i], 2)) placedLever++;
  }

  // -----------------------------
  // Milestone 3: Simple plate + block + door fixture
  //
  // NOTE: Plates are “derived” at runtime from block occupancy (see dungeonState.ts/App.tsx).
  // This just ensures there’s something to interact with right away.
  // -----------------------------

  // Small bitfield for featureParam on plates (debug / future use)
  // bit0: modeToggle (1=toggle, 0=momentary)
  // bit1: activatedByPlayer
  // bit2: activatedByBlock
  // bit3: inverted
  function encodePlateParam(o: {
    mode: "momentary" | "toggle";
    activatedByPlayer: boolean;
    activatedByBlock: boolean;
    inverted: boolean;
  }): number {
    let p = 0;
    if (o.mode === "toggle") p |= 1 << 0;
    if (o.activatedByPlayer) p |= 1 << 1;
    if (o.activatedByBlock) p |= 1 << 2;
    if (o.inverted) p |= 1 << 3;
    return p & 0xff;
  }

  let fixtureDoorId = 0;
  let fixturePlateCircuitId = 0;
  let fixtureHiddenId = 0;
  let fixtureHazardId = 0;
  let fixtureHazardLeverId = 0;

  if (options.includePuzzleFixture && rooms.length > 0) {
    // (A) Place an “extra” door ...
    // (B) Place a pressure plate + adjacent push block ...

    // (C) Place a hidden passage tile in the farthest room (featureType 9) and register it as a "secret".
    // This is revealable via circuits (HIDDEN target kind).
    {
      const hiddenRoomId = farthestRoomId || entranceRoomId;
      const hiddenRoom = rooms[hiddenRoomId - 1] ?? rooms[0];
      const p = sampleRoomFloorPoint(
        dungeon,
        hiddenRoom,
        rng,
        Math.max(1, options.minClearanceToWall),
      );
      if (p) {
        const hi = keyXY(W, p.x, p.y);
        if (featureType[hi] === 0) {
          fixtureHiddenId = clamp255(nextId++);
          featureType[hi] = 9; // hidden passage
          featureId[hi] = fixtureHiddenId;
          featureParam[hi] = 0;

          secrets.push({
            id: fixtureHiddenId,
            x: p.x,
            y: p.y,
            roomId: hiddenRoomId,
          });
        }
      }
    }

    // (D) Place a single hazard tile and a lever to toggle it.
    {
      const hzRoomId = entranceRoomId;
      const hzRoom = rooms[hzRoomId - 1] ?? rooms[0];

      // hazard tile
      const hp = sampleRoomFloorPoint(
        dungeon,
        hzRoom,
        rng,
        Math.max(1, options.minClearanceToWall),
      );
      if (hp) {
        const hi = keyXY(W, hp.x, hp.y);
        if (featureType[hi] === 0) {
          fixtureHazardId = clamp255(nextId++);
          featureType[hi] = 10; // hazard
          featureId[hi] = fixtureHazardId;
          featureParam[hi] = 0;
          hazardType[hi] = 1; // lava (debug-friendly)

          hazards.push({
            id: fixtureHazardId,
            x: hp.x,
            y: hp.y,
            roomId: hzRoomId,
            hazardType: 1,
            activeInitial: false,
          });
        }
      }

      // lever tile (try a different point so it doesn't collide)
      const lp = sampleRoomFloorPoint(
        dungeon,
        hzRoom,
        rng,
        Math.max(1, options.minClearanceToWall),
      );
      if (lp) {
        const li = keyXY(W, lp.x, lp.y);
        if (featureType[li] === 0) {
          fixtureHazardLeverId = clamp255(nextId++);
          featureType[li] = 6; // lever
          featureId[li] = fixtureHazardLeverId;
          featureParam[li] = 0;

          levers.push({
            id: fixtureHazardLeverId,
            x: lp.x,
            y: lp.y,
            roomId: hzRoomId,
          });
        }
      }
    }
  }

  // ------------------------------------
  // Phase 1: Build meta.circuits (from Milestone 2 gates)
  // ------------------------------------
  const circuitsById = new Map<number, CircuitDef>();
  const circuitRoles: Record<number, PuzzleRole> = {};

  function ensureCircuit(id: number): CircuitDef {
    let c = circuitsById.get(id);
    if (!c) {
      c = {
        id,
        logic: { type: "OR" },
        behavior: { mode: "PERSISTENT" },
        triggers: [],
        targets: [],
      };
      circuitsById.set(id, c);
    }
    return c;
  }

  // Locked doors: key -> open door (persistent)
  for (const d of doors) {
    const c = ensureCircuit(d.id);

    if (d.kind === 1) {
      c.behavior = { mode: "PERSISTENT" };
      c.triggers.push({ kind: "KEY", refId: d.id });
      c.targets.push({ kind: "DOOR", refId: d.id, effect: "OPEN" });
    } else if (d.kind === 2) {
      // Lever doors: lever -> toggle door
      c.behavior = { mode: "TOGGLE" };
      c.triggers.push({ kind: "LEVER", refId: d.id });
      c.targets.push({ kind: "DOOR", refId: d.id, effect: "TOGGLE" });
    }
  }

  // If there are keys/levers that exist without a door record (should be rare),
  // ensure we still show them as circuits in the inspector.
  for (const k of keys) {
    const c = ensureCircuit(k.id);
    // best-effort: don’t duplicate if door loop already pushed a KEY trigger
    if (!c.triggers.some((t) => t.kind === "KEY" && t.refId === k.id)) {
      c.triggers.push({ kind: "KEY", refId: k.id });
    }
  }
  for (const l of levers) {
    const c = ensureCircuit(l.id);
    if (!c.triggers.some((t) => t.kind === "LEVER" && t.refId === l.id)) {
      c.triggers.push({ kind: "LEVER", refId: l.id });
    }
  }

  // Milestone 3 fixture circuit: plate toggles the extra door.
  if (fixturePlateCircuitId !== 0 && fixtureDoorId !== 0) {
    const c = ensureCircuit(fixturePlateCircuitId);
    c.logic = { type: "OR" };
    c.behavior = { mode: "TOGGLE" };
    c.triggers = [{ kind: "PLATE", refId: fixturePlateCircuitId }];
    c.targets = [{ kind: "DOOR", refId: fixtureDoorId, effect: "TOGGLE" }];
  }

  // ------------------------------------
  // Milestone 3: Optional puzzle patterns
  // ------------------------------------

  // Adapt our RNG to the PatternRng interface expected by puzzlePatterns.ts
  const patternRng = {
    nextFloat: () => rng(),
    nextInt: (lo: number, hiInclusive: number) => {
      const span = hiInclusive - lo + 1;
      return lo + Math.floor(rng() * Math.max(1, span));
    },
  };

  const patterns: PatternEntry[] = [];

  if (options.includeLeverHiddenPocket) {
    patterns.push({
      name: "leverHiddenPocket",
      run: () =>
        applyLeverRevealsHiddenPocketPattern({
          rng: patternRng,
          dungeon,
          entranceRoomId,
          rooms,
          featureType,
          featureId,
          featureParam,
          secrets,
          levers,
          circuitsById,
          allocId: () => clamp255(nextId++),
          options: {
            pocketSize: options.leverHiddenPocketSize,
            maxAttempts: options.patternMaxAttempts, // NEW
          },
        }),
    });
  }

  if (options.includeLeverOpensDoor) {
    const n = Math.max(0, options.leverOpensDoorCount | 0);
    for (let k = 0; k < n; k++) {
      patterns.push({
        name: "leverOpensDoor",
        run: () =>
          applyLeverOpensDoorPattern({
            rng: patternRng,
            dungeon,
            rooms,
            featureType,
            featureId,
            featureParam,
            doors,
            entranceRoomId,
            levers,
            circuitsById,
            allocId: () => clamp255(nextId++),
            options: { maxAttempts: options.patternMaxAttempts },
          }),
      });
    }
  }

  if (options.includePlateOpensDoor) {
    const n = Math.max(0, options.plateOpensDoorCount | 0);
    for (let k = 0; k < n; k++) {
      patterns.push({
        name: "plateOpensDoor",
        run: () =>
          applyPlateOpensDoorPattern({
            rng: patternRng,
            dungeon,
            rooms,
            featureType,
            featureId,
            featureParam,
            doors,
            plates,
            blocks,
            circuitsById,
            allocId: () => clamp255(nextId++),
            options: { maxAttempts: options.patternMaxAttempts },
          }),
      });
    }
  }

  if (options.includePhase3Compositions) {
    const n = Math.max(0, options.gateThenOptionalRewardCount | 0);
    for (let k = 0; k < n; k++) {
      patterns.push({
        name: "gateThenOptionalReward",
        run: () =>
          applyGateThenOptionalRewardPattern({
            rng: patternRng,
            dungeon,
            rooms,

            // topology context
            entranceRoomId,
            roomGraph,
            roomDistance,
            mainPathRoomIds,

            // masks
            featureType,
            featureId,
            featureParam,
            lootTier,

            // meta
            doors,
            levers,
            plates,
            blocks,
            chests,
            circuitsById,
            circuitRoles: circuitRoles, // IMPORTANT (write roles here)

            allocId: () => clamp255(nextId++),
            options: { maxAttempts: options.patternMaxAttempts },
          }),
      });
    }
  }

  const { didCarve, diagnostics } = runPatternsBestEffort(patterns);

  // Option A: if any patterns carved geometry, distanceToWall is now stale.
  if (didCarve) {
    recomputeDungeonDistanceToWall(dungeon);
  }

  // Milestone 3 fixture circuit: plate reveals the hidden passage tile (featureType 9).
  if (fixturePlateCircuitId !== 0 && fixtureHiddenId !== 0) {
    const c = ensureCircuit(clamp255(fixtureHiddenId));
    c.logic = { type: "OR" };
    c.behavior = { mode: "PERSISTENT" };
    c.triggers = [{ kind: "PLATE", refId: fixturePlateCircuitId }];
    c.targets = [{ kind: "HIDDEN", refId: fixtureHiddenId, effect: "REVEAL" }];
  }

  // Milestone 3 fixture circuit: lever toggles the hazard (consequence-only).
  if (fixtureHazardLeverId !== 0 && fixtureHazardId !== 0) {
    const c = ensureCircuit(clamp255(fixtureHazardLeverId));
    c.logic = { type: "OR" };
    c.behavior = { mode: "TOGGLE" };
    c.triggers = [{ kind: "LEVER", refId: fixtureHazardLeverId }];
    c.targets = [{ kind: "HAZARD", refId: fixtureHazardId, effect: "TOGGLE" }];
  }

  const circuits = Array.from(circuitsById.values()).sort(
    (a, b) => a.id - b.id,
  );

  // Textures + debug ImageData
  const featureTypeTex = maskToDataTextureR8(featureType, W, H, "featureType");
  const featureIdTex = maskToDataTextureR8(featureId, W, H, "featureId");
  const dangerTex = maskToDataTextureR8(danger, W, H, "danger");
  const lootTierTex = maskToDataTextureR8(lootTier, W, H, "lootTier");
  const featureParamTex = maskToDataTextureR8(
    featureParam,
    W,
    H,
    "featureParam",
  );
  const hazardTypeTex = maskToDataTextureR8(hazardType, W, H, "hazardType");

  const featureTypeImg = maskToImageDataGrayscale(featureType, W, H);
  const featureIdImg = maskToImageDataGrayscale(featureId, W, H);
  const dangerImg = maskToImageDataGrayscale(danger, W, H);
  const lootTierImg = maskToImageDataGrayscale(lootTier, W, H);
  const featureParamImg = maskToImageDataGrayscale(featureParam, W, H);
  const hazardTypeImg = maskToImageDataGrayscale(hazardType, W, H);

  // ASCII overlay (optional)
  let ascii = dungeon.debug.ascii;
  if (options.includeAsciiOverlay) {
    const overlay: Array<{ x: number; y: number; ch: string }> = [];
    for (const m of monsters) overlay.push({ x: m.x, y: m.y, ch: "M" });
    for (const c of chests) overlay.push({ x: c.x, y: c.y, ch: "$" });
    for (const s of secrets) overlay.push({ x: s.x, y: s.y, ch: "?" });

    // Mark entrance room center with "E"
    const eRoom = rooms[entranceRoomId - 1];
    if (eRoom) {
      const ec = roomCenter(eRoom);
      overlay.push({ x: ec.x, y: ec.y, ch: "E" });
      for (const d of doors) overlay.push({ x: d.x, y: d.y, ch: "D" });
      for (const k of keys) overlay.push({ x: k.x, y: k.y, ch: "K" });
      for (const l of levers) overlay.push({ x: l.x, y: l.y, ch: "L" });
    }

    ascii = overlayAscii(ascii, W, H, overlay);
  }

  // -----------------------------
  // Validation: hidden passage invariants (featureType 9)
  // -----------------------------
  // featureType 9 is "hidden passage" and MUST be wired to a secretId via featureId.
  // If featureId is 0, it would be treated as normal floor in some places.
  for (let i = 0; i < W * H; i++) {
    if (featureType[i] === 9 && featureId[i] === 0) {
      throw new Error(
        `generateDungeonContent(): featureType 9 (hidden passage) missing featureId at tile index ${i}`,
      );
    }
  }

  const secretIds = new Set(secrets.map((s) => s.id));
  for (let i = 0; i < W * H; i++) {
    if (featureType[i] === 9) {
      const sid = featureId[i];
      if (!secretIds.has(sid)) {
        throw new Error(
          `generateDungeonContent(): hidden passage references secretId=${sid} but meta.secrets has no such id`,
        );
      }
    }
  }

  return {
    width: W,
    height: H,

    masks: {
      featureType,
      featureId,
      featureParam,
      danger,
      lootTier,
      hazardType,
    },

    textures: {
      featureType: featureTypeTex,
      featureId: featureIdTex,
      danger: dangerTex,
      lootTier: lootTierTex,
      featureParam: featureParamTex,
      hazardType: hazardTypeTex,
    },

    debug: {
      ascii,
      imageData: {
        featureType: featureTypeImg,
        featureId: featureIdImg,
        danger: dangerImg,
        lootTier: lootTierImg,
        featureParam: featureParamImg,
        hazardType: hazardTypeImg,
      },
    },

    meta: {
      seedUsed,
      roomGraph,
      entranceRoomId,
      farthestRoomId,
      roomDistance,
      mainPathRoomIds,
      monsters,
      chests,
      secrets,
      doors,
      keys,
      levers,
      plates,
      blocks,
      hidden,
      hazards,
      circuits,
      rooms,
      patternDiagnostics: diagnostics,
      circuitRoles,
    },
  };
}
