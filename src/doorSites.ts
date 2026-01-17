// src/doorSites.ts
//
// Shared helpers for locating corridor-based "door sites".
// Used by:
// - puzzle patterns (Lever->Door, Plate->Door)
// - Milestone 2 door-site budgeting (gate placement clamping)
//
// Important: keep this module free of non-type imports from mazeGen.ts
// to avoid runtime import cycles (we only import types).

import type { BspDungeonOutputs } from "./mazeGen";

type Point = { x: number; y: number };

export type DoorSiteStats = {
  corridorsTotal: number;

  corridorsWithValidRoomPair: number;
  corridorsRejectedNoRooms: number;
  corridorsRejectedSameRoom: number;

  // corridor-path evaluation
  pointsConsidered: number;
  pointsRejectedWall: number;
  pointsRejectedOccupied: number;
  pointsRejectedDistToWall: number;
  pointsAccepted: number;

  corridorsWithAnyCandidate: number; // at least one acceptable point exists
  corridorsYieldedTile: number; // we actually picked a tile for this corridor
  preferCorridorHits: number; // picked point where regionId==0 in prefer pass

  tilesUnique: number; // computed at end
};

export type DoorSiteStatsBundle = {
  doorSites: DoorSiteStats;
};

function idxOf(W: number, x: number, y: number) {
  return y * W + x;
}

