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
import { buildSeedBank, type BatchRunInput } from "./batchStats";
import {
  applyLeverRevealsHiddenPocketPattern,
  applyPlateOpensDoorPattern,
  runPatternsBestEffort,
  applyLeverOpensDoorPattern,
  applyGateThenOptionalRewardPattern,
  applyIntroGatePattern,
} from "./puzzlePatterns";
import type {
  PatternDiagnostics,
  PatternEntry,
  PuzzleRole,
} from "./puzzlePatterns";

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
// Forest / outdoor generator
// -----------------------------

export type ForestOptions = {
  width: number;
  height: number;
  seed?: number | string;

  /** Fraction of cells initialized as trees before CA smoothing (default 0.55) */
  initialFillRatio?: number;
  /** Number of cellular-automata smoothing passes (default 5) */
  smoothingPasses?: number;
  /**
   * A floor cell becomes a tree when it has ≥ this many tree neighbours (default 5).
   * Lower values → denser forest.
   */
  birthLimit?: number;
  /**
   * A tree cell survives when it has ≥ this many tree neighbours (default 4).
   * Lower values → more isolated trees erode away.
   */
  survivalLimit?: number;
  /** Minimum floor-cell count for a connected open area to be kept as a clearing (default 25) */
  minClearingSize?: number;
  /** Width in cells of the trails that connect clearings (default 1) */
  trailWidth?: number;
  /** Keep the outermost cell border as trees (default true) */
  keepOuterWalls?: boolean;
};

/**
 * Per-cell ASCII for forest maps:
 *   solid=255  → char 5 (♣) — tree canopy
 *   solid=0, distanceToWall ≤ 2  → ',' — undergrowth / shrubs near tree edge
 *   solid=0, distanceToWall > 2  → '.' — open grass / clearing floor
 */
function forestMaskToAscii(
  solid: Uint8Array,
  distanceToWall: Uint8Array,
  W: number,
  H: number,
): string {
  const TREE = "\x05"; // ASCII char 5
  let out = "";
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const i = idx(x, y, W);
      if (solid[i] === 255) {
        row += TREE;
      } else {
        row += distanceToWall[i] <= 2 ? "," : ".";
      }
    }
    out += row + (y === H - 1 ? "" : "\n");
  }
  return out;
}

/**
 * Colored ImageData for forest maps using green/brown palette:
 *   trees       → dark forest-green with slight position-based hue variation
 *   undergrowth → muted olive-green (distanceToWall ≤ 2)
 *   open ground → warm light-green to bright meadow (deeper → brighter)
 */
function forestMaskToImageData(
  solid: Uint8Array,
  distanceToWall: Uint8Array,
  W: number,
  H: number,
): ImageData {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    if (solid[i] === 255) {
      // Trees: dark forest-green/brown. Use a cheap positional hash for variety.
      const h = ((i * 2654435761) >>> 0) & 0xff; // Knuth multiplicative hash
      const vary = h % 28; // 0..27
      rgba[o + 0] = 28 + vary; // R 28-55  (earthy-green)
      rgba[o + 1] = 58 + vary; // G 58-85  (dark green)
      rgba[o + 2] = 10 + (vary >> 2); // B 10-16 (very low, slight blue-green)
    } else {
      // Open ground: darker near trees, lighter in clearings
      const d = Math.min(distanceToWall[i], 20);
      const t = d / 20; // 0 (edge) … 1 (deep clearing)
      rgba[o + 0] = Math.round(65 + t * 35); // R 65-100  (warm grass)
      rgba[o + 1] = Math.round(105 + t * 50); // G 105-155 (green)
      rgba[o + 2] = Math.round(28 + t * 22); // B 28-50   (hint of blue)
    }
    rgba[o + 3] = 255;
  }
  return new ImageData(rgba, W, H);
}

/**
 * Generates an outdoor forest map using cellular-automata smoothing to produce
 * organic clearings connected by winding trails.  Returns a `BspDungeonOutputs`
 * so it can be used anywhere a dungeon is expected:
 *   solid       0 = open ground, 255 = tree canopy
 *   regionId    0 = trail/edge, 1..255 = clearing id
 *   distanceToWall  distance to nearest tree (0 at tree boundary)
 */
