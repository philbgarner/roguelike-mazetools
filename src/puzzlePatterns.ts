// src/puzzlePatterns.ts
//
// Milestone 3: generalized puzzle pattern placement.
//
// Pattern (Variant A):
// - Carve a small unreachable “pocket” behind a connector tile.
// - Place a hidden passage fixture (featureType=9) on the connector tile.
// - Place a lever (featureType=6) in reachable space.
// - Wire circuit: LEVER -> HIDDEN(REVEAL), PERSISTENT.
// - Validate: pocket goal unreachable pre-reveal, reachable post-reveal.
//
// NOTE:
// Hidden passage behavior in runtime is driven by meta.secrets[id].revealed.
// Your current fixture already uses featureType=9 on floor tiles, so this
// pattern does the same.
//
// IMPORTANT:
// In your current runtime movement logic, hidden passages only work on tiles
// that are NOT walls in dungeon.masks.solid. So this pattern carves the
// connector tile as FLOOR, but blocks it until revealed via featureType=9 +
// runtime.secrets[secretId].revealed.

import type { BspDungeonOutputs, ContentOutputs, CircuitDef } from "./mazeGen";
import {
  findDoorSiteCandidatesAndStatsFromCorridors,
  type DoorSiteStatsBundle,
} from "./doorSites";

type Point = { x: number; y: number };

export type ReachabilityStats = {
  start: Point;
  connector: Point;
  pocketCenter: Point;
  goal: Point;
  reachablePre: boolean;
  reachablePost: boolean;
  /**
   * Shortest-path length (in tiles) from start -> goal after reveal.
   * Null means unreachable.
   */
  shortestPathPost: number | null;
};

export type PatternRng = {
  nextFloat(): number;
  nextInt(lo: number, hiInclusive: number): number;
};

export type LeverHiddenPocketPatternOptions = {
  pocketSize?: number; // odd >= 3
  minLeverToConnectorDist?: number; // Manhattan distance
  minConnectorFromEntranceManhattan?: number;
  maxCandidateSites?: number;

  /**
   * NEW: how many candidate connector attempts to try before giving up.
   * This specifically addresses the "reachable pre-reveal" failure mode by
   * trying alternate candidates instead of failing immediately.
   */
  maxAttempts?: number;
};

export type PatternResult =
  | {
      ok: true;
      didCarve: boolean;
      stats?: DoorSiteStatsBundle;
      reachability?: ReachabilityStats;
    }
  | {
      ok: false;
      didCarve: false;
      reason: string;
      stats?: DoorSiteStatsBundle;
      reachability?: ReachabilityStats;
    };

type PatternFn = () => PatternResult;

export type PatternDiagnostics = {
  name: string;
  ok: boolean;
  didCarve: boolean;
  reason?: string;
  ms: number;
  stats?: DoorSiteStatsBundle;
  reachability?: ReachabilityStats;
};

export type PatternEntry =
  | PatternFn
  | {
      name: string;
      run: PatternFn;
    };

/**
 * Best-effort execution:
 * - Patterns are allowed to fail without aborting generation.
 * - We aggregate didCarve so the generator can decide whether to recompute
 *   distanceToWall (Option A policy).
 *
 * Back-compat:
 * - You can pass PatternFn[] (legacy) OR PatternEntry[] (named).
 */
export function runPatternsBestEffort(patterns: PatternEntry[]): {
  didCarve: boolean;
  diagnostics: PatternDiagnostics[];
} {
  let didCarve = false;
  const diagnostics: PatternDiagnostics[] = [];

  for (const p of patterns) {
    const name =
      typeof p === "function"
        ? (p as any).name || "pattern"
        : p.name || "pattern";
    const run = typeof p === "function" ? (p as PatternFn) : p.run;

    const t0 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();

    const res = run();

    const t1 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();

    if (!res.ok) {
      console.warn(`[puzzlePatterns] ${name} skipped: ${res.reason}`);
      diagnostics.push({
        name,
        ok: false,
        didCarve: false,
        reason: res.reason,
        ms: Math.max(0, t1 - t0),
        stats: res.stats,
        reachability: res.reachability,
      });
      continue;
    }

    didCarve ||= res.didCarve;
    diagnostics.push({
      name,
      ok: true,
      didCarve: res.didCarve,
      ms: Math.max(0, t1 - t0),
      stats: res.stats,
      reachability: res.reachability,
    });
  }

  return { didCarve, diagnostics };
}