function inBounds(W: number, H: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function findNearestRoomId(
  regionId: Uint8Array,
  W: number,
  H: number,
  p: Point,
  maxRadius: number,
): number {
  const cx = p.x | 0;
  const cy = p.y | 0;

  if (inBounds(W, H, cx, cy)) {
    const v = regionId[idxOf(W, cx, cy)] | 0;
    if (v !== 0) return v;
  }

  for (let r = 1; r <= maxRadius; r++) {
    const x0 = cx - r;
    const x1 = cx + r;
    const y0 = cy - r;
    const y1 = cy + r;

    for (let x = x0; x <= x1; x++) {
      for (const y of [y0, y1]) {
        if (!inBounds(W, H, x, y)) continue;
        const v = regionId[idxOf(W, x, y)] | 0;
        if (v !== 0) return v;
      }
    }
    for (let y = y0 + 1; y <= y1 - 1; y++) {
      for (const x of [x0, x1]) {
        if (!inBounds(W, H, x, y)) continue;
        const v = regionId[idxOf(W, x, y)] | 0;
        if (v !== 0) return v;
      }
    }
  }

  return 0;
}

function pathPointsL(p0: Point, p1: Point, p2: Point): Point[] {
  const pts: Point[] = [];

  if (p0.x === p1.x) {
    const sy = p0.y <= p1.y ? 1 : -1;
    for (let y = p0.y; y !== p1.y + sy; y += sy) pts.push({ x: p0.x, y });
  } else {
    const sx = p0.x <= p1.x ? 1 : -1;
    for (let x = p0.x; x !== p1.x + sx; x += sx) pts.push({ x, y: p0.y });
  }

  if (p1.x === p2.x) {
    const sy = p1.y <= p2.y ? 1 : -1;
    for (let y = p1.y; y !== p2.y + sy; y += sy) pts.push({ x: p2.x, y });
  } else {
    const sx = p1.x <= p2.x ? 1 : -1;
    for (let x = p1.x; x !== p2.x + sx; x += sx) pts.push({ x, y: p2.y });
  }

  return pts;
}

function pickDoorTileOnCorridorPath(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  a: Point,
  b: Point,
  opts: {
    minDistToWall: number;
    preferCorridor: boolean;
    trimEnds: number;
  },
): Point | null {
  const W = dungeon.width;
  const H = dungeon.height;

  const solid = dungeon.masks.solid;
  const regionId = dungeon.masks.regionId;
  const distWall = dungeon.masks.distanceToWall;

  const corner1: Point = { x: a.x, y: b.y };
  const corner2: Point = { x: b.x, y: a.y };

  const candidates = [pathPointsL(a, corner1, b), pathPointsL(a, corner2, b)];

  function isGood(p: Point) {
    if (!inBounds(W, H, p.x, p.y)) return false;
    const i = idxOf(W, p.x, p.y);
    if (solid[i] !== 0) return false;
    if (featureType[i] !== 0) return false;
    if (distWall[i] < opts.minDistToWall) return false;
    return true;
  }

  const trim = Math.max(0, opts.trimEnds | 0);

  function iterTrimmed(pts: Point[]) {
    if (pts.length <= trim * 2) return [];
    return pts.slice(trim, pts.length - trim);
  }

  if (opts.preferCorridor) {
    for (const raw of candidates) {
      const pts = iterTrimmed(raw);
      for (const p of pts) {
        if (!isGood(p)) continue;
        if (regionId[idxOf(W, p.x, p.y)] === 0) return p;
      }
    }
  }

  for (const raw of candidates) {
    const pts = iterTrimmed(raw);
    for (const p of pts) {
      if (!isGood(p)) continue;
      return p;
    }
  }

  return null;
}

function pickDoorTileOnCorridorPathWithStats(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  a: Point,
  b: Point,
  opts: {
    minDistToWall: number;
    preferCorridor: boolean;
    trimEnds: number;
  },
  stats: DoorSiteStats,
): {
  tile: Point | null;
  preferCorridorHit: boolean;
  hadAnyCandidate: boolean;
} {
  const W = dungeon.width;
  const H = dungeon.height;

  const solid = dungeon.masks.solid;
  const regionId = dungeon.masks.regionId;
  const distWall = dungeon.masks.distanceToWall;

  const corner1: Point = { x: a.x, y: b.y };
  const corner2: Point = { x: b.x, y: a.y };

  const candidates = [pathPointsL(a, corner1, b), pathPointsL(a, corner2, b)];

  const trim = Math.max(0, opts.trimEnds | 0);

  function iterTrimmed(pts: Point[]) {
    if (pts.length <= trim * 2) return [];
    return pts.slice(trim, pts.length - trim);
  }

  function classify(p: Point): "ok" | "wall" | "occupied" | "dist" | "oob" {
    stats.pointsConsidered += 1;
    if (!inBounds(W, H, p.x, p.y)) return "oob";

    const i = idxOf(W, p.x, p.y);
    if (solid[i] !== 0) {
      stats.pointsRejectedWall += 1;
      return "wall";
    }
    if (featureType[i] !== 0) {
      stats.pointsRejectedOccupied += 1;
      return "occupied";
    }
    if (distWall[i] < opts.minDistToWall) {
      stats.pointsRejectedDistToWall += 1;
      return "dist";
    }

    stats.pointsAccepted += 1;
    return "ok";
  }

  let hadAnyCandidate = false;

  if (opts.preferCorridor) {
    for (const raw of candidates) {
      const pts = iterTrimmed(raw);
      for (const p of pts) {
        const r = classify(p);
        if (r !== "ok") continue;
        hadAnyCandidate = true;
        if (regionId[idxOf(W, p.x, p.y)] === 0) {
          stats.preferCorridorHits += 1;
          return { tile: p, preferCorridorHit: true, hadAnyCandidate: true };
        }
      }
    }
  }

  for (const raw of candidates) {
    const pts = iterTrimmed(raw);
    for (const p of pts) {
      const r = classify(p);
      if (r !== "ok") continue;
      hadAnyCandidate = true;
      return { tile: p, preferCorridorHit: false, hadAnyCandidate: true };
    }
  }

  return { tile: null, preferCorridorHit: false, hadAnyCandidate };
}

export function findDoorSiteCandidatesFromCorridors(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  opts?: {
    maxRadius?: number;
    minDistToWall?: number;
    preferCorridor?: boolean;
    trimEnds?: number;
    duplicateBias?: number;
  },
) {
  const W = dungeon.width;
  const H = dungeon.height;
  const regionId = dungeon.masks.regionId;

  const maxRadius = opts?.maxRadius ?? 10;
  const minDistToWall = opts?.minDistToWall ?? 1;
  const preferCorridor = opts?.preferCorridor ?? true;
  const trimEnds = opts?.trimEnds ?? 2;
  const duplicateBias = opts?.duplicateBias ?? 2;

  const out: { x: number; y: number; roomA: number; roomB: number }[] = [];

  for (const c of dungeon.meta.corridors) {
    const roomA = findNearestRoomId(regionId, W, H, c.a, maxRadius);
    const roomB = findNearestRoomId(regionId, W, H, c.b, maxRadius);
    if (roomA === 0 || roomB === 0 || roomA === roomB) continue;

    const tile = pickDoorTileOnCorridorPath(dungeon, featureType, c.a, c.b, {
      minDistToWall,
      preferCorridor,
      trimEnds,
    });
    if (!tile) continue;

    for (let i = 0; i < duplicateBias; i++) {
      out.push({ x: tile.x, y: tile.y, roomA, roomB });
    }
  }

  return out;
}

export function findDoorSiteCandidatesAndStatsFromCorridors(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  opts?: {
    maxRadius?: number;
    minDistToWall?: number;
    preferCorridor?: boolean;
    trimEnds?: number;
    duplicateBias?: number;
  },
): {
  candidates: { x: number; y: number; roomA: number; roomB: number }[];
  stats: DoorSiteStats;
} {
  const W = dungeon.width;
  const H = dungeon.height;
  const regionId = dungeon.masks.regionId;

  const maxRadius = opts?.maxRadius ?? 10;
  const minDistToWall = opts?.minDistToWall ?? 1;
  const preferCorridor = opts?.preferCorridor ?? true;
  const trimEnds = opts?.trimEnds ?? 2;
  const duplicateBias = opts?.duplicateBias ?? 2;

  const stats: DoorSiteStats = {
    corridorsTotal: 0,
    corridorsWithValidRoomPair: 0,
    corridorsRejectedNoRooms: 0,
    corridorsRejectedSameRoom: 0,
    pointsConsidered: 0,
    pointsRejectedWall: 0,
    pointsRejectedOccupied: 0,
    pointsRejectedDistToWall: 0,
    pointsAccepted: 0,
    corridorsWithAnyCandidate: 0,
    corridorsYieldedTile: 0,
    preferCorridorHits: 0,
    tilesUnique: 0,
  };

  const out: { x: number; y: number; roomA: number; roomB: number }[] = [];
  const seen = new Set<number>();

  for (const c of dungeon.meta.corridors) {
    stats.corridorsTotal += 1;

    const roomA = findNearestRoomId(regionId, W, H, c.a, maxRadius);
    const roomB = findNearestRoomId(regionId, W, H, c.b, maxRadius);

    if (roomA === 0 || roomB === 0) {
      stats.corridorsRejectedNoRooms += 1;
      continue;
    }
    if (roomA === roomB) {
      stats.corridorsRejectedSameRoom += 1;
      continue;
    }

    stats.corridorsWithValidRoomPair += 1;

    const picked = pickDoorTileOnCorridorPathWithStats(
      dungeon,
      featureType,
      c.a,
      c.b,
      {
        minDistToWall,
        preferCorridor,
        trimEnds,
      },
      stats,
    );

    if (picked.hadAnyCandidate) stats.corridorsWithAnyCandidate += 1;
    if (!picked.tile) continue;

    stats.corridorsYieldedTile += 1;

    seen.add(idxOf(W, picked.tile.x, picked.tile.y));

    for (let i = 0; i < duplicateBias; i++) {
      out.push({ x: picked.tile.x, y: picked.tile.y, roomA, roomB });
    }
  }

  stats.tilesUnique = seen.size;

  return { candidates: out, stats };
}