export function generateForest(options: ForestOptions): BspDungeonOutputs {
  const opts = {
    width: options.width,
    height: options.height,
    seed: options.seed ?? 0x12345678,
    initialFillRatio: options.initialFillRatio ?? 0.55,
    smoothingPasses: options.smoothingPasses ?? 5,
    birthLimit: options.birthLimit ?? 5,
    survivalLimit: options.survivalLimit ?? 4,
    minClearingSize: options.minClearingSize ?? 25,
    trailWidth: options.trailWidth ?? 1,
    keepOuterWalls: options.keepOuterWalls ?? true,
  };

  if (opts.width <= 2 || opts.height <= 2) {
    throw new Error("generateForest: width/height must be > 2");
  }

  const seedUsed = hashSeedToUint32(opts.seed);
  const rng = makeRng(seedUsed);
  const W = opts.width;
  const H = opts.height;

  // ---- Step 1: random initialisation ----
  const solid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const border =
        opts.keepOuterWalls &&
        (x === 0 || y === 0 || x === W - 1 || y === H - 1);
      solid[idx(x, y, W)] =
        border || rng.chance(opts.initialFillRatio) ? 255 : 0;
    }
  }

  // ---- Step 2: CA smoothing ----
  const buf = new Uint8Array(W * H);
  const DIRS_8: Array<[number, number]> = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (let pass = 0; pass < opts.smoothingPasses; pass++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const border =
          opts.keepOuterWalls &&
          (x === 0 || y === 0 || x === W - 1 || y === H - 1);
        if (border) {
          buf[idx(x, y, W)] = 255;
          continue;
        }
        let trees = 0;
        for (const [dx, dy] of DIRS_8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
            trees++; // out-of-bounds counts as tree
          } else if (solid[idx(nx, ny, W)] === 255) {
            trees++;
          }
        }
        const wasTree = solid[idx(x, y, W)] === 255;
        buf[idx(x, y, W)] = wasTree
          ? trees >= opts.survivalLimit
            ? 255
            : 0
          : trees >= opts.birthLimit
            ? 255
            : 0;
      }
    }
    solid.set(buf);
  }

  // ---- Step 3: flood-fill to label clearings ----
  const regionId = new Uint8Array(W * H);
  let nextRegion = 1;

  const clearingCenters: Array<{ x: number; y: number }> = [];
  const rooms: Rect[] = [];

  for (let sy = 0; sy < H && nextRegion <= 255; sy++) {
    for (let sx = 0; sx < W && nextRegion <= 255; sx++) {
      if (solid[idx(sx, sy, W)] !== 0) continue;
      if (regionId[idx(sx, sy, W)] !== 0) continue;

      const region = nextRegion++;
      const queue: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
      regionId[idx(sx, sy, W)] = region;

      let minX = sx,
        maxX = sx,
        minY = sy,
        maxY = sy;
      let sumX = 0,
        sumY = 0,
        count = 0;

      for (let qi = 0; qi < queue.length; qi++) {
        const { x, y } = queue[qi];
        sumX += x;
        sumY += y;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as Array<[number, number]>) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (solid[idx(nx, ny, W)] !== 0) continue;
          if (regionId[idx(nx, ny, W)] !== 0) continue;
          regionId[idx(nx, ny, W)] = region;
          queue.push({ x: nx, y: ny });
        }
      }

      // Discard clearings that are too small — fill them back with trees
      if (count < opts.minClearingSize) {
        for (const p of queue) {
          solid[idx(p.x, p.y, W)] = 255;
          regionId[idx(p.x, p.y, W)] = 0;
        }
        nextRegion--;
      } else {
        clearingCenters.push({
          x: Math.round(sumX / count),
          y: Math.round(sumY / count),
        });
        rooms.push({
          x: minX,
          y: minY,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
        });
      }
    }
  }

  // ---- Step 4: connect clearings with winding trails (nearest-neighbour MST) ----
  const corridors: Array<{ a: Point; b: Point; bends?: Point[] }> = [];

  if (clearingCenters.length > 1) {
    const connected = new Set<number>([0]);
    const unconnected = new Set<number>(
      Array.from({ length: clearingCenters.length }, (_, i) => i).filter(
        (i) => i !== 0,
      ),
    );

    while (unconnected.size > 0) {
      let bestDist = Infinity,
        bestFrom = -1,
        bestTo = -1;
      for (const ci of connected) {
        const c = clearingCenters[ci];
        for (const ui of unconnected) {
          const u = clearingCenters[ui];
          const d = Math.abs(c.x - u.x) + Math.abs(c.y - u.y);
          if (d < bestDist) {
            bestDist = d;
            bestFrom = ci;
            bestTo = ui;
          }
        }
      }
      if (bestFrom === -1) break;

      const a = clearingCenters[bestFrom];
      const b = clearingCenters[bestTo];

      // L-shaped bend — randomise which leg comes first
      const bend: Point = rng.chance(0.5)
        ? { x: a.x, y: b.y }
        : { x: b.x, y: a.y };

      carveCorridor(
        solid,
        W,
        H,
        { x: a.x, y: a.y },
        bend,
        opts.trailWidth,
        opts.keepOuterWalls,
      );
      carveCorridor(
        solid,
        W,
        H,
        bend,
        { x: b.x, y: b.y },
        opts.trailWidth,
        opts.keepOuterWalls,
      );
      corridors.push({
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y },
        bends: [bend],
      });

      connected.add(bestTo);
      unconnected.delete(bestTo);
    }
  }

  // ---- Step 5: distance field, debug outputs, textures ----
  const distanceToWall = computeDistanceToWall(solid, W, H);

  const ascii = forestMaskToAscii(solid, distanceToWall, W, H);
  const solidImageData = forestMaskToImageData(solid, distanceToWall, W, H);
  const regionImageData = maskToImageDataGrayscale(regionId, W, H);
  const distanceImageData = maskToImageDataGrayscale(distanceToWall, W, H);

  const solidTex = solidMaskToDataTexture(solid, W, H);
  const regionTex = maskToDataTextureR8(regionId, W, H, "forest_region_id");
  const distTex = maskToDataTextureR8(
    distanceToWall,
    W,
    H,
    "forest_distance_to_wall",
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
      bspDepth: opts.smoothingPasses, // repurposed: number of CA passes
    },
  };
}