export function applyLeverRevealsHiddenPocketPattern(args: {
  rng: PatternRng;

  dungeon: BspDungeonOutputs;
  entranceRoomId: number;
  rooms: BspDungeonOutputs["meta"]["rooms"];

  // Content masks to mutate
  featureType: Uint8Array;
  featureId: Uint8Array;
  featureParam: Uint8Array;

  // Content meta to append to
  secrets: ContentOutputs["meta"]["secrets"];
  levers: ContentOutputs["meta"]["levers"];

  // The generator owns circuit finalization via circuitsById.
  // This pattern inserts its circuit here so it naturally ends up in meta.circuits.
  circuitsById: Map<number, CircuitDef>;

  allocId: () => number; // unique id allocator (1..255)
  options?: LeverHiddenPocketPatternOptions;
}): PatternResult {
  const {
    rng,
    dungeon,
    entranceRoomId,
    rooms,
    featureType: ft,
    featureId: fid,
    featureParam: fparam,
    secrets,
    levers,
    circuitsById,
    allocId,
  } = args;

  const pocketSize = clampOdd(Math.max(3, args.options?.pocketSize ?? 5));
  const minLeverToConnectorDist = Math.max(
    3,
    args.options?.minLeverToConnectorDist ?? 8,
  );
  const minConnectorFromEntranceManhattan = Math.max(
    3,
    args.options?.minConnectorFromEntranceManhattan ?? 10,
  );
  const maxCandidateSites = Math.max(
    20,
    args.options?.maxCandidateSites ?? 200,
  );
  const maxAttempts = Math.max(1, args.options?.maxAttempts ?? 60);

  const W = dungeon.width;
  const H = dungeon.height;

  const solid = dungeon.masks.solid;
  const regionId = dungeon.masks.regionId;

  // Determine a starting floodfill point: any floor in entrance room.
  const entranceRoom = rooms[entranceRoomId - 1] ?? rooms[0];
  if (!entranceRoom)
    return { ok: false, didCarve: false, reason: "No rooms available." };

  const start = findAnyFloorInRect(dungeon, entranceRoom);
  if (!start)
    return {
      ok: false,
      didCarve: false,
      reason: "Entrance room has no floor tiles.",
    };

  const reach0 = computeReachable(dungeon, ft, fid, start, new Set());

  // Candidate connector sites:
  // A (reachable floor) -> C (currently wall; will be carved to floor & hidden) -> pocket.
  const candidates: Array<{
    ax: number;
    ay: number;
    cx: number;
    cy: number;
    // The pocket's center.
    px: number;
    py: number;
  }> = [];

  // Collect candidates by scanning for walls adjacent to reachable floors.
  // We'll limit to maxCandidateSites (best effort).
  for (let y = 1; y < H - 1 && candidates.length < maxCandidateSites; y++) {
    for (let x = 1; x < W - 1 && candidates.length < maxCandidateSites; x++) {
      const ci = idxOf(W, x, y);

      // Connector must be a wall right now (we will carve it)
      if (solid[ci] !== 255) continue;

      // Must be adjacent to at least one reachable floor (A)
      let a: Point | null = null;
      for (const d of cardinalDirs()) {
        const ax = x + d.dx;
        const ay = y + d.dy;
        const ai = idxOf(W, ax, ay);
        if (!reach0[ai]) continue;
        if (solid[ai] === 255) continue;
        a = { x: ax, y: ay };
        break;
      }
      if (!a) continue;

      // Require connector far enough from entrance start to avoid trivial early pockets.
      if (manhattan({ x, y }, start) < minConnectorFromEntranceManhattan)
        continue;

      // Choose pocket center on the opposite side of the reachable side (roughly).
      const dx = x - a.x;
      const dy = y - a.y;
      const px = x + dx * (Math.floor(pocketSize / 2) + 1);
      const py = y + dy * (Math.floor(pocketSize / 2) + 1);

      // Must be in bounds for full pocket rect
      const half = Math.floor(pocketSize / 2);
      if (
        px - half < 1 ||
        py - half < 1 ||
        px + half >= W - 1 ||
        py + half >= H - 1
      )
        continue;

      // Pocket must currently be mostly solid.
      const score = pocketSolidnessScore(dungeon, { x: px, y: py }, pocketSize);
      if (score < 0.85) continue;

      // Avoid carving into rooms (keep it in corridor/wall space)
      const pCenterI = idxOf(W, px, py);
      if ((regionId[pCenterI] | 0) !== 0) continue;

      candidates.push({ ax: a.x, ay: a.y, cx: x, cy: y, px, py });
    }
  }

  if (!candidates.length) {
    return {
      ok: false,
      didCarve: false,
      reason: "No candidate connectors found.",
    };
  }

  // NEW: Instead of picking one candidate and failing immediately on reachablePre,
  // try up to maxAttempts candidates (shuffled) and accept the first that validates.
  const order = candidates.slice();
  // Fisher-Yates shuffle (deterministic via PatternRng)
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }

  const attempts = Math.min(maxAttempts, order.length);

  let lastReachability: ReachabilityStats | undefined;
  let preReachableCount = 0;
  let postUnreachableCount = 0;
  let leverSpotFailCount = 0;

  for (let ai = 0; ai < attempts; ai++) {
    const picked = order[ai]!;

    // Choose a lever placement spot in reachable space with good separation.
    const leverSpot = chooseLeverSpot(
      rng,
      dungeon,
      ft,
      fid,
      start,
      { x: picked.cx, y: picked.cy },
      minLeverToConnectorDist,
    );
    if (!leverSpot) {
      leverSpotFailCount++;
      continue;
    }

    // Allocate ids (preview uses them; we only commit if validation passes)
    const secretId = allocId();
    const leverId = secretId; // keep ids aligned for simpler circuit wiring

    // --- Preview validation on copies before commit ---
    const solid2 = solid.slice();
    const ft2 = ft.slice();
    const fid2 = fid.slice();
    const fparam2 = fparam.slice();

    const didCarve = carvePocketAndConnector(
      { width: W, height: H, masks: { solid: solid2 } } as any,
      { x: picked.cx, y: picked.cy },
      { x: picked.px, y: picked.py },
      pocketSize,
    );

    if (!didCarve) continue;

    // Place hidden passage fixture at connector
    const cI = idxOf(W, picked.cx, picked.cy);
    ft2[cI] = 9; // hidden passage
    fid2[cI] = secretId;
    fparam2[cI] = 0;

    // Place lever fixture
    const lI = idxOf(W, leverSpot.x, leverSpot.y);
    ft2[lI] = 6;
    fid2[lI] = leverId;
    fparam2[lI] = 0;

    // Validate reachability
    const goal = findPocketGoal({ x: picked.px, y: picked.py }, pocketSize);
    if (!goal) continue;

    const goalI = idxOf(W, goal.x, goal.y);

    const reachPre = computeReachable(
      { width: W, height: H, masks: { solid: solid2 } } as any,
      ft2,
      fid2,
      start,
      new Set(),
    );

    const revealed = new Set<number>([secretId]);

    const reachPost = computeReachable(
      { width: W, height: H, masks: { solid: solid2 } } as any,
      ft2,
      fid2,
      start,
      revealed,
    );

    const reachability: ReachabilityStats = {
      start,
      connector: { x: picked.cx, y: picked.cy },
      pocketCenter: { x: picked.px, y: picked.py },
      goal,
      reachablePre: !!reachPre[goalI],
      reachablePost: !!reachPost[goalI],
      shortestPathPost: reachPost[goalI]
        ? computeShortestPathDistance(
            { width: W, height: H, masks: { solid: solid2 } } as any,
            ft2,
            fid2,
            start,
            revealed,
            goal,
          )
        : null,
    };

    lastReachability = reachability;

    if (reachability.reachablePre) {
      preReachableCount++;
      continue; // NEW: try another candidate instead of failing the pattern
    }

    if (!reachability.reachablePost) {
      postUnreachableCount++;
      continue; // try another candidate
    }

    // ---- COMMIT ----
    carvePocketAndConnector(
      dungeon,
      { x: picked.cx, y: picked.cy },
      { x: picked.px, y: picked.py },
      pocketSize,
    );

    // Place hidden passage fixture
    ft[cI] = 9;
    fid[cI] = secretId;
    fparam[cI] = 0;

    // Place lever fixture
    ft[lI] = 6;
    fid[lI] = leverId;
    fparam[lI] = 0;

    // Add meta entries
    secrets.push({
      id: secretId,
      x: picked.cx,
      y: picked.cy,
      roomId: 0,
    });
    levers.push({
      id: leverId,
      x: leverSpot.x,
      y: leverSpot.y,
      roomId: 0,
    });

    // Circuit: LEVER -> HIDDEN(REVEAL), PERSISTENT
    circuitsById.set(secretId, {
      id: secretId,
      logic: { type: "OR" },
      behavior: { mode: "PERSISTENT" },
      triggers: [{ kind: "LEVER", refId: leverId }],
      targets: [{ kind: "HIDDEN", refId: secretId, effect: "REVEAL" }],
    });

    return { ok: true, didCarve: true, reachability };
  }

  // If we get here, we tried N candidates and none validated.
  // Prefer returning the most informative reason based on observed failure modes.
  if (
    preReachableCount > 0 &&
    postUnreachableCount === 0 &&
    leverSpotFailCount === 0
  ) {
    return {
      ok: false,
      didCarve: false,
      reason: `Pocket goal already reachable pre-reveal (preview). Tried ${attempts} candidates.`,
      reachability: lastReachability,
    };
  }

  if (postUnreachableCount > 0) {
    return {
      ok: false,
      didCarve: false,
      reason: `Pocket goal not reachable post-reveal (preview). Tried ${attempts} candidates.`,
      reachability: lastReachability,
    };
  }

  if (leverSpotFailCount > 0) {
    return {
      ok: false,
      didCarve: false,
      reason: `No lever spot found for any candidate (preview). Tried ${attempts} candidates.`,
      reachability: lastReachability,
    };
  }

  return {
    ok: false,
    didCarve: false,
    reason: `Failed to validate any connector candidate (preview). Tried ${attempts} candidates.`,
    reachability: lastReachability,
  };
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function computeShortestPathDistance(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  featureId: Uint8Array,
  start: Point,
  hiddenRevealedIds: Set<number>,
  goal: Point,
): number | null {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  const si = idxOf(W, start.x, start.y);
  const gi = idxOf(W, goal.x, goal.y);
  if (solid[si] === 255) return null;
  if (solid[gi] === 255) return null;

  const dist = new Int32Array(W * H);
  dist.fill(-1);

  // Queue using typed arrays for deterministic iteration.
  const qx = new Int16Array(W * H);
  const qy = new Int16Array(W * H);
  let qh = 0;
  let qt = 0;

  dist[si] = 0;
  qx[qt] = start.x;
  qy[qt] = start.y;
  qt++;

  while (qh < qt) {
    const x = qx[qh];
    const y = qy[qh];
    qh++;

    const i = idxOf(W, x, y);
    const base = dist[i];
    if (i === gi) return base;

    for (const d of cardinalDirs()) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!inBounds(W, H, nx, ny)) continue;
      const ni = idxOf(W, nx, ny);
      if (dist[ni] !== -1) continue;
      if (solid[ni] === 255) continue;

      const t = featureType[ni] | 0;
      const id = featureId[ni] | 0;

      // doors: treat closed for validation
      if (t === 4 && id !== 0) continue;

      // hidden: blocks until revealed
      if (t === 9 && id !== 0 && !hiddenRevealedIds.has(id)) continue;

      dist[ni] = base + 1;
      qx[qt] = nx;
      qy[qt] = ny;
      qt++;
    }
  }

  return null;
}

