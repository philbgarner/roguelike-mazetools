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

// -----------------------------
// Types
// -----------------------------

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

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

function inBounds(x: number, y: number, w: number, h: number) {
  return x >= 0 && y >= 0 && x < w && y < h;
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