// -----------------------------
// Forest content (overworld portals)
// -----------------------------

export type DungeonTheme = "cave" | "ruins" | "crypt" | "temple" | "lair";

export type DungeonPortal = {
  id: number;
  x: number;
  y: number;
  /** Clearing id (1-based, matches forest.meta.rooms index + 1) */
  roomId: number;
  /** 1 = closest to spawn (easiest) … N = farthest (hardest) */
  level: number;
  /** Deterministic seed derived from the forest seed + level */
  seed: number;
  theme: DungeonTheme;
  /** 0-255 normalised difficulty, matches the danger mask value */
  difficulty: number;
};

export type ForestContentOptions = {
  seed?: number | string;
  /** How many dungeon portals to place (default 10, capped to available clearings) */
  portalCount?: number;
  /** Which end of the map the player starts on (default "bottom") */
  playerSpawnMode?: "bottom" | "top";
  /**
   * Options for the seed-bank batch that vets dungeon seeds before assigning
   * them to portals. Seeds that fail pattern/validation checks are discarded;
   * only "good" seeds reach portals so every dungeon the player can enter is
   * guaranteed to be viable.
   */
  dungeonBatchOptions?: {
    /** Width of candidate dungeons (default 64) */
    width?: number;
    /** Height of candidate dungeons (default 64) */
    height?: number;
    /** Extra BSP options forwarded to generateBspDungeon (seed/width/height excluded) */
    bspOptions?: Partial<Omit<BspDungeonOptions, "seed" | "width" | "height">>;
    /** Extra content options forwarded to generateDungeonContent (seed excluded) */
    contentOptions?: Partial<Omit<ContentOptions, "seed">>;
    /**
     * Candidate multiplier: we generate portalCount × batchMultiplier seeds and
     * keep only the good ones (default 4, min 2).
     */
    batchMultiplier?: number;
  };
};

export type ForestContentOutputs = {
  width: number;
  height: number;

  masks: {
    /** 1 = player spawn marker, 2 = dungeon portal */
    featureType: Uint8Array;
    /** 0 = none, 1..N = portal id */
    featureId: Uint8Array;
    /** 0-255 difficulty at each portal cell */
    danger: Uint8Array;
  };

  textures: {
    featureType: THREE.DataTexture;
    featureId: THREE.DataTexture;
    danger: THREE.DataTexture;
  };

  debug: {
    /** Forest ASCII with @ = player spawn, 1-9/0 = dungeon portals by level */
    ascii: string;
    imageData: {
      featureType: ImageData;
      featureId: ImageData;
      danger: ImageData;
    };
  };

  meta: {
    seedUsed: number;
    playerSpawn: Point;
    playerSpawnRoomId: number;
    dungeonPortals: DungeonPortal[];
    roomGraph: Map<number, Set<number>>;
    roomDistance: Map<number, number>;
    rooms: Rect[];
  };
};

const DUNGEON_THEMES: DungeonTheme[] = [
  "cave", // level 1-2
  "ruins", // level 3-4
  "crypt", // level 5-6
  "temple", // level 7-8
  "lair", // level 9-10
];

function themeForLevel(level: number): DungeonTheme {
  const i = Math.min(DUNGEON_THEMES.length - 1, Math.floor((level - 1) / 2));
  return DUNGEON_THEMES[i];
}

/**
 * Generates overworld content for a forest map produced by `generateForest`.
 *
 * Places:
 *  - A player spawn marker in the clearing closest to the chosen map edge.
 *  - Up to `portalCount` dungeon entrance portals spread across the remaining
 *    clearings, ordered by BFS distance from the spawn so that nearer portals
 *    have lower difficulty (level 1) and farther ones have higher difficulty
 *    (up to level 10).
 *
 * Each portal carries a deterministic `seed`, `theme`, and `level` so the
 * dungeon-screen generator knows exactly which dungeon to load.
 */