function clampOdd(n: number) {
  return n % 2 === 0 ? n + 1 : n;
}

function idxOf(W: number, x: number, y: number) {
  return y * W + x;
}

function inBounds(W: number, H: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function manhattan(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cardinalDirs() {
  return [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
}

function findAnyFloorInRect(
  dungeon: BspDungeonOutputs,
  r: { x: number; y: number; w: number; h: number },
): Point | null {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inBounds(W, H, x, y)) continue;
      const i = idxOf(W, x, y);
      if (solid[i] !== 255) return { x, y };
    }
  }
  return null;
}

function computeReachable(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  featureId: Uint8Array,
  start: Point,
  hiddenRevealedIds: Set<number>,
): Uint8Array {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  const seen = new Uint8Array(W * H);
  const q: Point[] = [];

  const si = idxOf(W, start.x, start.y);
  if (solid[si] === 255) return seen;

  seen[si] = 1;
  q.push(start);

  while (q.length) {
    const p = q.pop()!;
    for (const d of cardinalDirs()) {
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      if (!inBounds(W, H, nx, ny)) continue;
      const ni = idxOf(W, nx, ny);
      if (seen[ni]) continue;

      if (solid[ni] === 255) continue;

      const t = featureType[ni] | 0;
      const id = featureId[ni] | 0;

      // doors: treat closed for validation
      if (t === 4 && id !== 0) continue;

      // hidden: blocks until revealed
      if (t === 9 && id !== 0 && !hiddenRevealedIds.has(id)) continue;

      seen[ni] = 1;
      q.push({ x: nx, y: ny });
    }
  }

  return seen;
}

