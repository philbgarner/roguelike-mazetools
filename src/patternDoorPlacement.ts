// src/patternDoorPlacement.ts
//
// Shared policy helper for door/gate placement used by patterns.
// Enforces: trigger room must be earlier in the room graph than the gated side.
//
// This module is intentionally policy-oriented (graph/BFS ordering).
// doorSites.ts remains spatial-only (throat selection / jambs / adjacency checks).

import type { BspDungeonOutputs } from "./mazeGen";
import { findDoorSiteCandidatesAndStatsFromCorridors } from "./doorSites";

export type PatternRng = {
  nextInt(lo: number, hi: number): number; // inclusive
};

export type OrderedDoorPick = {
  ok: true;
  x: number;
  y: number;

  // Earlier room: where trigger must be placed (lever/plate/etc)
  triggerRoomId: number;

  // Later room: the gated side (progression)
  gateRoomId: number;

  // BFS distance of the gated room from the entrance room
  gateDepth: number;

  // Diagnostics passthrough (optional)
  stats?: unknown;
};

export type OrderedDoorPickFail = {
  ok: false;
  reason:
    | "NoCandidates"
    | "NoEntranceDist"
    | "UnorderedCandidateOnly"
    | "ExhaustedAttempts";
  stats?: unknown;
};

function buildRoomGraphFromCorridors(
  dungeon: BspDungeonOutputs,
  maxRadius: number,
): Map<number, Set<number>> {
  const W = dungeon.width;
  const H = dungeon.height;
  const regionId = dungeon.masks.regionId;

  // local nearest-room helper (same semantics as doorSites; keep here to avoid cycles)
  function idxOf(x: number, y: number) {
    return y * W + x;
  }
  function inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H;
  }
  function findNearestRoomId(x: number, y: number): number {
    if (inBounds(x, y)) {
      const v = regionId[idxOf(x, y)] | 0;
      if (v !== 0) return v;
    }
    for (let r = 1; r <= maxRadius; r++) {
      const x0 = x - r;
      const x1 = x + r;
      const y0 = y - r;
      const y1 = y + r;
      for (let xx = x0; xx <= x1; xx++) {
        for (const yy of [y0, y1]) {
          if (!inBounds(xx, yy)) continue;
          const v = regionId[idxOf(xx, yy)] | 0;
          if (v !== 0) return v;
        }
      }
      for (let yy = y0 + 1; yy <= y1 - 1; yy++) {
        for (const xx of [x0, x1]) {
          if (!inBounds(xx, yy)) continue;
          const v = regionId[idxOf(xx, yy)] | 0;
          if (v !== 0) return v;
        }
      }
    }
    return 0;
  }

  const graph = new Map<number, Set<number>>();

  // Ensure each room is present
  for (let i = 0; i < dungeon.meta.rooms.length; i++) {
    graph.set(i + 1, new Set());
  }

  for (const c of dungeon.meta.corridors) {
    const ra = findNearestRoomId(c.a.x | 0, c.a.y | 0);
    const rb = findNearestRoomId(c.b.x | 0, c.b.y | 0);
    if (ra === 0 || rb === 0 || ra === rb) continue;

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

export function pickOrderedDoorSite(args: {
  rng: PatternRng;
  dungeon: BspDungeonOutputs;
  featureType: Uint8Array;

  entranceRoomId: number;

  // Keep aligned with doorSites defaults, but explicit here for stability
  maxRadius?: number;
  maxAttempts?: number;

  // Passed through to doorSites:
  minDistToWall?: number;
  preferCorridor?: boolean;
  trimEnds?: number; // (doorSites throat-only makes this mostly irrelevant)
  duplicateBias?: number; // for weighting; we usually want 1
}): OrderedDoorPick | OrderedDoorPickFail {
  const {
    rng,
    dungeon,
    featureType,
    entranceRoomId,
    maxRadius = 10,
    maxAttempts = 80,
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
    },
  );

  if (candidates.length === 0) {
    return { ok: false, reason: "NoCandidates", stats };
  }

  const graph = buildRoomGraphFromCorridors(dungeon, maxRadius);
  const dist = bfsRoomDistances(graph, entranceRoomId);

  if (!dist.has(entranceRoomId)) {
    // Should never happen, but keep explicit.
    return { ok: false, reason: "NoEntranceDist", stats };
  }

  // Filter to candidates that have strict ordering.
  const ordered = candidates.filter((c) => {
    const da = dist.get(c.roomA);
    const db = dist.get(c.roomB);
    if (da === undefined || db === undefined) return false;
    return da !== db;
  });

  if (ordered.length === 0) {
    return { ok: false, reason: "UnorderedCandidateOnly", stats };
  }

  // Try a few random draws (preserves best-effort + randomness without biasing too hard).
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const c = ordered[rng.nextInt(0, ordered.length - 1)]!;
    const da = dist.get(c.roomA)!;
    const db = dist.get(c.roomB)!;

    const triggerRoomId = da < db ? c.roomA : c.roomB;
    const gateRoomId = da < db ? c.roomB : c.roomA;
    const gateDepth = dist.get(gateRoomId) ?? 0;

    return {
      ok: true,
      x: c.x,
      y: c.y,
      triggerRoomId,
      gateRoomId,
      gateDepth,
      stats,
    };
  }

  return { ok: false, reason: "ExhaustedAttempts", stats };
}