export function generateForestContent(
  forest: BspDungeonOutputs,
  opts?: ForestContentOptions,
): ForestContentOutputs {
  const seed = opts?.seed ?? 0;
  const portalCount = Math.max(1, opts?.portalCount ?? 10);
  const spawnMode = opts?.playerSpawnMode ?? "bottom";

  const seedUsed = hashSeedToUint32(seed);
  const rng = mulberry32(seedUsed);

  // ---- Pre-generate a batch of validated dungeon seeds ----
  // We use a separate RNG (different twist of seedUsed) so the main rng
  // sequence used for room/point sampling below is completely unaffected.
  const batchCfg = opts?.dungeonBatchOptions;
  const dungeonW = batchCfg?.width ?? 64;
  const dungeonH = batchCfg?.height ?? 64;
  const batchMultiplier = Math.max(2, batchCfg?.batchMultiplier ?? 4);
  const candidateCount = Math.max(portalCount * batchMultiplier, 16);

  const seedBatchRng = mulberry32((seedUsed ^ 0xf3a4b5c6) >>> 0);
  const batchRuns: BatchRunInput[] = [];
  for (let ci = 0; ci < candidateCount; ci++) {
    const candidateSeed = (seedBatchRng() * 0x100000000) >>> 0;
    const candidateDungeon = generateBspDungeon({
      width: dungeonW,
      height: dungeonH,
      seed: candidateSeed,
      ...batchCfg?.bspOptions,
    });
    const candidateContent = generateDungeonContent(candidateDungeon, {
      ...batchCfg?.contentOptions,
      seed: candidateSeed,
    });
    batchRuns.push({
      seed: String(candidateSeed),
      seedUsed: candidateDungeon.meta.seedUsed,
      rooms: candidateDungeon.meta.rooms.length,
      corridors: candidateDungeon.meta.corridors.length,
      patternDiagnostics: candidateContent.meta.patternDiagnostics ?? [],
      circuitMetrics: null,
    });
  }

  const seedBank = buildSeedBank(batchRuns);
  // goodSeeds is ordered by generation sequence — portal i gets goodSeeds[i].
  const goodSeeds = seedBank.seeds
    .filter((s) => s.tags.includes("good"))
    .map((s) => s.seedUsed);
  console.log("good seeds", goodSeeds);
  const W = forest.width;
  const H = forest.height;
  const N = W * H;

  const rooms = forest.meta.rooms;

  // ---- Step 1: build clearing connectivity graph ----
  const roomGraph = buildRoomGraphFromCorridors(forest);

  // ---- Step 2: pick player spawn — clearing whose center is at the extreme Y ----
  let spawnRoomId = 1;
  let bestY = spawnMode === "bottom" ? -Infinity : Infinity;

  for (let i = 0; i < rooms.length; i++) {
    const rid = i + 1;
    if (!roomGraph.has(rid)) continue;
    const c = roomCenter(rooms[i]);
    const isBetter = spawnMode === "bottom" ? c.y > bestY : c.y < bestY;
    if (isBetter) {
      bestY = c.y;
      spawnRoomId = rid;
    }
  }

  // ---- Step 3: BFS distances from spawn clearing ----
  const { dist: roomDistance } = bfsRoomDistances(roomGraph, spawnRoomId);

  const distValues = Array.from(roomDistance.values());
  const maxDist = distValues.length > 0 ? Math.max(1, ...distValues) : 1;

  // ---- Step 4: select up to portalCount clearings, spread evenly across bands ----
  const candidates = Array.from(roomDistance.entries())
    .filter(([rid]) => rid !== spawnRoomId)
    .sort(([, da], [, db]) => da - db);

  const portalsToPlace = Math.min(portalCount, candidates.length);
  const selected: Array<{ roomId: number; dist: number }> = [];

  if (portalsToPlace > 0) {
    const minDist = candidates[0][1];
    const bandWidth = Math.max(1, (maxDist - minDist) / portalsToPlace);
    const used = new Set<number>();

    for (let band = 0; band < portalsToPlace; band++) {
      const lo = minDist + band * bandWidth;
      const hi = lo + bandWidth;
      const isLast = band === portalsToPlace - 1;

      const inBand = candidates.filter(
        ([rid, d]) => !used.has(rid) && d >= lo && (isLast || d < hi),
      );

      if (inBand.length === 0) {
        const unused = candidates.find(([rid]) => !used.has(rid));
        if (!unused) break;
        used.add(unused[0]);
        selected.push({ roomId: unused[0], dist: unused[1] });
      } else {
        const pick = inBand[Math.floor(rng() * inBand.length)];
        used.add(pick[0]);
        selected.push({ roomId: pick[0], dist: pick[1] });
      }
    }
  }

  // Sort ascending by distance so level 1 is nearest to spawn
  selected.sort((a, b) => a.dist - b.dist);

  // ---- Step 5: allocate masks ----
  const featureType = new Uint8Array(N);
  const featureId = new Uint8Array(N);
  const danger = new Uint8Array(N);

  // ---- Step 6: place player spawn marker ----
  const spawnRoom = rooms[spawnRoomId - 1];
  const spawnPoint =
    sampleRoomFloorPoint(forest, spawnRoom, rng, 1) ?? roomCenter(spawnRoom);
  featureType[keyXY(W, spawnPoint.x, spawnPoint.y)] = 1; // player spawn

  // ---- Step 7: place dungeon portals ----
  const portals: DungeonPortal[] = [];
  let nextId = 1;

  for (let i = 0; i < selected.length; i++) {
    const { roomId, dist } = selected[i];
    const level = i + 1;
    const room = rooms[roomId - 1];
    if (!room) continue;

    const p = sampleRoomFloorPoint(forest, room, rng, 1);
    if (!p) continue;

    const cellIdx = keyXY(W, p.x, p.y);
    if (featureType[cellIdx] !== 0) continue; // already occupied

    const id = clamp255(nextId++);
    const difficultyNorm = clamp255(32 + Math.round((dist / maxDist) * 223));
    // Assign from the vetted seed bank; fall back to XOR derivation only if
    // the bank ran dry (should not happen with default batchMultiplier ≥ 4).
    const portalSeed =
      goodSeeds[i] ?? (seedUsed ^ Math.imul(level, 0x9e3779b9)) >>> 0;

    featureType[cellIdx] = 2; // dungeon portal
    featureId[cellIdx] = id;
    danger[cellIdx] = difficultyNorm;

    portals.push({
      id,
      x: p.x,
      y: p.y,
      roomId,
      level,
      seed: portalSeed,
      theme: themeForLevel(level),
      difficulty: difficultyNorm,
    });
  }

  // ---- Step 8: build textures and debug images ----
  const featureTypeTex = maskToDataTextureR8(
    featureType,
    W,
    H,
    "forest_featureType",
  );
  const featureIdTex = maskToDataTextureR8(featureId, W, H, "forest_featureId");
  const dangerTex = maskToDataTextureR8(danger, W, H, "forest_danger");

  const featureTypeImg = maskToImageDataGrayscale(featureType, W, H);
  const featureIdImg = maskToImageDataGrayscale(featureId, W, H);
  const dangerImg = maskToImageDataGrayscale(danger, W, H);

  // ---- Step 9: ASCII overlay ----
  const overlay: Array<{ x: number; y: number; ch: string }> = [];
  overlay.push({ x: spawnPoint.x, y: spawnPoint.y, ch: "@" });
  for (const portal of portals) {
    overlay.push({ x: portal.x, y: portal.y, ch: String(portal.level % 10) });
  }
  const ascii = overlayAscii(forest.debug.ascii, W, H, overlay);

  return {
    width: W,
    height: H,

    masks: { featureType, featureId, danger },

    textures: {
      featureType: featureTypeTex,
      featureId: featureIdTex,
      danger: dangerTex,
    },

    debug: {
      ascii,
      imageData: {
        featureType: featureTypeImg,
        featureId: featureIdImg,
        danger: dangerImg,
      },
    },

    meta: {
      seedUsed,
      playerSpawn: spawnPoint,
      playerSpawnRoomId: spawnRoomId,
      dungeonPortals: portals,
      roomGraph,
      roomDistance,
      rooms,
    },
  };
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
  | 9 // hidden passage (FLOOR tile that blocks until revealed via meta.secrets[id].revealed)
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
  id: number;
  mode?: "LEVEL" | "PULSE"; // default "LEVEL"
  kind?: string;
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
  requireThroat?: boolean;

  // Milestone 3 toggles
  includeLeverHiddenPocket?: boolean;
  leverHiddenPocketSize?: number; // odd >= 3 (default 3)
  includeAsciiOverlay?: boolean;

  includeLeverOpensDoor?: boolean;
  leverOpensDoorCount?: number; // “N times”
  includePlateOpensDoor?: boolean;
  plateOpensDoorCount?: number; // “N times”

  // Milestone 5: foundational intro composition (replaces Milestone 2 baseline gates)
  includeIntroGate?: boolean;
  introGateCount?: number; // “N times”

  // Optional: budget for each pattern’s internal search (passed to pattern options)
  patternMaxAttempts?: number;

  // Milestone 4 — Phase 3 (composition)
  includePhase3Compositions?: boolean;
  gateThenOptionalRewardCount?: number;

  // Milestone 6, Phase 4 — Exclusion rules (pre-generation pattern filtering)
  excludePatterns?: string[];
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
    secrets: Array<{
      id: number;
      x: number;
      y: number;
      roomId: number;
      kind: string;
    }>;

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
  const regionId = dungeon.masks.regionId;
  const { width: W, height: H } = dungeon;

  for (const c of dungeon.meta.corridors) {
    const ra = findNearestRoomId(regionId, W, H, c.a, 10);
    const rb = findNearestRoomId(regionId, W, H, c.b, 10);
    if ((ra === roomA && rb === roomB) || (ra === roomB && rb === roomA))
      return c;
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
    seed: opts?.seed ?? 0,

    entranceMode: opts?.entranceMode ?? "bottom",

    minClearanceToWall: opts?.minClearanceToWall ?? 1,
    monstersPerRoomMin: opts?.monstersPerRoomMin ?? 0,
    monstersPerRoomMax: opts?.monstersPerRoomMax ?? 2,
    monsterRoomChance: opts?.monsterRoomChance ?? 0.35,

    chestsTargetCount:
      opts?.chestsTargetCount ??
      Math.max(1, Math.floor(dungeon.meta.rooms.length / 4)),
    secretRoomChance: opts?.secretRoomChance ?? 0.45,

    maxLootTier: opts?.maxLootTier ?? 5,

    requireThroat: true, // Door location selection should be throat of corridor and room boundary.

    // Milestone 3
    includeAsciiOverlay: opts?.includeAsciiOverlay ?? true,
    includeLeverHiddenPocket: opts?.includeLeverHiddenPocket ?? false,
    leverHiddenPocketSize: opts?.leverHiddenPocketSize ?? 3,

    includeLeverOpensDoor: opts?.includeLeverOpensDoor ?? false,
    leverOpensDoorCount: opts?.leverOpensDoorCount ?? 1,

    includePlateOpensDoor: opts?.includePlateOpensDoor ?? false,
    plateOpensDoorCount: opts?.plateOpensDoorCount ?? 1,

    // Milestone 5
    includeIntroGate: opts?.includeIntroGate ?? false,
    introGateCount: opts?.introGateCount ?? (opts?.includeIntroGate ? 1 : 0), // If we don't include an intro gate, then assume zero default.

    patternMaxAttempts: opts?.patternMaxAttempts ?? 60,

    // Milestone 4 — Phase 3 (composition)
    includePhase3Compositions: opts?.includePhase3Compositions ?? false,
    gateThenOptionalRewardCount: opts?.gateThenOptionalRewardCount ?? 1,

    // Milestone 6, Phase 4 — Exclusion rules
    excludePatterns: opts?.excludePatterns ?? [],
  };

  console.log("generating dungeon content", options);

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

    secrets.push({ id, x: wallP.x, y: wallP.y, roomId, kind: "secret_door" });
  }

  // -----------------------------
  // IMPORTANT (Milestone 5 policy):
  // No baseline puzzle fixtures are placed here anymore.
  // Doors/keys/levers/plates/blocks/hazards/hidden are pattern-driven only.
  // -----------------------------

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

  // ------------------------------------
  // Milestone 3: Optional puzzle patterns
  // ------------------------------------

  // Adapt our RNG to the PatternRng interface expected by puzzlePatterns.ts
  // Adapt our RNG to the PatternRng interface expected by puzzlePatterns.ts
  const patternRng = {
    nextFloat: () => rng(),
    nextInt: (lo: number, hiInclusive: number) => {
      const span = hiInclusive - lo + 1;
      return lo + Math.floor(rng() * Math.max(1, span));
    },
  };

  const patterns: PatternEntry[] = [];

  // Milestone 5: Intro gate (replaces Milestone 2 baseline gates)
  if (options.includeIntroGate) {
    const n = Math.max(0, options.introGateCount | 0);
    for (let k = 0; k < n; k++) {
      patterns.push({
        name: "introGate",
        run: () =>
          applyIntroGatePattern({
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

            // meta
            doors,
            levers,
            circuitsById,
            circuitRoles,

            allocId: () => clamp255(nextId++),
            options: {
              maxAttempts: options.patternMaxAttempts,
              requireThroat: options.requireThroat,
            },
          }),
      });
    }
  }

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
            maxAttempts: options.patternMaxAttempts,
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
            options: {
              maxAttempts: options.patternMaxAttempts,
              requireThroat: options.requireThroat,
            },
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
            entranceRoomId,
            featureType,
            featureId,
            featureParam,
            doors,
            plates,
            blocks,
            circuitsById,
            allocId: () => clamp255(nextId++),
            options: {
              maxAttempts: options.patternMaxAttempts,
              requireThroat: options.requireThroat,
            },
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
            circuitRoles,

            allocId: () => clamp255(nextId++),
            options: {
              maxAttempts: options.patternMaxAttempts,
              requireThroat: true,
            },
          }),
      });
    }
  }

  // Milestone 6, Phase 4: pre-generation pattern exclusion
  const excluded = new Set(options.excludePatterns);
  const filteredPatterns =
    excluded.size > 0
      ? patterns.filter((p) => {
          const name = typeof p === "function" ? p.name : p.name;
          return !excluded.has(name);
        })
      : patterns;

  const { didCarve, diagnostics } = runPatternsBestEffort(filteredPatterns);

  if (didCarve) {
    recomputeDungeonDistanceToWall(dungeon);
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
        `generateDungeonContent(): hidden passage at idx=${i} has featureId=0 (missing secretId wiring)`,
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

  function stableBucketBy<T>(items: T[], keyOf: (t: T) => number): T[] {
    // Bucket approach (stable within bucket).
    const buckets = new Map<number, T[]>();
    for (const it of items) {
      const k = keyOf(it);
      const b = buckets.get(k);
      if (b) b.push(it);
      else buckets.set(k, [it]);
    }

    const keys = Array.from(buckets.keys()).sort((a, b) => a - b);

    const out: T[] = [];
    for (const k of keys) out.push(...(buckets.get(k) ?? []));
    return out;
  }

  function distKey(roomDistance: Map<number, number>, roomId: number): number {
    const d = roomDistance.get(roomId);
    return d === undefined ? 999999 : d;
  }

  const monstersSorted = stableBucketBy(monsters, (m) =>
    distKey(roomDistance, m.roomId),
  );
  const chestsSorted = stableBucketBy(chests, (c) =>
    distKey(roomDistance, c.roomId),
  );
  const secretsSorted = stableBucketBy(secrets, (s) =>
    distKey(roomDistance, s.roomId),
  );
  const keysSorted = stableBucketBy(keys, (k) =>
    distKey(roomDistance, k.roomId),
  );
  const leversSorted = stableBucketBy(levers, (l) =>
    distKey(roomDistance, l.roomId),
  );
  const platesSorted = stableBucketBy(plates, (p) =>
    distKey(roomDistance, p.roomId),
  );
  const blocksSorted = stableBucketBy(blocks, (b) =>
    distKey(roomDistance, b.roomId),
  );
  const hiddenSorted = stableBucketBy(hidden, (h) =>
    distKey(roomDistance, h.roomId),
  );
  const hazardsSorted = stableBucketBy(hazards, (h) =>
    distKey(roomDistance, h.roomId),
  );

  const doorsSorted = stableBucketBy(
    doors,
    (d) => distKey(roomDistance, d.roomB) * 1000 + (d.depth | 0),
  );

  const meta: ContentOutputs["meta"] = {
    seedUsed,
    roomGraph,
    entranceRoomId,
    farthestRoomId,
    roomDistance,
    mainPathRoomIds,
    rooms,
    monsters: monstersSorted,
    chests: chestsSorted,
    secrets: secretsSorted,
    doors: doorsSorted,
    keys: keysSorted,
    levers: leversSorted,
    plates: platesSorted,
    blocks: blocksSorted,
    hidden: hiddenSorted,
    hazards: hazardsSorted,
    circuits,
    patternDiagnostics: diagnostics,
    circuitRoles,
  };

  function assertTriggerRoomBeforeGateRoom(meta: ContentOutputs["meta"]) {
    for (const d of meta.doors) {
      const da = meta.roomDistance.get(d.roomA) ?? 999999;
      const db = meta.roomDistance.get(d.roomB) ?? 999999;
      if (da > db) {
        console.warn(
          `[content] door id=${d.id} has roomA deeper than roomB (A=${d.roomA}@${da}, B=${d.roomB}@${db})`,
        );
      }
    }
  }

  assertTriggerRoomBeforeGateRoom(meta);

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

    meta,
  };
}