function pocketSolidnessScore(
  dungeon: BspDungeonOutputs,
  center: Point,
  size: number,
) {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  const half = Math.floor(size / 2);
  let total = 0;
  let solidCount = 0;

  for (let y = center.y - half; y <= center.y + half; y++) {
    for (let x = center.x - half; x <= center.x + half; x++) {
      if (!inBounds(W, H, x, y)) continue;
      total++;
      const i = idxOf(W, x, y);
      if (solid[i] === 255) solidCount++;
    }
  }

  if (!total) return 0;
  return solidCount / total;
}

function carvePocketAndConnector(
  dungeon: BspDungeonOutputs,
  connector: Point,
  pocketCenter: Point,
  pocketSize: number,
): boolean {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  const half = Math.floor(pocketSize / 2);

  // Carve pocket area
  for (let y = pocketCenter.y - half; y <= pocketCenter.y + half; y++) {
    for (let x = pocketCenter.x - half; x <= pocketCenter.x + half; x++) {
      if (!inBounds(W, H, x, y)) return false;
      const i = idxOf(W, x, y);
      solid[i] = 0;
    }
  }

  // Carve connector tile (was wall)
  const ci = idxOf(W, connector.x, connector.y);
  solid[ci] = 0;

  return true;
}

function findPocketGoal(pocketCenter: Point, pocketSize: number): Point | null {
  // Keep it simple: center tile
  return { x: pocketCenter.x, y: pocketCenter.y };
}

