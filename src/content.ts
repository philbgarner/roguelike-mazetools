import type { BspDungeonOutputs } from "./bsp";

// --------------------------------
// RNG
// --------------------------------

export type ContentRng = {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
};

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

function makeContentRng(seed: number | string | undefined): ContentRng {
  let t = hashSeedToUint32(seed) >>> 0;
  function rand(): number {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next: () => rand(),
    int: (min, max) => {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return lo + Math.floor(rand() * (hi - lo + 1));
    },
    chance: (p) => rand() < p,
  };
}

// --------------------------------
// Solid state
// --------------------------------

export type SolidState = "wall" | "floor";

// --------------------------------
// Mask accessors
// --------------------------------

export interface CellMasks {
  getSolid(x: number, y: number): SolidState;
  setSolid(x: number, y: number, state: SolidState): void;
  /** Raw numeric value — use for custom states beyond "wall"/"floor". */
  getSolidRaw(x: number, y: number): number;
  setSolidRaw(x: number, y: number, value: number): void;
  getRegionId(x: number, y: number): number;
  getDistanceToWall(x: number, y: number): number;
}

// --------------------------------
// Game logic
// --------------------------------

export interface ContentLogic {
  /**
   * Returns true if the cell is not a wall.
   * Custom `isWalkable` in ContentOptions overrides this default.
   */
  isWalkable(x: number, y: number): boolean;
  /**
   * Bresenham ray from (x1,y1) to (x2,y2).
   * Blocked by any intermediate cell where !isWalkable.
   * The destination cell itself is always considered visible
   * (you can see the wall you're looking at).
   */
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean;
}

// --------------------------------
// Callback
// --------------------------------

export interface ContentCallbackArgs {
  x: number;
  y: number;
  masks: CellMasks;
  logic: ContentLogic;
  rng: ContentRng;
}

export type ContentCallback = (args: ContentCallbackArgs) => void;

// --------------------------------
// Options
// --------------------------------

export interface ContentOptions {
  callback: ContentCallback;
  seed?: number | string;
  /**
   * Override default walkability used by isWalkable and hasLineOfSight.
   * Default: getSolid(x, y) !== "wall"
   */
  isWalkable?: (x: number, y: number, masks: CellMasks) => boolean;
}

// --------------------------------
// Helpers
// --------------------------------

function inBounds(x: number, y: number, W: number, H: number): boolean {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function bresenhamLos(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  isBlocked: (x: number, y: number) => boolean,
): boolean {
  let x = x1;
  let y = y1;
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x === x2 && y === y2) return true;
    // Check intermediate cells only — destination is always visible.
    if ((x !== x1 || y !== y1) && isBlocked(x, y)) return false;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// --------------------------------
// generateContent
// --------------------------------

export function generateContent(
  dungeon: BspDungeonOutputs,
  options: ContentOptions,
): void {
  const { width: W, height: H } = dungeon;
  const solidData = dungeon.textures.solid.image.data as Uint8Array;
  const regionData = dungeon.textures.regionId.image.data as Uint8Array;
  const distData = dungeon.textures.distanceToWall.image.data as Uint8Array;

  const masks: CellMasks = {
    getSolid: (x, y) => {
      if (!inBounds(x, y, W, H)) return "wall";
      return solidData[y * W + x] !== 0 ? "wall" : "floor";
    },
    setSolid: (x, y, state) => {
      if (!inBounds(x, y, W, H)) return;
      solidData[y * W + x] = state === "wall" ? 255 : 0;
    },
    getSolidRaw: (x, y) => {
      if (!inBounds(x, y, W, H)) return 255;
      return solidData[y * W + x];
    },
    setSolidRaw: (x, y, value) => {
      if (!inBounds(x, y, W, H)) return;
      solidData[y * W + x] = value;
    },
    getRegionId: (x, y) => {
      if (!inBounds(x, y, W, H)) return 0;
      return regionData[y * W + x];
    },
    getDistanceToWall: (x, y) => {
      if (!inBounds(x, y, W, H)) return 0;
      return distData[y * W + x];
    },
  };

  const walkableFn = options.isWalkable
    ? (x: number, y: number) => options.isWalkable!(x, y, masks)
    : (x: number, y: number) => masks.getSolid(x, y) !== "wall";

  const logic: ContentLogic = {
    isWalkable: walkableFn,
    hasLineOfSight: (x1, y1, x2, y2) =>
      bresenhamLos(x1, y1, x2, y2, (x, y) => !walkableFn(x, y)),
  };

  const rng = makeContentRng(options.seed);

  // Reuse a single args object to avoid per-cell allocation.
  const args: ContentCallbackArgs = { x: 0, y: 0, masks, logic, rng };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      args.x = x;
      args.y = y;
      options.callback(args);
    }
  }

  dungeon.textures.solid.needsUpdate = true;
}