// -----------------------------
// Dungeon serialization
// -----------------------------

function uint8ToBase64(arr: Uint8Array): string {
  // Chunk to avoid call-stack overflow on large maps
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < arr.length; i += chunkSize) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Serializes a fully-generated dungeon (geometry + content) to a JSON string.
 * Uint8Array masks are base64-encoded; THREE.DataTextures and ImageData are
 * omitted and will be rebuilt from the masks when loading.
 * Non-JSON-native types (Map, Set) are converted to plain arrays.
 */
export function saveDungeon(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
): string {
  const payload = {
    dungeon: {
      width: dungeon.width,
      height: dungeon.height,
      masks: {
        solid: uint8ToBase64(dungeon.masks.solid),
        regionId: uint8ToBase64(dungeon.masks.regionId),
        distanceToWall: uint8ToBase64(dungeon.masks.distanceToWall),
      },
      debugAscii: dungeon.debug.ascii,
      meta: dungeon.meta,
    },
    content: {
      width: content.width,
      height: content.height,
      masks: {
        featureType: uint8ToBase64(content.masks.featureType),
        featureId: uint8ToBase64(content.masks.featureId),
        featureParam: uint8ToBase64(content.masks.featureParam),
        danger: uint8ToBase64(content.masks.danger),
        lootTier: uint8ToBase64(content.masks.lootTier),
        hazardType: uint8ToBase64(content.masks.hazardType),
      },
      debugAscii: content.debug.ascii,
      meta: {
        ...content.meta,
        // Map<number, Set<number>> → [number, number[]][]
        roomGraph: Array.from(content.meta.roomGraph.entries()).map(
          ([k, v]) => [k, Array.from(v)],
        ),
        // Map<number, number> → [number, number][]
        roomDistance: Array.from(content.meta.roomDistance.entries()),
      },
    },
  };

  return JSON.stringify(payload);
}