function chooseLeverSpot(
  rng: PatternRng,
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  featureId: Uint8Array,
  start: Point,
  connector: Point,
  minDist: number,
): Point | null {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  const reach0 = computeReachable(
    dungeon,
    featureType,
    featureId,
    start,
    new Set(),
  );

  // Collect candidate reachable floor tiles far enough from connector and not occupied.
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idxOf(W, x, y);
      if (!reach0[i]) continue;
      if (solid[i] === 255) continue;
      if ((featureType[i] | 0) !== 0) continue;

      const dc = manhattan({ x, y }, connector);
      if (dc < minDist) continue;

      const score = dc + Math.min(20, manhattan({ x, y }, start));
      candidates.push({ x, y, score });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const topN = Math.min(25, candidates.length);
  const pick = candidates[rng.nextInt(0, topN - 1)]!;
  return { x: pick.x, y: pick.y };
}

// ============================================================================
// NEXT WORK (PLANNED) — Easy-win non-carving patterns
// ============================================================================

export type LeverOpensDoorPatternOptions = {
  maxAttempts?: number;
};

export type PlateOpensDoorPatternOptions = {
  maxAttempts?: number;
  inverted?: boolean;
};

/**
 * Encode plate config into featureParam (bitfield).
 * Mirrors the encoding used in mazeGen.ts for consistency:
 * bit0: modeToggle (1=toggle, 0=momentary)
 * bit1: activatedByPlayer
 * bit2: activatedByBlock
 * bit3: inverted
 */
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

