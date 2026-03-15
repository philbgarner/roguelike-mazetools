import * as THREE from "three";

// -----------------------------
// Types
// -----------------------------

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type BspDungeonOptions = {
  width: number;
  height: number;

  seed?: number | string;

  maxDepth?: number;
  minLeafSize?: number;
  maxLeafSize?: number;
  splitPadding?: number;

  roomPadding?: number;
  minRoomSize?: number;
  maxRoomSize?: number;
  roomFillLeafChance?: number;

  corridorWidth?: number;
  corridorStyle?: "straight-or-z";

  keepOuterWalls?: boolean;
};

export type BspDungeonOutputs = {
  width: number;
  height: number;
  seed: number;
  /** Room ID (matches regionId texture values) chosen as the dungeon exit. Has exactly 1 corridor connection. */
  endRoomId: number;
  /** Room ID furthest from endRoomId — used as the player spawn room. */
  startRoomId: number;
  textures: {
    solid: THREE.DataTexture;
    regionId: THREE.DataTexture;
    distanceToWall: THREE.DataTexture;
    /** Hazard mask — 0 means no hazard; non-zero values are user-defined. */
    hazards: THREE.DataTexture;
  };
};

// -----------------------------
// RNG (seeded)
// -----------------------------

function hashSeedToUint32(seed: number | string | undefined): number {
  if (seed === undefined) return 0x12345678;
  if (typeof seed === "number") return seed >>> 0 || 0x12345678;

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
  next(): number;
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

function inBounds(x: number, y: number, W: number, H: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

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
  for (let y = r.y; y <= r.y + r.h - 1; y++) {
    for (let x = r.x; x <= r.x + r.w - 1; x++) {
      if (!inBounds(x, y, W, H)) continue;
      if (keepOuterWalls && (x === 0 || y === 0 || x === W - 1 || y === H - 1))
        continue;
      solid[idx(x, y, W)] = 0;
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
  if (keepOuterWalls && (p.x === 0 || p.y === 0 || p.x === W - 1 || p.y === H - 1))
    return;
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
  room?: Rect;
  rep?: Point;
  roomId?: number;
};

function rectCenter(r: Rect): Point {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function buildBsp(
  rect: Rect,
  depth: number,
  opts: Required<
    Pick<BspDungeonOptions, "maxDepth" | "minLeafSize" | "maxLeafSize" | "splitPadding">
  >,
  rng: RNG,
): { node: BspNode; maxDepthReached: number } {
  const node: BspNode = { rect, depth };

  const canSplitBySize = rect.w > opts.maxLeafSize || rect.h > opts.maxLeafSize;
  const shouldSplitByDepth = depth < opts.maxDepth;

  if (!shouldSplitByDepth && !canSplitBySize) return { node, maxDepthReached: depth };

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
    const L = buildBsp(
      { x: rect.x, y: rect.y, w: splitX - rect.x, h: rect.h },
      depth + 1,
      opts,
      rng,
    );
    const R = buildBsp(
      { x: splitX, y: rect.y, w: rect.x + rect.w - splitX, h: rect.h },
      depth + 1,
      opts,
      rng,
    );
    node.left = L.node;
    node.right = R.node;
    return { node, maxDepthReached: Math.max(L.maxDepthReached, R.maxDepthReached) };
  } else {
    const minSplitY = rect.y + opts.splitPadding + opts.minLeafSize;
    const maxSplitY = rect.y + rect.h - opts.splitPadding - opts.minLeafSize;
    if (minSplitY > maxSplitY) return { node, maxDepthReached: depth };

    const splitY = rng.int(minSplitY, maxSplitY);
    const L = buildBsp(
      { x: rect.x, y: rect.y, w: rect.w, h: splitY - rect.y },
      depth + 1,
      opts,
      rng,
    );
    const R = buildBsp(
      { x: rect.x, y: splitY, w: rect.w, h: rect.y + rect.h - splitY },
      depth + 1,
      opts,
      rng,
    );
    node.left = L.node;
    node.right = R.node;
    return { node, maxDepthReached: Math.max(L.maxDepthReached, R.maxDepthReached) };
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
  return { x: rng.int(r.x, r.x + r.w - 1), y: rng.int(r.y, r.y + r.h - 1) };
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
  for (let y = r.y; y <= r.y + r.h - 1; y++) {
    for (let x = r.x; x <= r.x + r.w - 1; x++) {
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
      "roomPadding" | "minRoomSize" | "maxRoomSize" | "roomFillLeafChance" | "keepOuterWalls"
    >
  >,
  rng: RNG,
) {
  let nextRoomId = 1;
  forEachLeaf(root, (leaf) => {
    const pad = Math.max(0, opts.roomPadding);
    const availW = Math.max(1, leaf.rect.w - pad * 2);
    const availH = Math.max(1, leaf.rect.h - pad * 2);

    let rw: number;
    let rh: number;

    if (rng.chance(opts.roomFillLeafChance)) {
      rw = clampInt(availW, Math.min(opts.minRoomSize, availW), availW);
      rh = clampInt(availH, Math.min(opts.minRoomSize, availH), availH);
    } else {
      rw = clampInt(rng.int(opts.minRoomSize, opts.maxRoomSize), 1, availW);
      rh = clampInt(rng.int(opts.minRoomSize, opts.maxRoomSize), 1, availH);
    }

    const minX = leaf.rect.x + pad;
    const minY = leaf.rect.y + pad;
    const rx = rng.int(minX, Math.max(minX, leaf.rect.x + leaf.rect.w - pad - rw));
    const ry = rng.int(minY, Math.max(minY, leaf.rect.y + leaf.rect.h - pad - rh));
    const room: Rect = { x: rx, y: ry, w: rw, h: rh };

    leaf.room = room;
    leaf.roomId = nextRoomId;
    leaf.rep = pickRandomPointInRect(room, rng);
    nextRoomId++;
    if (nextRoomId > 255) nextRoomId = 1;

    carveRect(solid, W, H, room, opts.keepOuterWalls);
    writeRegionRect(regionId, W, H, room, leaf.roomId);
  });
}

// -----------------------------
// Corridors
// -----------------------------

function connectSiblings(
  node: BspNode,
  solid: Uint8Array,
  W: number,
  H: number,
  opts: Required<Pick<BspDungeonOptions, "corridorWidth" | "keepOuterWalls">>,
  rng: RNG,
  adjacency: Map<number, Set<number>>,
): { rep: Point; roomId: number } {
  if (!node.left && !node.right) {
    if (!node.rep) node.rep = node.room ? rectCenter(node.room) : rectCenter(node.rect);
    return { rep: node.rep, roomId: node.roomId! };
  }

  const L = connectSiblings(node.left!, solid, W, H, opts, rng, adjacency);
  const R = connectSiblings(node.right!, solid, W, H, opts, rng, adjacency);

  // Record the room-to-room connection
  if (L.roomId !== R.roomId) {
    if (!adjacency.has(L.roomId)) adjacency.set(L.roomId, new Set());
    if (!adjacency.has(R.roomId)) adjacency.set(R.roomId, new Set());
    adjacency.get(L.roomId)!.add(R.roomId);
    adjacency.get(R.roomId)!.add(L.roomId);
  }

  if (L.rep.x === R.rep.x || L.rep.y === R.rep.y) {
    carveCorridor(solid, W, H, L.rep, R.rep, opts.corridorWidth, opts.keepOuterWalls);
  } else if (rng.chance(0.5)) {
    const mid: Point = { x: R.rep.x, y: L.rep.y };
    carveCorridor(solid, W, H, L.rep, mid, opts.corridorWidth, opts.keepOuterWalls);
    carveCorridor(solid, W, H, mid, R.rep, opts.corridorWidth, opts.keepOuterWalls);
  } else {
    const mid: Point = { x: L.rep.x, y: R.rep.y };
    carveCorridor(solid, W, H, L.rep, mid, opts.corridorWidth, opts.keepOuterWalls);
    carveCorridor(solid, W, H, mid, R.rep, opts.corridorWidth, opts.keepOuterWalls);
  }

  const useLeft = rng.chance(0.5);
  node.rep = useLeft ? L.rep : R.rep;
  return { rep: node.rep, roomId: useLeft ? L.roomId : R.roomId };
}

// -----------------------------
// Start/end room selection
// -----------------------------

function pickStartEndRooms(
  adjacency: Map<number, Set<number>>,
): { startRoomId: number; endRoomId: number } {
  const allRooms = Array.from(adjacency.keys());
  if (allRooms.length === 0) return { startRoomId: 1, endRoomId: 1 };
  if (allRooms.length === 1) return { startRoomId: allRooms[0], endRoomId: allRooms[0] };

  // Find rooms with exactly 1 connection (dead ends) — candidates for end room
  const deadEnds = allRooms.filter((id) => (adjacency.get(id)?.size ?? 0) === 1);
  const candidates = deadEnds.length > 0 ? deadEnds : allRooms;

  // BFS from each candidate to find the one that maximises the longest shortest path
  // For efficiency, pick the first dead-end, BFS to find the furthest room, then
  // BFS back from that furthest room to confirm — a two-pass approach.

  function bfsFurthest(startId: number): { id: number; dist: number } {
    const dist = new Map<number, number>();
    dist.set(startId, 0);
    const queue = [startId];
    let furthestId = startId;
    let furthestDist = 0;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const d = dist.get(cur)!;
      for (const nb of adjacency.get(cur) ?? []) {
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          queue.push(nb);
          if (d + 1 > furthestDist) {
            furthestDist = d + 1;
            furthestId = nb;
          }
        }
      }
    }
    return { id: furthestId, dist: furthestDist };
  }

  // Among dead-end candidates, pick the one that maximises its furthest BFS distance.
  // That candidate (deepest dead-end) becomes endRoomId.
  let endRoomId = candidates[0];
  let bestDist = -1;
  for (const cand of candidates) {
    const { dist: d } = bfsFurthest(cand);
    if (d > bestDist) {
      bestDist = d;
      endRoomId = cand;
    }
  }

  // Start room is the room furthest from endRoomId
  const { id: startRoomId } = bfsFurthest(endRoomId);

  return { startRoomId, endRoomId };
}

// -----------------------------
// Distance-to-wall (BFS)
// -----------------------------

function computeDistanceToWall(solid: Uint8Array, W: number, H: number): Uint8Array {
  const dist = new Uint16Array(W * H);
  const INF = 0xffff;
  dist.fill(INF);

  const q = new Int32Array(W * H);
  let qh = 0;
  let qt = 0;

  for (let i = 0; i < W * H; i++) {
    if (solid[i] === 255) {
      dist[i] = 0;
      q[qt++] = i;
    }
  }

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
    const next = dist[i] + 1;
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
    out[i] = d === INF ? 255 : d > 255 ? 255 : d;
  }
  return out;
}

// -----------------------------
// Texture helper
// -----------------------------

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

// -----------------------------
// Public generator
// -----------------------------

export function generateBspDungeon(options: BspDungeonOptions): BspDungeonOutputs {
  const opts = {
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
    corridorStyle: options.corridorStyle ?? ("straight-or-z" as const),
    keepOuterWalls: options.keepOuterWalls ?? true,
  };

  if (opts.width <= 2 || opts.height <= 2)
    throw new Error("generateBspDungeon: width/height must be > 2");
  if (opts.minLeafSize < 4)
    throw new Error("generateBspDungeon: minLeafSize too small (recommend >= 4)");

  const seedUsed = hashSeedToUint32(opts.seed);
  const rng = makeRng(seedUsed);
  const W = opts.width;
  const H = opts.height;

  const solid = new Uint8Array(W * H);
  solid.fill(255);
  const regionId = new Uint8Array(W * H);

  const { node: root } = buildBsp(
    { x: 0, y: 0, w: W, h: H },
    0,
    {
      maxDepth: opts.maxDepth,
      minLeafSize: opts.minLeafSize,
      maxLeafSize: opts.maxLeafSize,
      splitPadding: opts.splitPadding,
    },
    rng,
  );

  createRooms(root, solid, regionId, W, H, {
    roomPadding: opts.roomPadding,
    minRoomSize: opts.minRoomSize,
    maxRoomSize: opts.maxRoomSize,
    roomFillLeafChance: opts.roomFillLeafChance,
    keepOuterWalls: opts.keepOuterWalls,
  }, rng);

  const adjacency = new Map<number, Set<number>>();
  connectSiblings(root, solid, W, H, {
    corridorWidth: opts.corridorWidth,
    keepOuterWalls: opts.keepOuterWalls,
  }, rng, adjacency);

  const { startRoomId, endRoomId } = pickStartEndRooms(adjacency);

  const distanceToWall = computeDistanceToWall(solid, W, H);
  const hazards = new Uint8Array(W * H); // all zeros — placed by content callback

  return {
    width: W,
    height: H,
    seed: seedUsed,
    endRoomId,
    startRoomId,
    textures: {
      solid: maskToDataTextureR8(solid, W, H, "bsp_dungeon_solid"),
      regionId: maskToDataTextureR8(regionId, W, H, "bsp_dungeon_region_id"),
      distanceToWall: maskToDataTextureR8(distanceToWall, W, H, "bsp_dungeon_distance_to_wall"),
      hazards: maskToDataTextureR8(hazards, W, H, "bsp_dungeon_hazards"),
    },
  };
}
