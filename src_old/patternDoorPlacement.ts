// src/patternDoorPlacement.ts
//
// Shared policy helper for door/gate placement in patterns.
// Enforces: trigger room must be earlier (closer to entrance) than gated room.
//
// Spatial validity (door sits on a valid corridor site, jambs, no-adjacent-door, etc.)
// stays in doorSites.ts. This file only adds *ordering*.

import type { BspDungeonOutputs } from "./mazeGen";
import { findDoorSiteCandidatesAndStatsFromCorridors } from "./doorSites";

export type PatternRng = {
  nextInt(lo: number, hi: number): number; // inclusive
};

export type DoorSiteCandidate = {
  x: number;
  y: number;
  roomA: number;
  roomB: number;
};

export function orientRoomsByDistance(
  roomA: number,
  roomB: number,
  roomDistance: Map<number, number>,
): { triggerRoomId: number; gateRoomId: number; gateDepth: number } | null {
  const da = roomDistance.get(roomA);
  const db = roomDistance.get(roomB);
  if (da === undefined || db === undefined) return null;
  if (da === db) return null;

  if (da < db)
    return { triggerRoomId: roomA, gateRoomId: roomB, gateDepth: db };
  return { triggerRoomId: roomB, gateRoomId: roomA, gateDepth: da };
}

function buildRoomGraphFromCorridors(
  dungeon: BspDungeonOutputs,
  maxRadius: number,
): Map<number, Set<number>> {
  const W = dungeon.width;
  const H = dungeon.height;
  const regionId = dungeon.masks.regionId;

  function idxOf(x: number, y: number) {
    return y * W + x;
  }
  function inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H;
  }

  function findNearestRoomId(p: { x: number; y: number }): number {
    const cx = p.x | 0;
    const cy = p.y | 0;

    if (inBounds(cx, cy)) {
      const v = regionId[idxOf(cx, cy)] | 0;
      if (v !== 0) return v;
    }

    for (let r = 1; r <= maxRadius; r++) {
      const x0 = cx - r;
      const x1 = cx + r;
      const y0 = cy - r;
      const y1 = cy + r;

      for (let x = x0; x <= x1; x++) {
        for (const y of [y0, y1]) {
          if (!inBounds(x, y)) continue;
          const v = regionId[idxOf(x, y)] | 0;
          if (v !== 0) return v;
        }
      }
      for (let y = y0 + 1; y <= y1 - 1; y++) {
        for (const x of [x0, x1]) {
          if (!inBounds(x, y)) continue;
          const v = regionId[idxOf(x, y)] | 0;
          if (v !== 0) return v;
        }
      }
    }

    return 0;
  }

  const g = new Map<number, Set<number>>();

  // ensure all rooms exist as nodes
  for (let i = 0; i < dungeon.meta.rooms.length; i++) g.set(i + 1, new Set());

  for (const c of dungeon.meta.corridors) {
    const a = findNearestRoomId(c.a);
    const b = findNearestRoomId(c.b);
    if (a === 0 || b === 0 || a === b) continue;

    if (!g.has(a)) g.set(a, new Set());
    if (!g.has(b)) g.set(b, new Set());
    g.get(a)!.add(b);
    g.get(b)!.add(a);
  }

  return g;
}

function bfsRoomDistances(
  graph: Map<number, Set<number>>,
  startRoomId: number,
): Map<number, number> {
  const dist = new Map<number, number>();
  const q: number[] = [];

  dist.set(startRoomId, 0);
  q.push(startRoomId);

  while (q.length) {
    const cur = q.shift()!;
    const dcur = dist.get(cur)!;
    const nbs = graph.get(cur);
    if (!nbs) continue;

    for (const nb of nbs) {
      if (dist.has(nb)) continue;
      dist.set(nb, dcur + 1);
      q.push(nb);
    }
  }

  return dist;
}

export function pickOrderedDoorSiteFromCandidates(args: {
  rng: PatternRng;
  candidates: DoorSiteCandidate[];
  roomDistance: Map<number, number>;

  // Optional hard constraints (useful for intro-gate patterns etc.)
  requireTriggerRoomId?: number;
  requireGateRoomId?: number;
}):
  | {
      ok: true;
      x: number;
      y: number;
      triggerRoomId: number;
      gateRoomId: number;
      gateDepth: number;
    }
  | { ok: false; reason: "NoOrderedCandidate" } {
  const {
    rng,
    candidates,
    roomDistance,
    requireTriggerRoomId,
    requireGateRoomId,
  } = args;

  const ordered: Array<
    DoorSiteCandidate & { trig: number; gate: number; depth: number }
  > = [];

  for (const c of candidates) {
    const o = orientRoomsByDistance(c.roomA, c.roomB, roomDistance);
    if (!o) continue;
    if (
      requireTriggerRoomId !== undefined &&
      o.triggerRoomId !== requireTriggerRoomId
    )
      continue;
    if (requireGateRoomId !== undefined && o.gateRoomId !== requireGateRoomId)
      continue;
    ordered.push({
      ...c,
      trig: o.triggerRoomId,
      gate: o.gateRoomId,
      depth: o.gateDepth,
    });
  }

  if (!ordered.length) return { ok: false, reason: "NoOrderedCandidate" };

  const pick = ordered[rng.nextInt(0, ordered.length - 1)]!;
  return {
    ok: true,
    x: pick.x,
    y: pick.y,
    triggerRoomId: pick.trig,
    gateRoomId: pick.gate,
    gateDepth: pick.depth,
  };
}

export function pickOrderedDoorSiteFromCorridors(args: {
  rng: PatternRng;
  dungeon: BspDungeonOutputs;
  featureType: Uint8Array;
  entranceRoomId: number;

  // Optional: constrain which room is the gated (far) side
  requireGateRoomId?: number;

  // forwarded to doorSites
  maxRadius?: number;
  minDistToWall?: number;
  preferCorridor?: boolean;
  trimEnds?: number;
  duplicateBias?: number;
}):
  | {
      ok: true;
      x: number;
      y: number;
      triggerRoomId: number;
      gateRoomId: number;
      gateDepth: number;
      stats: unknown;
    }
  | {
      ok: false;
      reason: "NoCandidates" | "NoDistances" | "NoOrderedCandidate";
      stats?: unknown;
    } {
  const {
    rng,
    dungeon,
    featureType,
    entranceRoomId,
    requireGateRoomId,
    maxRadius = 10,
    minDistToWall = 1,
    preferCorridor = true,
    trimEnds = 0,
    duplicateBias = 1,
  } = args;

  const { candidates, stats } = findDoorSiteCandidatesAndStatsFromCorridors(
    dungeon,
    featureType,
    {
      maxRadius,
      minDistToWall,
      preferCorridor,
      trimEnds,
      duplicateBias,
      requireThroat: true,
    },
  );

  if (!candidates.length) return { ok: false, reason: "NoCandidates", stats };

  const graph = buildRoomGraphFromCorridors(dungeon, maxRadius);
  const dist = bfsRoomDistances(graph, entranceRoomId);
  if (!dist.size) return { ok: false, reason: "NoDistances", stats };

  const pick = pickOrderedDoorSiteFromCandidates({
    rng,
    candidates,
    roomDistance: dist,
    requireGateRoomId,
  });

  if (!pick.ok) return { ok: false, reason: "NoOrderedCandidate", stats };

  return { ...pick, ok: true, stats };
}