/**
 * Deserializes a dungeon saved with `saveDungeon`.
 * Masks are decoded from base64; THREE.DataTextures and ImageData are rebuilt
 * from the masks so the returned objects are fully usable by the renderer.
 */
export function loadDungeon(json: string): {
  dungeon: BspDungeonOutputs;
  content: ContentOutputs;
} {
  const payload = JSON.parse(json);

  // --- BspDungeonOutputs ---
  const {
    width: dW,
    height: dH,
    masks: dM,
    debugAscii: dAscii,
    meta: dMeta,
  } = payload.dungeon;

  const solid = base64ToUint8(dM.solid);
  const regionId = base64ToUint8(dM.regionId);
  const distanceToWall = base64ToUint8(dM.distanceToWall);

  const dungeon: BspDungeonOutputs = {
    width: dW,
    height: dH,
    masks: { solid, regionId, distanceToWall },
    textures: {
      solid: solidMaskToDataTexture(solid, dW, dH),
      regionId: maskToDataTextureR8(regionId, dW, dH, "regionId"),
      distanceToWall: maskToDataTextureR8(
        distanceToWall,
        dW,
        dH,
        "distanceToWall",
      ),
    },
    debug: {
      ascii: dAscii,
      imageData: {
        solid: solidMaskToImageData(solid, dW, dH),
        regionId: maskToImageDataGrayscale(regionId, dW, dH),
        distanceToWall: maskToImageDataGrayscale(distanceToWall, dW, dH),
      },
    },
    meta: dMeta,
  };

  // --- ContentOutputs ---
  const {
    width: cW,
    height: cH,
    masks: cM,
    debugAscii: cAscii,
    meta: cMetaRaw,
  } = payload.content;

  const featureType = base64ToUint8(cM.featureType);
  const featureId = base64ToUint8(cM.featureId);
  const featureParam = base64ToUint8(cM.featureParam);
  const danger = base64ToUint8(cM.danger);
  const lootTier = base64ToUint8(cM.lootTier);
  const hazardType = base64ToUint8(cM.hazardType);

  // Reconstruct Map<number, Set<number>> from [number, number[]][]
  const roomGraph = new Map<number, Set<number>>(
    (cMetaRaw.roomGraph as [number, number[]][]).map(([k, v]) => [
      k,
      new Set(v),
    ]),
  );
  // Reconstruct Map<number, number> from [number, number][]
  const roomDistance = new Map<number, number>(
    cMetaRaw.roomDistance as [number, number][],
  );

  const content: ContentOutputs = {
    width: cW,
    height: cH,
    masks: {
      featureType,
      featureId,
      featureParam,
      danger,
      lootTier,
      hazardType,
    },
    textures: {
      featureType: maskToDataTextureR8(featureType, cW, cH, "featureType"),
      featureId: maskToDataTextureR8(featureId, cW, cH, "featureId"),
      featureParam: maskToDataTextureR8(featureParam, cW, cH, "featureParam"),
      danger: maskToDataTextureR8(danger, cW, cH, "danger"),
      lootTier: maskToDataTextureR8(lootTier, cW, cH, "lootTier"),
      hazardType: maskToDataTextureR8(hazardType, cW, cH, "hazardType"),
    },
    debug: {
      ascii: cAscii,
      imageData: {
        featureType: maskToImageDataGrayscale(featureType, cW, cH),
        featureId: maskToImageDataGrayscale(featureId, cW, cH),
        featureParam: maskToImageDataGrayscale(featureParam, cW, cH),
        danger: maskToImageDataGrayscale(danger, cW, cH),
        lootTier: maskToImageDataGrayscale(lootTier, cW, cH),
        hazardType: maskToImageDataGrayscale(hazardType, cW, cH),
      },
    },
    meta: {
      ...cMetaRaw,
      roomGraph,
      roomDistance,
    },
  };

  return { dungeon, content };
}