export function findNearestRoomId(
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

    // top + bottom edges
    for (let x = x0; x <= x1; x++) {
      for (const y of [y0, y1]) {
        if (!inBounds(W, H, x, y)) continue;
        const v = regionId[idxOf(W, x, y)] | 0;
        if (v !== 0) return v;
      }
    }
    // left + right edges (excluding corners already checked)
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

function sampleRoomFloorNoFeatures(
  rng: PatternRng,
  dungeon: BspDungeonOutputs,
  room: BspDungeonOutputs["meta"]["rooms"][number],
  featureType: Uint8Array,
  tries = 80,
): Point | null {
  const W = dungeon.width;
  const H = dungeon.height;

  for (let k = 0; k < tries; k++) {
    const x = rng.nextInt(room.x + 1, room.x + room.w - 2);
    const y = rng.nextInt(room.y + 1, room.y + room.h - 2);
    if (!inBounds(W, H, x, y)) continue;

    const i = idxOf(W, x, y);
    if (dungeon.masks.solid[i] !== 0) continue;
    if ((featureType[i] | 0) !== 0) continue;
    return { x, y };
  }

  return null;
}

function sampleAdjacentFloorNoFeatures(
  rng: PatternRng,
  dungeon: BspDungeonOutputs,
  p: Point,
  featureType: Uint8Array,
): Point | null {
  const W = dungeon.width;
  const H = dungeon.height;

  // Randomize direction order a bit
  const dirs = cardinalDirs();
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = dirs[i]!;
    dirs[i] = dirs[j]!;
    dirs[j] = tmp;
  }

  for (const d of dirs) {
    const x = p.x + d.dx;
    const y = p.y + d.dy;
    if (!inBounds(W, H, x, y)) continue;
    const ii = idxOf(W, x, y);
    if (dungeon.masks.solid[ii] !== 0) continue;
    if ((featureType[ii] | 0) !== 0) continue;
    return { x, y };
  }

  return null;
}

/**
 * Pattern: Lever opens door (non-carving)
 * (Kept as-is in your rollback; safe to keep even if not used by mazeGen.)
 */
