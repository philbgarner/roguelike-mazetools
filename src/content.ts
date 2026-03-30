import type { DungeonOutputs, BspDungeonOutputs } from "./bsp";

// --------------------------------
// Placements
// --------------------------------

export interface ObjectPlacement {
  /** Grid cell (2-D grid X). Renderer centres object at (x+0.5) * tileSize. */
  x: number;
  /** Grid cell (2-D grid Y → world Z). Renderer centres object at (z+0.5) * tileSize. */
  z: number;
  /** Factory key resolved by the renderer's ObjectRegistry. */
  type: string;
  /** Fine-grained world-space offset from cell centre (in cell units). */
  offsetX?: number;
  offsetZ?: number;
  offsetY?: number;
  /** Yaw rotation in radians. */
  yaw?: number;
  /** Uniform scale multiplier. */
  scale?: number;
  /** Arbitrary metadata for game logic. */
  meta?: Record<string, unknown>;
}

export interface MobilePlacement {
  x: number;
  z: number;
  type: string;
  /** Tile index into the SpriteAtlas texture. Used as fallback when uvRect is absent. */
  tileId: number;
  /**
   * Explicit UV rect [x, y, w, h] in normalized (0–1) texture space.
   * When present, used instead of deriving UVs from tileId.
   */
  uvRect?: [number, number, number, number];
  /**
   * Billboard geometry size in map cells [width, height].
   * A map cell is 3×3 world units. Defaults to [1, 1].
   */
  geometrySize?: [number, number];
  meta?: Record<string, unknown>;
}

export interface HiddenPassage {
  /** Unique id within this dungeon floor. */
  id: number;
  /** Entry cell (floor cell adjacent to the tunnel entrance). */
  start: { x: number; y: number };
  /** Exit cell (floor cell at the far end of the tunnel). */
  end: { x: number; y: number };
  /**
   * Ordered list of cells from start to end (inclusive of both endpoints).
   * Wall cells in between are traversed one step at a time.
   */
  cells: Array<{ x: number; y: number }>;
  /** Whether the passage can currently be used. Toggled by lever/button. */
  enabled: boolean;
}

export interface ContentHiddenPassages {
  passages: HiddenPassage[];
}

export interface ContentOutputs {
  objects: ObjectPlacement[];
  mobiles: MobilePlacement[];
  hiddenPassages: ContentHiddenPassages;
}

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

export function makeContentRng(seed: number | string | undefined): ContentRng {
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
  /** Hazard value at (x, y). 0 = no hazard; non-zero values are user-defined. */
  getHazard(x: number, y: number): number;
  setHazard(x: number, y: number, value: number): void;
  /** Ceiling type index at (x, y). Matches atlas.json `ceilingTypes` ids. */
  getCeilingType(x: number, y: number): number;
  setCeilingType(x: number, y: number, value: number): void;
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

export interface ContentEmit {
  object(placement: ObjectPlacement): void;
  mobile(placement: MobilePlacement): void;
}

export interface ContentCallbackArgs {
  x: number;
  y: number;
  masks: CellMasks;
  logic: ContentLogic;
  rng: ContentRng;
  emit: ContentEmit;
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
  dungeon: DungeonOutputs,
  options: ContentOptions,
): ContentOutputs {
  const { width: W, height: H } = dungeon;
  const solidData = dungeon.textures.solid.image.data as Uint8Array;
  const regionData = dungeon.textures.regionId.image.data as Uint8Array;
  const distData = dungeon.textures.distanceToWall.image.data as Uint8Array;
  const hazardData = dungeon.textures.hazards.image.data as Uint8Array;
  const ceilingTypeData = dungeon.textures.ceilingType.image.data as Uint8Array;

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
    getHazard: (x, y) => {
      if (!inBounds(x, y, W, H)) return 0;
      return hazardData[y * W + x];
    },
    setHazard: (x, y, value) => {
      if (!inBounds(x, y, W, H)) return;
      hazardData[y * W + x] = value;
    },
    getCeilingType: (x, y) => {
      if (!inBounds(x, y, W, H)) return 0;
      return ceilingTypeData[y * W + x];
    },
    setCeilingType: (x, y, value) => {
      if (!inBounds(x, y, W, H)) return;
      ceilingTypeData[y * W + x] = value;
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

  const objects: ObjectPlacement[] = [];
  const mobiles: MobilePlacement[] = [];
  const emit: ContentEmit = {
    object: (p) => objects.push(p),
    mobile: (p) => mobiles.push(p),
  };

  // Reuse a single args object to avoid per-cell allocation.
  const args: ContentCallbackArgs = { x: 0, y: 0, masks, logic, rng, emit };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      args.x = x;
      args.y = y;
      options.callback(args);
    }
  }

  dungeon.textures.solid.needsUpdate = true;
  dungeon.textures.hazards.needsUpdate = true;
  dungeon.textures.ceilingType.needsUpdate = true;

  return { objects, mobiles, hiddenPassages: { passages: [] } };
}