export function applyLeverOpensDoorPattern(args: {
  rng: PatternRng;
  dungeon: BspDungeonOutputs;
  rooms: BspDungeonOutputs["meta"]["rooms"];
  entranceRoomId: number;

  featureType: Uint8Array;
  featureId: Uint8Array;
  featureParam: Uint8Array;

  doors: ContentOutputs["meta"]["doors"];
  levers: ContentOutputs["meta"]["levers"];
  circuitsById: Map<number, CircuitDef>;

  allocId: () => number;
  options?: LeverOpensDoorPatternOptions;
}): PatternResult {
  const {
    rng,
    dungeon,
    rooms,
    entranceRoomId,
    featureType: ft,
    featureId: fid,
    featureParam: fparam,
    doors,
    levers,
    circuitsById,
    allocId,
  } = args;

  const maxAttempts = Math.max(1, args.options?.maxAttempts ?? 60);
  const { candidates, stats } = findDoorSiteCandidatesAndStatsFromCorridors(
    dungeon,
    ft,
    {
      minDistToWall: 1,
      preferCorridor: true,
      trimEnds: 2, // IMPORTANT: ignore first/last N tiles
      duplicateBias: 1,
      maxRadius: 10,
    },
  );

  if (!candidates.length) {
    return {
      ok: false,
      didCarve: false,
      reason: "Lever pattern: No valid door sites found.",
      stats: { doorSites: stats },
    };
  }

  const entranceRoom = rooms[entranceRoomId - 1] ?? rooms[0];
  const start = entranceRoom ? findAnyFloorInRect(dungeon, entranceRoom) : null;
  if (!start) {
    return { ok: false, didCarve: false, reason: "No entrance start tile." };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const site = candidates[rng.nextInt(0, candidates.length - 1)]!;
    const doorId = allocId();

    const di = idxOf(dungeon.width, site.x, site.y);
    if ((ft[di] | 0) !== 0) continue;

    // Place the door fixture
    ft[di] = 4;
    fid[di] = doorId;
    fparam[di] = 2; // "kind" hint (debug/visual only)

    doors.push({
      id: doorId,
      x: site.x,
      y: site.y,
      roomA: site.roomA,
      roomB: site.roomB,
      kind: 2,
      depth: 0,
    });

    // Place lever inside roomA
    const roomA = rooms[site.roomA - 1] ?? entranceRoom;
    if (!roomA) {
      // rollback door
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();
      continue;
    }

    const leverP = sampleRoomFloorNoFeatures(rng, dungeon, roomA, ft);
    if (!leverP) {
      // rollback door
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();
      continue;
    }

    const li = idxOf(dungeon.width, leverP.x, leverP.y);
    ft[li] = 6;
    fid[li] = doorId;
    fparam[li] = 0;

    levers.push({ id: doorId, x: leverP.x, y: leverP.y, roomId: site.roomA });

    circuitsById.set(doorId, {
      id: doorId,
      logic: { type: "OR" },
      behavior: { mode: "TOGGLE" },
      triggers: [{ kind: "LEVER", refId: doorId }],
      targets: [{ kind: "DOOR", refId: doorId, effect: "TOGGLE" }],
    });

    void computeReachable(dungeon, ft, fid, start, new Set());

    return { ok: true, didCarve: false, stats: { doorSites: stats } };
  }

  return {
    ok: false,
    didCarve: false,
    reason: "Failed to place lever+door within attempt budget.",
    stats: { doorSites: stats },
  };
}

/**
 * Pattern: Plate opens door (non-carving)
 * - Places a DOOR on a corridor floor connector.
 * - Places a PLATE inside one room, and places a BLOCK adjacent to it.
 * - Wires circuit: PLATE -> DOOR(OPEN) with MOMENTARY behavior.
 *
 * Note:
 * - Plate.pressed is DERIVED from block occupancy at runtime.
 */
export function applyPlateOpensDoorPattern(args: {
  rng: PatternRng;
  dungeon: BspDungeonOutputs;
  rooms: BspDungeonOutputs["meta"]["rooms"];

  featureType: Uint8Array;
  featureId: Uint8Array;
  featureParam: Uint8Array;

  doors: ContentOutputs["meta"]["doors"];
  plates: ContentOutputs["meta"]["plates"];
  blocks: ContentOutputs["meta"]["blocks"];
  circuitsById: Map<number, CircuitDef>;

  allocId: () => number;
  options?: PlateOpensDoorPatternOptions;
}): PatternResult {
  const {
    rng,
    dungeon,
    rooms,
    featureType: ft,
    featureId: fid,
    featureParam: fparam,
    doors,
    plates,
    blocks,
    circuitsById,
    allocId,
  } = args;

  const maxAttempts = Math.max(1, args.options?.maxAttempts ?? 80);
  const inverted = !!args.options?.inverted;

  const { candidates, stats } = findDoorSiteCandidatesAndStatsFromCorridors(
    dungeon,
    ft,
    {
      minDistToWall: 1,
      preferCorridor: true,
      trimEnds: 2, // IMPORTANT: ignore first/last N tiles
      duplicateBias: 1,
      maxRadius: 10,
    },
  );

  if (!candidates.length) {
    return {
      ok: false,
      didCarve: false,
      reason: "Plate Pattern: No valid door sites found.",
      stats: { doorSites: stats },
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const site = candidates[rng.nextInt(0, candidates.length - 1)]!;
    const circuitId = allocId();

    const di = idxOf(dungeon.width, site.x, site.y);
    if ((ft[di] | 0) !== 0) continue;

    // Place door fixture
    ft[di] = 4;
    fid[di] = circuitId;
    fparam[di] = 0;

    doors.push({
      id: circuitId,
      x: site.x,
      y: site.y,
      roomA: site.roomA,
      roomB: site.roomB,
      kind: 0 as any, // “pattern door” (not a Milestone-2 locked/lever gate)
      depth: 0,
    });

    // Place plate in roomA
    const roomA = rooms[site.roomA - 1];
    if (!roomA) {
      // rollback door
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();
      continue;
    }

    const plateP = sampleRoomFloorNoFeatures(rng, dungeon, roomA, ft);
    if (!plateP) {
      // rollback door
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();
      continue;
    }

    const plateCfg = {
      mode: "momentary" as const,
      activatedByPlayer: false,
      activatedByBlock: true,
      inverted,
    };

    const pi = idxOf(dungeon.width, plateP.x, plateP.y);
    ft[pi] = 7;
    fid[pi] = circuitId;
    fparam[pi] = encodePlateParam(plateCfg);

    plates.push({
      id: circuitId,
      x: plateP.x,
      y: plateP.y,
      roomId: site.roomA,
      mode: plateCfg.mode,
      activatedByPlayer: plateCfg.activatedByPlayer,
      activatedByBlock: plateCfg.activatedByBlock,
      activatedByBlockOrPlayer:
        plateCfg.activatedByPlayer && plateCfg.activatedByBlock,
      inverted: plateCfg.inverted,
    });

    // Place a block adjacent to the plate
    const blockP = sampleAdjacentFloorNoFeatures(rng, dungeon, plateP, ft);
    if (!blockP) {
      // rollback door + plate
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();

      ft[pi] = 0;
      fid[pi] = 0;
      fparam[pi] = 0;
      plates.pop();

      continue;
    }

    const blockId = allocId();
    const bi = idxOf(dungeon.width, blockP.x, blockP.y);
    ft[bi] = 8;
    fid[bi] = blockId;
    fparam[bi] = 0;

    blocks.push({
      id: blockId,
      x: blockP.x,
      y: blockP.y,
      roomId: site.roomA,
      weightClass: 0,
    });

    // Circuit: PLATE -> DOOR(OPEN), momentary
    circuitsById.set(circuitId, {
      id: circuitId,
      logic: { type: "OR" },
      behavior: { mode: "MOMENTARY" },
      triggers: [{ kind: "PLATE", refId: circuitId }],
      targets: [{ kind: "DOOR", refId: circuitId, effect: "OPEN" }],
    });

    return { ok: true, didCarve: false, stats: { doorSites: stats } };
  }

  return {
    ok: false,
    didCarve: false,
    reason: "Failed to place plate+block+door within attempt budget.",
    stats: { doorSites: stats },
  };
}