// --------------------------------
// generateHiddenPassages
// --------------------------------

export interface HiddenPassageOptions {
  /** How many passages to generate. Default: rng.int(1, 2). */
  count?: number;
  /**
   * Minimum wall-cell length of a passage (number of solid cells between the
   * two floor endpoints, not including the endpoints themselves).
   * Default: 1.
   */
  minLength?: number;
  /**
   * Maximum wall-cell length. Default: 8.
   */
  maxLength?: number;
}

/**
 * Find short wall tunnels that connect two different regions of the dungeon.
 * Returns passage definitions with `enabled: false`; callers activate via levers.
 * Does NOT modify the solid mask — passage cells remain walls.
 *
 * At most one passage per room (region) is generated — no room will be an
 * endpoint of more than one passage.
 */
export function generateHiddenPassages(
  dungeon: DungeonOutputs,
  rng: ContentRng,
  options?: HiddenPassageOptions,
): ContentHiddenPassages {
  const W = dungeon.width;
  const H = dungeon.height;
  const solidData = dungeon.textures.solid.image.data as Uint8Array;
  const regionData = dungeon.textures.regionId.image.data as Uint8Array;

  const isSolid = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return solidData[y * W + x] !== 0;
  };
  const getRegion = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    return regionData[y * W + x];
  };

  const minLength = options?.minLength ?? 1;
  const maxLength = options?.maxLength ?? 8;

  // Precompute which pairs of rooms are already connected via corridor floor cells.
  // BFS through each connected component of corridor cells (solid=0, regionId=0).
  // Any two rooms whose cells are adjacent to the same corridor component are
  // considered directly connected — no hidden passage should link them.
  const corridorConnected = new Map<number, Set<number>>();
  {
    const visited = new Uint8Array(W * H);
    for (let y0 = 1; y0 < H - 1; y0++) {
      for (let x0 = 1; x0 < W - 1; x0++) {
        const i0 = y0 * W + x0;
        if (solidData[i0] !== 0) continue; // wall
        if (regionData[i0] !== 0) continue; // room cell, not corridor
        if (visited[i0]) continue;

        // BFS this corridor component
        const queue: number[] = [i0];
        visited[i0] = 1;
        const touchedRooms = new Set<number>();

        for (let qi = 0; qi < queue.length; qi++) {
          const idx = queue[qi];
          const cx = idx % W;
          const cy = (idx / W) | 0;
          const neighbors = [
            cx > 0     ? idx - 1 : -1,
            cx < W - 1 ? idx + 1 : -1,
            cy > 0     ? idx - W : -1,
            cy < H - 1 ? idx + W : -1,
          ];
          for (const ni of neighbors) {
            if (ni < 0) continue;
            if (solidData[ni] !== 0) continue; // wall
            const nr = regionData[ni];
            if (nr !== 0) {
              touchedRooms.add(nr); // adjacent room — don't BFS into it
              continue;
            }
            if (!visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }

        // All rooms touching this corridor component are mutually connected.
        for (const ra of touchedRooms) {
          if (!corridorConnected.has(ra)) corridorConnected.set(ra, new Set());
          for (const rb of touchedRooms) {
            if (ra !== rb) corridorConnected.get(ra)!.add(rb);
          }
        }
      }
    }
  }

  type Candidate = {
    start: { x: number; y: number };
    end: { x: number; y: number };
    wallLen: number;
    cells: Array<{ x: number; y: number }>;
    regionA: number;
    regionB: number;
  };

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  // 4 cardinal directions only — ensures straight passages
  const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  for (let fy = 1; fy < H - 1; fy++) {
    for (let fx = 1; fx < W - 1; fx++) {
      if (isSolid(fx, fy)) continue;
      const regionA = getRegion(fx, fy);
      if (regionA === 0) continue;

      for (const [dx, dy] of DIRS) {
        const wallCells: Array<{ x: number; y: number }> = [];
        let wx = fx + dx;
        let wy = fy + dy;

        // Walk through consecutive wall cells (stay within inner bounds)
        while (
          wallCells.length < maxLength &&
          isSolid(wx, wy) &&
          wx > 0 && wy > 0 && wx < W - 1 && wy < H - 1
        ) {
          wallCells.push({ x: wx, y: wy });
          wx += dx;
          wy += dy;
        }

        if (wallCells.length < minLength) continue;
        if (isSolid(wx, wy)) continue; // didn't reach a floor cell

        const regionB = getRegion(wx, wy);
        if (regionB === 0 || regionB === regionA) continue;

        // Skip if the two rooms are already connected via corridor floor cells.
        if (corridorConnected.get(regionA)?.has(regionB)) continue;

        // Skip if any tunnel wall cell is adjacent to a non-passage floor cell.
        // This prevents the passage running beside a corridor (visible blue glow).
        const startKey = `${fx},${fy}`;
        const endKey = `${wx},${wy}`;
        const tunnelTouchesFloor = wallCells.some(wc => {
          for (const [ndx, ndy] of [[0,-1],[1,0],[0,1],[-1,0]] as const) {
            const nx = wc.x + ndx, ny = wc.y + ndy;
            if (isSolid(nx, ny)) continue;
            // Passage's own endpoints are fine; any other floor cell rejects this candidate.
            if (`${nx},${ny}` !== startKey && `${nx},${ny}` !== endKey) return true;
          }
          return false;
        });
        if (tunnelTouchesFloor) continue;

        // Deduplicate (same passage found from both ends)
        const key = `${Math.min(fx, wx)},${Math.min(fy, wy)},${Math.max(fx, wx)},${Math.max(fy, wy)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        candidates.push({
          start: { x: fx, y: fy },
          end: { x: wx, y: wy },
          wallLen: wallCells.length,
          cells: [{ x: fx, y: fy }, ...wallCells, { x: wx, y: wy }],
          regionA,
          regionB,
        });
      }
    }
  }

  if (candidates.length === 0) return { passages: [] };

  // Sort ascending by wall length (prefer shorter tunnels)
  candidates.sort((a, b) => a.wallLen - b.wallLen);

  const wantCount = options?.count ?? rng.int(1, 2);
  const poolSize = Math.min(candidates.length, wantCount * 4);
  const pool = candidates.slice(0, poolSize);

  // Shuffle the pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const passages: HiddenPassage[] = [];
  const usedCells = new Set<string>();
  const usedRegions = new Set<number>();
  let id = 0;

  for (const cand of pool) {
    if (passages.length >= wantCount) break;
    // One passage per room: skip if either endpoint region already has a passage.
    if (usedRegions.has(cand.regionA) || usedRegions.has(cand.regionB)) continue;
    const overlap = cand.cells.some(c => usedCells.has(`${c.x},${c.y}`));
    if (overlap) continue;
    usedRegions.add(cand.regionA);
    usedRegions.add(cand.regionB);
    for (const c of cand.cells) usedCells.add(`${c.x},${c.y}`);
    passages.push({ id: id++, start: cand.start, end: cand.end, cells: cand.cells, enabled: false });
  }

  return { passages };
}

// --------------------------------
// generateThemedRooms
// --------------------------------

/**
 * Called once per floor/wall cell that belongs to the room or corridor
 * identified by `roomId`.
 *
 * @param x       Grid column of the cell.
 * @param y       Grid row of the cell.
 * @param context The full BSP dungeon output — use its textures to write
 *                floor/wall types, overlays, etc.
 */
export type ThemedRoomCallback = (
  x: number,
  y: number,
  context: BspDungeonOutputs,
) => void;

/**
 * Iterate every cell in the dungeon and invoke the matching `ThemedRoomCallback`
 * (keyed by room / corridor region id) for each cell that belongs to a themed
 * region.
 *
 * - Room cells are identified by their `regionId` texture value (1+).
 * - Corridor cells are identified by their `fullRegionIds` value, which
 *   assigns a unique id to each connected corridor component.
 * - Wall cells carry the same `fullRegionIds` value as the nearest floor
 *   region; pass them to your callback so you can set `wallType` etc.
 * - If no callback is registered for a region the cells are skipped.
 *
 * Mark textures as dirty after writing:
 * `context.textures.floorType.needsUpdate = true;`
 *
 * @example
 * generateThemedRooms(dungeon, {
 *   [dungeon.startRoomId]: (x, y, ctx) => {
 *     ctx.textures.floorType.image.data[y * ctx.width + x] =
 *       atlas.floorTypes.idByName("Cobblestone");
 *   },
 * });
 */
export function generateThemedRooms(
  context: BspDungeonOutputs,
  themes: Partial<Record<number, ThemedRoomCallback>>,
): void {
  const { width: W, height: H, fullRegionIds } = context;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const regionId = fullRegionIds[y * W + x];
      const cb = themes[regionId];
      if (cb !== undefined) cb(x, y, context);
    }
  }
}
