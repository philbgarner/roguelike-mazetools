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

import type {
  DoorKind,
  BspDungeonOutputs,
  ContentOutputs,
  CircuitDef,
} from "./mazeGen";
import { clamp255 } from "./mazeGen";
import {
  findDoorSiteCandidatesAndStatsFromCorridors,
  type DoorSiteStatsBundle,
} from "./doorSites";
import type {
  GateEdgeReuseDiagV1,
  LeverBehindOwnGateDiagV1,
} from "./batchStats";
import { graphEdgeId } from "./graphEdgeId";
import {
  orientRoomsByDistance,
  pickOrderedDoorSiteFromCorridors,
} from "./patternDoorPlacement";

type Point = { x: number; y: number };

const MAX_MAIN_EDGES_TO_TRY = 32; // hard cap for runtime
const MAX_BRANCH_TRIES_PER_MAIN_EDGE = 6; // prevents “edge budget burn”
const MAX_DOOR_SITE_TRIES_PER_BRANCH = 12; // keep cheap/local
const MAX_GATE_SITE_TRIES_PER_MAIN_EDGE = 24; // Phase 3 polish: avoid rare gate-site degeneracy

type RoomEdge = { a: number; b: number };

function normEdge(a: number, b: number): RoomEdge {
  return a < b ? { a, b } : { a: b, b: a };
}

function shuffleInPlace<T>(arr: T[], rng: PatternRng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

export type PuzzleRole =
  | "MAIN_PATH_GATE"
  | "OPTIONAL_REWARD"
  | "SHORTCUT"
  | "FORESHADOW";

export type RoleRuleId =
  // Role integrity
  | "ROLE_MISSING"
  | "ROLE_UNKNOWN"
  | "ROLE_DUPLICATE"

  // MAIN_PATH_GATE quality
  | "MAIN_TRIVIAL" // topoDepth too small
  | "MAIN_LATE_TRIVIAL" // trivial too deep in dungeon
  | "MAIN_TOO_DEEP_EARLY" // overly chained too early (rare but useful)

  // OPTIONAL_REWARD quality
  | "OPTIONAL_TRIVIAL" // optional behind no meaningful logic
  | "OPTIONAL_OVERGATED_BY_MAIN" // optional depends on main gate chains

  // SHORTCUT quality
  | "SHORTCUT_NOT_REDUCING_DISTANCE" // doesn’t reduce roomDistance meaningfully

  // FORESHADOW quality
  | "FORESHADOW_AFTER_MAIN" // appears after its “paid-off” gate
  | "FORESHADOW_TOO_DEEP"; // too complex for foreshadow slot

export type CircuitAnchorV1 = {
  anchorRoomId: number | null; // null if cannot map (should be rare)
  roomDepth: number | null; // BFS distance from entrance room
  depthN: number | null; // roomDepth / maxDepth  (0..1)
  onMainPath: boolean | null;

  // Optional: if a door is involved and you can map it:
  doorId?: number; // meta.doors[].id if applicable
  mainPathEdgeDepth?: number; // meta.doors[].depth (0..)
};

export type CircuitRoleRecordV1 = {
  circuitIndex: number; // aligns to meta.circuits index (stable)
  role: PuzzleRole | null;

  anchor: CircuitAnchorV1;

  // Pulled from CircuitEvalDiagnostics.perCircuit
  topoDepth: number; // longest SIGNAL prereq chain length (0..)
  signalDepCount: number;
  participatesInCycle: boolean;
  blockedByCycle: boolean;
};

export type IntroGatePatternOptions = {
  requireThroat: boolean;
  maxAttempts?: number;
};

export type RoleRuleHitV1 = {
  ruleId: RoleRuleId;
  role: PuzzleRole | null;
  circuitIndex: number;

  // Helps UI + batch debugging without huge payloads
  depthN: number | null;
  roomDepth: number | null;
  topoDepth: number;

  // Short stable code for aggregation; optional human string for UI only
  code: string; // e.g. "TD_LT_MIN@late"
  detail?: string; // keep this short
};

export type RoleSummaryStatsV1 = {
  schemaVersion: 1;

  roleCounts: Record<PuzzleRole, number>;
  roleMissingCount: number;

  // Basic depth stats by role (for histograms in batch later)
  topoDepthByRole: Record<
    PuzzleRole,
    {
      min: number;
      p25: number;
      median: number;
      p75: number;
      max: number;
      avg: number;
    }
  >;

  // “Where these roles occur”
  depthNByRole: Record<
    PuzzleRole,
    {
      min: number;
      p25: number;
      median: number;
      p75: number;
      max: number;
      avg: number;
    }
  >;

  // Rule tallies: batch-friendly
  ruleCounts: Record<RoleRuleId, number>;
};

export type RoleDiagnosticsV1 = {
  schemaVersion: 1;

  // Traceability (mirrors your CircuitEvalDiagnostics pattern)
  seedUsed?: number;
  entranceRoomId?: number;
  farthestRoomId?: number;
  maxDepth?: number;

  // One record per circuit (stable index ordering)
  perCircuit: CircuitRoleRecordV1[];

  // Any rule hits (warnings at first)
  hits: RoleRuleHitV1[];

  // Compact summary for batch aggregation + UI headline
  summary: RoleSummaryStatsV1;
};

export type RoleThresholdsV1 = {
  schemaVersion: 1;

  main: {
    // topoDepth floor by depthN segment
    minTopoDepth: Array<{ atLeastDepthN: number; minTopoDepth: number }>;

    // “late trivial” definition
    lateStartsAtDepthN: number; // e.g. 0.55
    lateMinTopoDepth: number; // e.g. 2

    // guardrail: too-deep-too-early (rare)
    earlyEndsAtDepthN: number; // e.g. 0.20
    earlyMaxTopoDepth: number; // e.g. 3
  };

  optional: {
    // optional should have at least *some* meaning later; early can be fluff
    lateStartsAtDepthN: number; // e.g. 0.60
    lateMinTopoDepth: number; // e.g. 1
  };

  foreshadow: {
    // foreshadow should be simple and early-ish
    maxTopoDepth: number; // e.g. 1
    mustOccurBeforeDepthN: number; // e.g. 0.45
  };

  shortcut: {
    // must improve travel meaningfully (room-distance reduction)
    minRoomDepthReduction: number; // e.g. 2 rooms
  };
};

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
      gateEdgeReuse?: GateEdgeReuseDiagV1;
      leverBehindOwnGate?: LeverBehindOwnGateDiagV1;
    }
  | {
      ok: false;
      didCarve: false;
      reason: string;
      stats?: DoorSiteStatsBundle;
      reachability?: ReachabilityStats;
      gateEdgeReuse?: GateEdgeReuseDiagV1;
      leverBehindOwnGate?: LeverBehindOwnGateDiagV1;
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
  gateEdgeReuse?: GateEdgeReuseDiagV1;
  leverBehindOwnGate?: LeverBehindOwnGateDiagV1;
};

export type PatternEntry =
  | PatternFn
  | {
      name: string;
      run: PatternFn;
    };

export const DEFAULT_ROLE_THRESHOLDS_V1: RoleThresholdsV1 = {
  schemaVersion: 1,

  main: {
    // Ramp: early can be topoDepth 0/1, but by midgame we want real chaining.
    minTopoDepth: [
      { atLeastDepthN: 0.0, minTopoDepth: 0 },
      { atLeastDepthN: 0.25, minTopoDepth: 1 },
      { atLeastDepthN: 0.45, minTopoDepth: 2 },
      { atLeastDepthN: 0.7, minTopoDepth: 3 },
    ],

    lateStartsAtDepthN: 0.55,
    lateMinTopoDepth: 2,

    earlyEndsAtDepthN: 0.2,
    earlyMaxTopoDepth: 3,
  },

  optional: {
    // Optional rewards can be “easy candy” early, but shouldn’t stay trivial late.
    lateStartsAtDepthN: 0.6,
    lateMinTopoDepth: 1,
  },

  foreshadow: {
    // Foreshadow should not be a big chain; it’s a teaching moment.
    maxTopoDepth: 1,
    mustOccurBeforeDepthN: 0.45,
  },

  shortcut: {
    // If a shortcut doesn’t reduce distance by at least 2 rooms, it’s cosmetic.
    minRoomDepthReduction: 2,
  },
};

// ---- Phase 3 (Milestone 4): Role-aware composition patterns ----

export type GateThenOptionalRewardPatternOptions = {
  requireThroat: boolean;
  maxAttempts?: number;
  rewardLootTier?: number; // default 2
};

// Returns roomId (1-based) if point is in a room; otherwise 0.
//
// Preference order:
// 1) dungeon.masks.regionId (if present and non-zero at p)
// 2) rectangle containment against dungeon.meta.rooms[]
//
// Safe for corridors: will return 0.
export function whichRoomIdForPoint(
  dungeon: {
    width: number;
    height: number;
    masks?: { regionId?: Uint8Array };
    meta?: { rooms?: Array<{ x: number; y: number; w: number; h: number }> };
  },
  x: number,
  y: number,
): number {
  const W = dungeon.width | 0;
  const H = dungeon.height | 0;

  if (x < 0 || y < 0 || x >= W || y >= H) return 0;

  // 1) Prefer regionId mask if available
  const rid = dungeon.masks?.regionId;
  if (rid && rid.length === W * H) {
    const v = rid[y * W + x] | 0;
    if (v !== 0) return v; // already a 1..N roomId
  }

  // 2) Fallback: room rectangle containment
  const rooms = dungeon.meta?.rooms ?? [];
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]!;
    // inclusive bounds: [x, x+w) and [y, y+h)
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return (i + 1) | 0; // roomId is 1-based
    }
  }

  return 0;
}

function edgeKey(a: number, b: number) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}-${hi}`;
}

function buildMainPathEdgeSet(mainPathRoomIds: number[]) {
  const s = new Set<string>();
  for (let i = 0; i < mainPathRoomIds.length - 1; i++) {
    const a = mainPathRoomIds[i]!;
    const b = mainPathRoomIds[i + 1]!;
    s.add(edgeKey(a, b));
  }
  return s;
}

function pickBranchNeighborOffMainPath(
  roomGraph: Map<number, Set<number>>,
  mainPathSet: Set<number>,
  fromRoomId: number,
  excludeRoomId: number,
  rng: PatternRng,
): number | null {
  const nbrs = Array.from(roomGraph.get(fromRoomId) ?? []);
  const candidates = nbrs.filter(
    (n) => n !== excludeRoomId && !mainPathSet.has(n),
  );
  if (!candidates.length) return null;
  return candidates[rng.nextInt(0, candidates.length - 1)]!;
}

export function applyIntroGatePattern(args: {
  rng: PatternRng;
  dungeon: BspDungeonOutputs;
  rooms: BspDungeonOutputs["meta"]["rooms"];

  entranceRoomId: number;
  roomGraph: Map<number, Set<number>>;
  roomDistance: Map<number, number>;
  mainPathRoomIds: number[];

  featureType: Uint8Array;
  featureId: Uint8Array;
  featureParam: Uint8Array;

  doors: ContentOutputs["meta"]["doors"];
  levers: ContentOutputs["meta"]["levers"];

  circuitsById: Map<number, CircuitDef>;
  circuitRoles: Record<number, PuzzleRole>;

  allocId: () => number;
  options?: IntroGatePatternOptions;
}): PatternResult {
  const {
    rng,
    dungeon,
    rooms,
    entranceRoomId,
    roomDistance,
    mainPathRoomIds,
    featureType: ft,
    featureId: fid,
    featureParam: fparam,
    doors,
    levers,
    circuitsById,
    circuitRoles,
    allocId,
    options,
  } = args;

  const maxAttempts = Math.max(1, args.options?.maxAttempts ?? 60);

  const { candidates, stats } = findDoorSiteCandidatesAndStatsFromCorridors(
    dungeon,
    ft,
    {
      minDistToWall: 1,
      preferCorridor: true,
      trimEnds: 2,
      duplicateBias: 1,
      maxRadius: 10,
      requireThroat: (options && options.requireThroat) ?? false,
    },
  );

  if (!candidates.length) {
    return {
      ok: false,
      didCarve: false,
      reason: "Intro gate: No valid corridor door sites.",
      stats: { doorSites: stats },
    };
  }

  const edgeToSites = new Map<string, typeof candidates>();
  for (const s of candidates) {
    const k = edgeKey(s.roomA, s.roomB);
    const arr = edgeToSites.get(k);
    if (arr) arr.push(s);
    else edgeToSites.set(k, [s]);
  }

  const entranceRoom = rooms[entranceRoomId - 1] ?? rooms[0];
  const start = entranceRoom ? findAnyFloorInRect(dungeon, entranceRoom) : null;
  if (!start) {
    return {
      ok: false,
      didCarve: false,
      reason: "Intro gate: No entrance tile.",
    };
  }

  const reachClosed0 = computeReachable(dungeon, ft, fid, start, new Set());

  const mainEdges: RoomEdge[] = [];
  for (let i = 0; i < mainPathRoomIds.length - 1; i++) {
    mainEdges.push(normEdge(mainPathRoomIds[i]!, mainPathRoomIds[i + 1]!));
  }

  mainEdges.sort((a, b) => {
    const da = Math.max(roomDistance.get(a.a) ?? 0, roomDistance.get(a.b) ?? 0);
    const db = Math.max(roomDistance.get(b.a) ?? 0, roomDistance.get(b.b) ?? 0);
    return da - db;
  });

  const prefix = Math.min(mainEdges.length, 4);
  for (let i = prefix - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [mainEdges[i], mainEdges[j]] = [mainEdges[j], mainEdges[i]];
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const edge = mainEdges.length
      ? mainEdges[rng.nextInt(0, Math.max(0, mainEdges.length - 1))]!
      : null;
    if (!edge) break;

    const sites = edgeToSites.get(edgeKey(edge.a, edge.b));
    if (!sites || sites.length === 0) continue;

    const site = sites[rng.nextInt(0, sites.length - 1)]!;
    const o = orientRoomsByDistance(site.roomA, site.roomB, roomDistance);
    if (!o) continue; // no consistent ordering (unreachable room or equal depth)

    const doorId = allocId();

    const di = idxOf(dungeon.width, site.x, site.y);
    if ((ft[di] | 0) !== 0) continue;

    // Place door
    ft[di] = 4;
    fid[di] = doorId;
    fparam[di] = 2;

    doors.push({
      id: doorId,
      x: site.x,
      y: site.y,
      roomA: o.triggerRoomId, // earlier side
      roomB: o.gateRoomId, // later side
      kind: 2,
      depth: o.gateDepth,
    });

    // Enforce: lever must be reachable with doors closed AND must be in trigger room
    const leverRoom = rooms[o.triggerRoomId - 1] ?? entranceRoom;
    if (!leverRoom) {
      // rollback door
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();
      continue;
    }

    const leverP = sampleReachableRoomFloorNoFeatures(
      rng,
      dungeon,
      leverRoom,
      ft,
      reachClosed0,
      180,
    );

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

    levers.push({
      id: doorId,
      x: leverP.x,
      y: leverP.y,
      roomId: o.triggerRoomId,
    });

    circuitsById.set(doorId, {
      id: doorId,
      logic: { type: "OR" },
      behavior: { mode: "TOGGLE" },
      triggers: [{ kind: "LEVER", refId: doorId }],
      targets: [{ kind: "DOOR", refId: doorId, effect: "TOGGLE" }],
      outputs: [{ kind: "SIGNAL", id: doorId, name: "INTRO_GATE_ACTIVE" }],
    });

    circuitRoles[doorId] = "MAIN_PATH_GATE";

    return { ok: true, didCarve: false, stats: { doorSites: stats } };
  }

  return {
    ok: false,
    didCarve: false,
    reason:
      "Intro gate: No viable main-path door+reachable lever placement found.",
    stats: { doorSites: stats },
  };
}

/**
 * Composition Pattern: MAIN_PATH_GATE -> OPTIONAL_REWARD (signal-gated)
 *
 * - Places a lever-toggle door on a main-path edge.
 * - Places a branch door to a non-main room off the deeper side.
 * - Places a plate+block in the deeper-side main room.
 * - Wires branch door circuit as: (PLATE && SIGNAL(gate ACTIVE)) -> OPEN(branch door)
 * - Places a chest in the branch room.
 * - Assigns roles for both circuits via content.meta.circuitRoles.
 */
export function applyGateThenOptionalRewardPattern(args: {
  rng: PatternRng;
  dungeon: BspDungeonOutputs;
  rooms: BspDungeonOutputs["meta"]["rooms"];

  entranceRoomId: number;
  roomGraph: Map<number, Set<number>>;
  roomDistance: Map<number, number>;
  mainPathRoomIds: number[];

  featureType: Uint8Array;
  featureId: Uint8Array;
  featureParam: Uint8Array;
  lootTier: Uint8Array;

  doors: ContentOutputs["meta"]["doors"];
  levers: ContentOutputs["meta"]["levers"];
  plates: ContentOutputs["meta"]["plates"];
  blocks: ContentOutputs["meta"]["blocks"];
  chests: ContentOutputs["meta"]["chests"];

  circuitsById: Map<number, CircuitDef>;
  circuitRoles: Record<number, PuzzleRole>;

  allocId: () => number;
  options?: GateThenOptionalRewardPatternOptions;
}): PatternResult {
  const {
    rng,
    dungeon,
    rooms,
    entranceRoomId,
    roomGraph,
    roomDistance,
    mainPathRoomIds,
    featureType: ft,
    featureId: fid,
    featureParam: fparam,
    lootTier,
    doors,
    levers,
    plates,
    blocks,
    chests,
    circuitsById,
    circuitRoles,
    allocId,
    options,
  } = args;

  const rewardTier = clamp255(args.options?.rewardLootTier ?? 2);

  // --- Gate-edge reuse diagnostics (no behavior change) ---
  const existingDoorEdges = new Set<string>();
  for (const d of doors) existingDoorEdges.add(graphEdgeId(d.roomA, d.roomB));

  const placedEdgesThisCommit = new Set<string>();
  const gateEdgeReuse: GateEdgeReuseDiagV1 = {
    schemaVersion: 1,
    doorsPlaced: 0,
    uniqueEdgesPlaced: 0,
    reusedExistingCount: 0,
    reusedInternalCount: 0,
    reusedEdgeIds: [],
  };

  function noteDoorEdgePlacement(roomA: number, roomB: number) {
    const eid = graphEdgeId(roomA, roomB);
    gateEdgeReuse.doorsPlaced += 1;

    const reusedExisting = existingDoorEdges.has(eid);
    const reusedInternal = placedEdgesThisCommit.has(eid);

    if (reusedExisting) gateEdgeReuse.reusedExistingCount += 1;
    if (reusedInternal) gateEdgeReuse.reusedInternalCount += 1;

    if (
      (reusedExisting || reusedInternal) &&
      gateEdgeReuse.reusedEdgeIds.length < 8
    ) {
      gateEdgeReuse.reusedEdgeIds.push(eid);
    }

    placedEdgesThisCommit.add(eid);
    gateEdgeReuse.uniqueEdgesPlaced = placedEdgesThisCommit.size;
  }

  if (mainPathRoomIds.length < 2) {
    return { ok: false, didCarve: false, reason: "Main path too short." };
  }

  const { candidates, stats } = findDoorSiteCandidatesAndStatsFromCorridors(
    dungeon,
    ft,
    {
      minDistToWall: 1,
      preferCorridor: true,
      trimEnds: 2,
      duplicateBias: 1,
      maxRadius: 10,
      requireThroat: (options && options.requireThroat) ?? false,
    },
  );

  if (!candidates.length) {
    return {
      ok: false,
      didCarve: false,
      reason: "No valid corridor door sites.",
      stats: { doorSites: stats },
    };
  }

  // Build edge -> sites map for fast lookups
  const edgeToSites = new Map<string, typeof candidates>();
  for (const s of candidates) {
    const k = edgeKey(s.roomA, s.roomB);
    const arr = edgeToSites.get(k);
    if (arr) arr.push(s);
    else edgeToSites.set(k, [s]);
  }

  const entranceRoom = rooms[entranceRoomId - 1] ?? rooms[0];
  const start = entranceRoom ? findAnyFloorInRect(dungeon, entranceRoom) : null;
  if (!start) {
    return { ok: false, didCarve: false, reason: "No entrance tile." };
  }

  const reachClosed0 = computeReachable(dungeon, ft, fid, start, new Set());

  // --- Main-edge outer loop setup ---
  const mainEdges: RoomEdge[] = [];
  for (let i = 0; i < mainPathRoomIds.length - 1; i++) {
    mainEdges.push(normEdge(mainPathRoomIds[i]!, mainPathRoomIds[i + 1]!));
  }

  const mainPathSet = new Set<number>(mainPathRoomIds);
  const isBranchableMainEdge = (e: RoomEdge): boolean => {
    const na = roomGraph.get(e.a);
    if (na) for (const n of na) if (!mainPathSet.has(n)) return true;
    const nb = roomGraph.get(e.b);
    if (nb) for (const n of nb) if (!mainPathSet.has(n)) return true;
    return false;
  };

  const branchableMainEdges = mainEdges.filter(isBranchableMainEdge);

  type MainEdgeScore = {
    e: RoomEdge;
    hasAnyUsableBranchSite: boolean;
    usableBranchSiteCount: number;
    isOccupiedByExistingDoor: boolean;
    tie: number;
  };

  const scoreMainEdge = (e: RoomEdge): MainEdgeScore => {
    const occupied = existingDoorEdges.has(graphEdgeId(e.a, e.b));
    let count = 0;

    const endpoints = [e.a, e.b] as const;
    for (const anchor of endpoints) {
      const nbrs = roomGraph.get(anchor);
      if (!nbrs) continue;

      for (const n of nbrs) {
        if (mainPathSet.has(n)) continue;

        const bk = edgeKey(anchor, n);
        const sites = edgeToSites.get(bk);
        if (!sites || !sites.length) continue;

        for (const s of sites) {
          const di = idxOf(dungeon.width, s.x, s.y);
          if ((ft[di] | 0) !== 0) continue;
          count++;
          if (count >= 12) break;
        }
        if (count >= 12) break;
      }
      if (count >= 12) break;
    }

    return {
      e,
      hasAnyUsableBranchSite: count > 0,
      usableBranchSiteCount: count,
      isOccupiedByExistingDoor: occupied,
      tie: rng.nextInt(0, 1_000_000_000),
    };
  };

  const scored = branchableMainEdges.map(scoreMainEdge);
  scored.sort((a, b) => {
    if (a.hasAnyUsableBranchSite !== b.hasAnyUsableBranchSite) {
      return a.hasAnyUsableBranchSite ? -1 : 1;
    }
    if (a.isOccupiedByExistingDoor !== b.isOccupiedByExistingDoor) {
      return a.isOccupiedByExistingDoor ? 1 : -1;
    }
    if (a.usableBranchSiteCount !== b.usableBranchSiteCount) {
      return b.usableBranchSiteCount - a.usableBranchSiteCount;
    }
    return a.tie - b.tie;
  });

  const branchableMainEdgesSorted = scored.map((s) => s.e);

  const maxMainEdges = Math.max(1, args.options?.maxAttempts ?? 80) | 0;
  const mainEdgesToTry = branchableMainEdgesSorted.slice(
    0,
    Math.min(branchableMainEdges.length, MAX_MAIN_EDGES_TO_TRY, maxMainEdges),
  );

  if (!mainEdgesToTry.length) {
    return {
      ok: false,
      didCarve: false,
      reason:
        "No branchable main-path edges (all main-path rooms have no off-main neighbors).",
    };
  }

  let mainEdgesConsidered = 0;
  let mainEdgesWithBranches = 0;
  let mainEdgesWithUsableDoorSites = 0;

  let failGateOccupied = 0;
  let failNoBranchNeighbors = 0;
  let failNoBranchDoorSites = 0;
  let failBranchOccupied = 0;
  let failLever = 0;
  let failPlate = 0;
  let failBlockAdj = 0;
  let failChest = 0;
  let failBranchSameAsGate = 0;
  let failGateEliminatesAllBranchSites = 0;

  // --- Explore edges first ---
  for (const edge of mainEdgesToTry) {
    mainEdgesConsidered++;

    const gateKey = edgeKey(edge.a, edge.b);
    const gateSitesAll = edgeToSites.get(gateKey) ?? [];
    if (!gateSitesAll.length) continue;

    const gateSites = gateSitesAll.slice();
    shuffleInPlace(gateSites, rng);

    let edgeHadBranches = false;
    let edgeHadUsableDoorSite = false;

    const maxGateSiteTries = Math.min(
      MAX_GATE_SITE_TRIES_PER_MAIN_EDGE,
      gateSites.length,
    );

    let succeededOnThisEdge = false;

    for (let gs = 0; gs < maxGateSiteTries && !succeededOnThisEdge; gs++) {
      const gateSite = gateSites[gs]!;
      const gateDi = idxOf(dungeon.width, gateSite.x, gateSite.y);
      if ((ft[gateDi] | 0) !== 0) {
        failGateOccupied++;
        continue;
      }

      const a = gateSite.roomA;
      const b = gateSite.roomB;
      const da = roomDistance.get(a) ?? 9999;
      const db = roomDistance.get(b) ?? 9999;

      const oGate = orientRoomsByDistance(
        gateSite.roomA,
        gateSite.roomB,
        roomDistance,
      );
      if (!oGate) {
        failGateOccupied++;
        continue;
      }
      const shallowRoomId = oGate.triggerRoomId; // earlier side: lever must be here
      const deepRoomId = oGate.gateRoomId; // later side: gated side

      // Try BOTH endpoints: deep then shallow.
      const anchorPlans = [
        { anchor: deepRoomId, exclude: shallowRoomId },
        { anchor: shallowRoomId, exclude: deepRoomId },
      ];

      const plans = anchorPlans
        .map((p) => {
          const nbrs = Array.from(roomGraph.get(p.anchor) ?? []);
          const offMain = nbrs.filter(
            (n) => n !== p.exclude && !mainPathSet.has(n),
          );
          return { ...p, offMain };
        })
        .filter((p) => p.offMain.length > 0);

      if (!plans.length) {
        failNoBranchNeighbors++;
        break; // topology won't change with another gateSite on same edge
      }

      edgeHadBranches = true;

      // Gate-site viability pre-check across BOTH anchors.
      let gateAllowsAnyBranch = false;
      for (const p of plans) {
        for (const br of p.offMain) {
          const bk = edgeKey(p.anchor, br);
          const all = edgeToSites.get(bk) ?? [];
          for (const s of all) {
            if (s.x === gateSite.x && s.y === gateSite.y) continue;
            const di = idxOf(dungeon.width, s.x, s.y);
            if ((ft[di] | 0) !== 0) continue;
            gateAllowsAnyBranch = true;
            break;
          }
          if (gateAllowsAnyBranch) break;
        }
        if (gateAllowsAnyBranch) break;
      }

      if (!gateAllowsAnyBranch) {
        failGateEliminatesAllBranchSites++;
        continue;
      }

      // Small deterministic retry helper
      const trySample = <T>(n: number, fn: () => T | null): T | null => {
        for (let k = 0; k < n; k++) {
          const v = fn();
          if (v) return v;
        }
        return null;
      };

      // Attempt branches: deep-first (plans order)
      for (const p of plans) {
        const offMainShuffled = p.offMain.slice();
        shuffleInPlace(offMainShuffled, rng);

        const branchTryCount = Math.min(
          MAX_BRANCH_TRIES_PER_MAIN_EDGE,
          offMainShuffled.length,
        );

        for (let bi = 0; bi < branchTryCount; bi++) {
          const branchRoomId = offMainShuffled[bi]!;
          const branchKey = edgeKey(p.anchor, branchRoomId);
          const branchSitesAll = edgeToSites.get(branchKey) ?? [];
          if (!branchSitesAll.length) {
            failNoBranchDoorSites++;
            continue;
          }

          const branchSites = branchSitesAll.filter(
            (s) => !(s.x === gateSite.x && s.y === gateSite.y),
          );

          if (!branchSites.length) {
            failBranchSameAsGate += 1;
            failNoBranchDoorSites++;
            continue;
          }

          edgeHadUsableDoorSite = true;

          shuffleInPlace(branchSites, rng);

          const maxBranchSiteTries = Math.min(
            MAX_DOOR_SITE_TRIES_PER_BRANCH,
            branchSites.length,
          );

          for (let si = 0; si < maxBranchSiteTries; si++) {
            const oBranch = orientRoomsByDistance(
              p.anchor,
              branchRoomId,
              roomDistance,
            );
            if (!oBranch) {
              failNoBranchDoorSites++;
              continue;
            }
            // Require: trigger is the anchor (plate lives here), gate is the branch room
            if (
              oBranch.triggerRoomId !== p.anchor ||
              oBranch.gateRoomId !== branchRoomId
            ) {
              // branch room is not deeper than anchor; skip this branch
              failNoBranchDoorSites++;
              continue;
            }

            const branchSite = branchSites[si]!;
            const branchDi = idxOf(dungeon.width, branchSite.x, branchSite.y);
            if ((ft[branchDi] | 0) !== 0) {
              failBranchOccupied++;
              continue;
            }

            const shallowRoom = rooms[shallowRoomId - 1] ?? entranceRoom;
            const branchRoom = rooms[branchRoomId - 1];
            if (!shallowRoom || !branchRoom) {
              failGateOccupied++;
              continue;
            }

            // Plate puzzle lives on the anchor side that owns the branch
            const plateRoomId = p.anchor;
            const plateRoom = rooms[plateRoomId - 1];
            if (!plateRoom) {
              failGateOccupied++;
              continue;
            }

            const leverP = trySample(8, () =>
              sampleReachableRoomFloorNoFeatures(
                rng,
                dungeon,
                shallowRoom,
                ft,
                reachClosed0,
              ),
            );
            if (!leverP) {
              // No reachable lever tile in shallowRoom (with current doors closed).
              // This is exactly the “blocked by other door” scenario — skip this attempt.
              failLever++;
              continue;
            }

            let plateP: Point | null = null;
            let blockP: Point | null = null;

            for (let k = 0; k < 10; k++) {
              const pp = sampleRoomFloorNoFeatures(rng, dungeon, plateRoom, ft);
              if (!pp) continue;

              const adj = [
                { x: pp.x + 1, y: pp.y },
                { x: pp.x - 1, y: pp.y },
                { x: pp.x, y: pp.y + 1 },
                { x: pp.x, y: pp.y - 1 },
              ].filter((q) => {
                if (!inBounds(dungeon.width, dungeon.height, q.x, q.y))
                  return false;
                const i = idxOf(dungeon.width, q.x, q.y);
                return dungeon.masks.solid[i] === 0 && (ft[i] | 0) === 0;
              });

              if (!adj.length) {
                failBlockAdj++;
                continue;
              }

              plateP = pp;
              blockP = adj[rng.nextInt(0, adj.length - 1)]!;
              break;
            }

            if (!plateP) {
              failPlate++;
              continue;
            }
            if (!blockP) continue;

            const chestP = trySample(6, () =>
              sampleRoomFloorNoFeatures(rng, dungeon, branchRoom, ft),
            );
            if (!chestP) {
              failChest++;
              continue;
            }

            // ---- COMMIT ----
            const gateId = allocId();
            const branchId = allocId();
            const blockId = allocId();
            const chestId = allocId();

            // 1) Gate door on main edge
            ft[gateDi] = 4;
            fid[gateDi] = gateId;
            fparam[gateDi] = 2;

            doors.push({
              id: gateId,
              x: gateSite.x,
              y: gateSite.y,
              roomA: shallowRoomId,
              roomB: deepRoomId,
              kind: 2,
              depth: oGate.gateDepth,
            });
            noteDoorEdgePlacement(shallowRoomId, deepRoomId);

            // 2) Lever fixture
            const gateLi = idxOf(dungeon.width, leverP.x, leverP.y);
            ft[gateLi] = 6;
            fid[gateLi] = gateId;
            fparam[gateLi] = 0;

            levers.push({
              id: gateId,
              x: leverP.x,
              y: leverP.y,
              roomId: shallowRoomId,
            });

            circuitsById.set(gateId, {
              id: gateId,
              logic: { type: "OR" },
              behavior: { mode: "TOGGLE" },
              triggers: [{ kind: "LEVER", refId: gateId }],
              targets: [{ kind: "DOOR", refId: gateId, effect: "TOGGLE" }],
            });

            circuitRoles[gateId] = "MAIN_PATH_GATE";

            // 3) Branch door fixture
            ft[branchDi] = 4;
            fid[branchDi] = branchId;
            fparam[branchDi] = 0;

            doors.push({
              id: branchId,
              x: branchSite.x,
              y: branchSite.y,
              roomA: oBranch.triggerRoomId, // == p.anchor
              roomB: oBranch.gateRoomId, // == branchRoomId
              kind: 0 as DoorKind,
              depth: oBranch.gateDepth,
            });
            noteDoorEdgePlacement(oBranch.triggerRoomId, oBranch.gateRoomId);

            // 4) Plate fixture (id = branchId)
            const pi = idxOf(dungeon.width, plateP.x, plateP.y);
            ft[pi] = 7;
            fid[pi] = branchId;
            fparam[pi] = 0;

            plates.push({
              id: branchId,
              x: plateP.x,
              y: plateP.y,
              roomId: plateRoomId,
              mode: "momentary",
              activatedByPlayer: false,
              activatedByBlock: true,
              activatedByBlockOrPlayer: false,
              inverted: false,
            });

            // 5) Block fixture
            const bi2 = idxOf(dungeon.width, blockP.x, blockP.y);
            ft[bi2] = 8;
            fid[bi2] = blockId;
            fparam[bi2] = 0;

            blocks.push({
              id: blockId,
              x: blockP.x,
              y: blockP.y,
              roomId: plateRoomId,
              weightClass: 0,
            });

            // 6) Chest fixture
            const ci = idxOf(dungeon.width, chestP.x, chestP.y);
            ft[ci] = 2;
            fid[ci] = chestId;
            lootTier[ci] = rewardTier;

            chests.push({
              id: chestId,
              x: chestP.x,
              y: chestP.y,
              roomId: branchRoomId,
              tier: rewardTier,
            });

            // 7) Branch circuit: PLATE && SIGNAL(gate ACTIVE) -> OPEN(branch door)
            circuitsById.set(branchId, {
              id: branchId,
              logic: { type: "AND" },
              behavior: { mode: "MOMENTARY" },
              triggers: [
                { kind: "PLATE", refId: branchId },
                { kind: "SIGNAL", refId: gateId, signal: { name: "ACTIVE" } },
              ],
              targets: [{ kind: "DOOR", refId: branchId, effect: "OPEN" }],
            });

            circuitRoles[branchId] = "OPTIONAL_REWARD";

            // --- NEW: lever-behind-own-gate diagnostic ---
            // We test whether the gate lever is reachable from the entrance when doors are closed.
            // Then we test again with ONLY the gate door tile treated as open (passable).
            const W = dungeon.width;

            const leverI = idxOf(W, leverP.x, leverP.y);

            // A) Reachability with doors closed (baseline)
            const reachClosed = computeReachable(
              dungeon,
              ft,
              fid,
              start,
              new Set(),
            );
            const reachableWithGateClosed = !!reachClosed[leverI];

            // B) Reachability if ONLY the gate door tile were open
            const prevGateFt = ft[gateDi];
            const prevGateFid = fid[gateDi];
            const prevGateFparam = fparam[gateDi];

            // Temporarily clear just the gate door tile
            ft[gateDi] = 0;
            fid[gateDi] = 0;
            fparam[gateDi] = 0;

            const reachGateOpenOnly = computeReachable(
              dungeon,
              ft,
              fid,
              start,
              new Set(),
            );
            const reachableIfGateWereOpen = !!reachGateOpenOnly[leverI];

            // Restore gate door tile
            ft[gateDi] = prevGateFt;
            fid[gateDi] = prevGateFid;
            fparam[gateDi] = prevGateFparam;

            // C) Reachability if ALL doors were open
            const clearedDoors: Array<{
              i: number;
              ft: number;
              fid: number;
              fparam: number;
            }> = [];
            for (let i = 0; i < ft.length; i++) {
              // Door featureType is 4 in this file (see: ft[gateDi]=4 and computeReachable)
              if ((ft[i] | 0) === 4 && (fid[i] | 0) !== 0) {
                clearedDoors.push({
                  i,
                  ft: ft[i]!,
                  fid: fid[i]!,
                  fparam: fparam[i]!,
                });
                ft[i] = 0;
                fid[i] = 0;
                fparam[i] = 0;
              }
            }

            const reachAllDoorsOpen = computeReachable(
              dungeon,
              ft,
              fid,
              start,
              new Set(),
            );
            const reachableIfAllDoorsWereOpen = !!reachAllDoorsOpen[leverI];

            // Restore all doors
            for (const d of clearedDoors) {
              ft[d.i] = d.ft;
              fid[d.i] = d.fid;
              fparam[d.i] = d.fparam;
            }

            // Derived flags
            const isBehindOwnGate =
              !reachableWithGateClosed && reachableIfGateWereOpen;
            const blockedByOtherDoor =
              reachableIfAllDoorsWereOpen && !reachableIfGateWereOpen;
            const unreachableEvenIfAllDoorsOpen = !reachableIfAllDoorsWereOpen;

            const leverBehindOwnGate: LeverBehindOwnGateDiagV1 = {
              schemaVersion: 1,
              gateDoorId: gateId,
              leverId: gateId,
              leverX: leverP.x,
              leverY: leverP.y,

              reachableWithGateClosed,
              reachableIfGateWereOpen,

              // NEW fields
              reachableIfAllDoorsWereOpen,
              blockedByOtherDoor,
              unreachableEvenIfAllDoorsOpen,

              // Existing semantic
              isBehindOwnGate,
            };

            // Include this edge in counters in the success report
            const edgesWithBranchesNow =
              mainEdgesWithBranches + (edgeHadBranches ? 1 : 0);
            const edgesWithSitesNow =
              mainEdgesWithUsableDoorSites + (edgeHadUsableDoorSite ? 1 : 0);

            succeededOnThisEdge = true;

            return {
              ok: true,
              didCarve: false,
              stats: { doorSites: stats },
              gateEdgeReuse,
              leverBehindOwnGate,
              // carry these in the payload if you’re aggregating them elsewhere
              // (kept as any-compatible with your existing caller)
              mainEdgesConsidered,
              mainEdgesWithBranches: edgesWithBranchesNow,
              mainEdgesWithUsableDoorSites: edgesWithSitesNow,
            } as any;
          }
        }
      }
    }

    // Only count this edge once (and only if we didn’t return success)
    if (edgeHadBranches) mainEdgesWithBranches++;
    if (edgeHadUsableDoorSite) mainEdgesWithUsableDoorSites++;
  }

  let reason =
    "Failed: placement constraints prevented success despite candidates.";

  if (mainEdgesConsidered > 0 && mainEdgesWithBranches === 0) {
    reason = "Failed: no main-path edge has any off-main branch neighbors.";
  } else if (mainEdgesWithBranches > 0 && mainEdgesWithUsableDoorSites === 0) {
    reason =
      "Failed: no usable branch door site exists on any considered main-path edge.";
  }

  reason +=
    ` (edgeConsidered=${mainEdgesConsidered}` +
    ` edgeWithBranches=${mainEdgesWithBranches}` +
    ` edgeWithBranchSites=${mainEdgesWithUsableDoorSites}` +
    ` gateOcc=${failGateOccupied}` +
    ` noBranchNbr=${failNoBranchNeighbors}` +
    ` noBranchSites=${failNoBranchDoorSites}` +
    ` branchOcc=${failBranchOccupied}` +
    ` branchSameAsGate=${failBranchSameAsGate}` +
    ` gateElim=${failGateEliminatesAllBranchSites}` +
    ` leverFail=${failLever}` +
    ` plateFail=${failPlate}` +
    ` blockAdjFail=${failBlockAdj}` +
    ` chestFail=${failChest}` +
    `)`;

  if (
    mainEdgesConsidered > 0 &&
    !(mainEdgesWithBranches > 0 && mainEdgesWithUsableDoorSites === 0) &&
    !(mainEdgesConsidered > 0 && mainEdgesWithBranches === 0)
  ) {
    const max = Math.max(
      failGateOccupied,
      failNoBranchNeighbors,
      failNoBranchDoorSites,
      failBranchOccupied,
      failBranchSameAsGate,
      failGateEliminatesAllBranchSites,
      failLever,
      failPlate,
      failBlockAdj,
      failChest,
    );

    if (max === failGateOccupied && max > 0)
      reason = "Failed: gate door tile occupied too often.";
    else if (max === failBranchOccupied && max > 0)
      reason = "Failed: branch door tile occupied too often.";
    else if (max === failNoBranchNeighbors && max > 0)
      reason = "Failed: no off-main branch neighbors for tried gate edges.";
    else if (max === failNoBranchDoorSites && max > 0)
      reason =
        "Failed: off-main neighbors exist, but no corridor branch door sites exist.";
    else if (max === failLever && max > 0)
      reason = "Failed: could not place lever in shallow room.";
    else if (max === failPlate && max > 0)
      reason = "Failed: could not place plate in plate room.";
    else if (max === failBlockAdj && max > 0)
      reason = "Failed: no adjacent block tile near plate.";
    else if (max === failChest && max > 0)
      reason = "Failed: could not place chest in branch room.";
    else if (max === failGateEliminatesAllBranchSites && max > 0)
      reason =
        "Failed: chosen gate site eliminates all usable branch door sites.";
    else if (max === failBranchSameAsGate && max > 0)
      reason = "Failed: branch door sites collided with gate site.";
  }

  return {
    ok: false,
    didCarve: false,
    reason,
    stats: { doorSites: stats },
    mainEdgesConsidered,
    mainEdgesWithBranches,
    mainEdgesWithUsableDoorSites,
    circuitRoles,
  } as any;
}

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
        gateEdgeReuse: res.gateEdgeReuse,
        leverBehindOwnGate: res.leverBehindOwnGate,
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
      gateEdgeReuse: res.gateEdgeReuse,
      leverBehindOwnGate: res.leverBehindOwnGate,
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

    // Preview ids must NOT consume allocId() (avoid burning scarce ids on failed previews).
    // Pick an unused id in the copied fid2 buffer.
    const previewId = findUnusedId255(fid2);
    if (previewId === 0) continue;

    const revealedPost = new Set<number>([previewId]);

    // Place hidden passage fixture at connector (this is what blocks pre-reveal).
    const cI = idxOf(W, picked.cx, picked.cy);
    ft2[cI] = 9; // hidden passage
    fid2[cI] = previewId;
    fparam2[cI] = 0;

    // Place lever fixture (doesn't affect reachability, but keeps the preview faithful).
    const lI = idxOf(W, leverSpot.x, leverSpot.y);
    ft2[lI] = 6;
    fid2[lI] = previewId;
    fparam2[lI] = 0;

    // Compute reachability AFTER the hidden fixture exists:
    // - pre: connector blocks (hidden unrevealed)
    // - post: connector passable (hidden revealed)
    const reachPre = computeReachable(
      { width: W, height: H, masks: { solid: solid2 } } as any,
      ft2,
      fid2,
      start,
      new Set(),
    );

    const reachPost = computeReachable(
      { width: W, height: H, masks: { solid: solid2 } } as any,
      ft2,
      fid2,
      start,
      revealedPost,
    );

    // Validate reachability
    const goal = findPocketGoal({ x: picked.px, y: picked.py }, pocketSize);
    if (!goal) continue;

    const goalI = idxOf(W, goal.x, goal.y);

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
            revealedPost,
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
    // Now that preview validated, allocate the real id(s).
    const secretId = allocId();
    const leverId = secretId; // keep aligned
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
      kind: "hidden_passage" as const,
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

/**
 * Find an unused id in 1..255 based on an existing featureId buffer.
 * Returns 0 if all ids appear used (extremely unlikely).
 */
function findUnusedId255(featureId: Uint8Array): number {
  // Track usage of 1..255. (0 means "no feature")
  const used = new Uint8Array(256);
  for (let i = 0; i < featureId.length; i++) {
    used[featureId[i] | 0] = 1;
  }
  for (let id = 1; id <= 255; id++) {
    if (!used[id]) return id;
  }
  return 0;
}

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
  requireThroat: boolean;
  maxAttempts?: number;
};

export type PlateOpensDoorPatternOptions = {
  requireThroat: boolean;
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

function buildRoomGraphFromCorridorsForPatterns(
  dungeon: BspDungeonOutputs,
  maxRadius = 10,
): Map<number, Set<number>> {
  const W = dungeon.width;
  const H = dungeon.height;
  const regionId = dungeon.masks.regionId;

  const graph = new Map<number, Set<number>>();

  // Ensure all rooms appear as nodes
  for (let i = 0; i < dungeon.meta.rooms.length; i++) {
    const id = i + 1;
    graph.set(id, new Set<number>());
  }

  for (const c of dungeon.meta.corridors) {
    const ra = findNearestRoomId(regionId, W, H, c.a, maxRadius);
    const rb = findNearestRoomId(regionId, W, H, c.b, maxRadius);
    if (ra === 0 || rb === 0) continue;
    if (ra === rb) continue;

    if (!graph.has(ra)) graph.set(ra, new Set());
    if (!graph.has(rb)) graph.set(rb, new Set());
    graph.get(ra)!.add(rb);
    graph.get(rb)!.add(ra);
  }

  return graph;
}

function bfsRoomDistancesForPatterns(
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

function sampleReachableRoomFloorNoFeatures(
  rng: PatternRng,
  dungeon: BspDungeonOutputs,
  room: BspDungeonOutputs["meta"]["rooms"][number],
  featureType: Uint8Array,
  reachable: Uint8Array,
  tries = 120,
): Point | null {
  const W = dungeon.width;
  const H = dungeon.height;

  for (let k = 0; k < tries; k++) {
    const x = rng.nextInt(room.x + 1, room.x + room.w - 2);
    const y = rng.nextInt(room.y + 1, room.y + room.h - 2);
    if (!inBounds(W, H, x, y)) continue;

    const i = idxOf(W, x, y);
    if (!reachable[i]) continue; // <-- key filter
    if (dungeon.masks.solid[i] !== 0) continue;
    if ((featureType[i] | 0) !== 0) continue;
    return { x, y };
  }

  return null;
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
    options,
  } = args;

  const maxAttempts = Math.max(1, args.options?.maxAttempts ?? 60);

  const { candidates, stats } = findDoorSiteCandidatesAndStatsFromCorridors(
    dungeon,
    ft,
    {
      minDistToWall: 1,
      preferCorridor: true,
      trimEnds: 2,
      duplicateBias: 1,
      maxRadius: 10,
      requireThroat: (options && options.requireThroat) ?? false,
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

  const pick = pickOrderedDoorSiteFromCorridors({
    rng,
    dungeon,
    featureType: ft,
    entranceRoomId,
    maxRadius: 10,
    minDistToWall: 1,
    preferCorridor: true,
    trimEnds: 0,
    duplicateBias: 1,
  });

  if (!pick.ok) {
    return {
      ok: false,
      didCarve: false,
      reason: `Lever pattern: no ordered door site (${pick.reason}).`,
      stats: { doorSites: stats },
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const doorId = allocId();

    const di = idxOf(dungeon.width, pick.x, pick.y);
    if ((ft[di] | 0) !== 0) break;

    // Place door
    ft[di] = 4;
    fid[di] = doorId;
    fparam[di] = 2;

    doors.push({
      id: doorId,
      x: pick.x,
      y: pick.y,
      roomA: pick.triggerRoomId, // earlier
      roomB: pick.gateRoomId, // later
      kind: 2,
      depth: pick.gateDepth,
    });

    // Place lever in earlier room
    const leverRoom =
      rooms[pick.triggerRoomId - 1] ?? rooms[entranceRoomId - 1] ?? rooms[0];
    if (!leverRoom) {
      // rollback door
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();
      continue;
    }

    const leverP = sampleRoomFloorNoFeatures(rng, dungeon, leverRoom, ft);
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

    levers.push({
      id: doorId,
      x: leverP.x,
      y: leverP.y,
      roomId: pick.triggerRoomId,
    });

    circuitsById.set(doorId, {
      id: doorId,
      logic: { type: "OR" },
      behavior: { mode: "TOGGLE" },
      triggers: [{ kind: "LEVER", refId: doorId }],
      targets: [{ kind: "DOOR", refId: doorId, effect: "TOGGLE" }],
    });

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

  // NEW: required to enforce "trigger earlier than gate"
  entranceRoomId: number;

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
    entranceRoomId,
    featureType: ft,
    featureId: fid,
    featureParam: fparam,
    doors,
    plates,
    blocks,
    circuitsById,
    allocId,
    options,
  } = args;

  const maxAttempts = Math.max(1, args.options?.maxAttempts ?? 80);
  const inverted = !!args.options?.inverted;
  const requireThroat = (options && options.requireThroat) ?? false;

  // We still use the corridor candidate pool (spatial validity is in doorSites.ts)
  const { candidates, stats } = findDoorSiteCandidatesAndStatsFromCorridors(
    dungeon,
    ft,
    {
      minDistToWall: 1,
      preferCorridor: true,
      trimEnds: 2,
      duplicateBias: 1,
      maxRadius: 10,
      requireThroat,
    },
  );

  if (!candidates.length) {
    return {
      ok: false,
      didCarve: false,
      reason: "No valid corridor door sites.",
      stats: { doorSites: stats },
    };
  }

  // A1: relaxed fallback pool (helps rare “single chokepoint tile” degeneracy).
  const relaxed = findDoorSiteCandidatesAndStatsFromCorridors(dungeon, ft, {
    minDistToWall: 1,
    preferCorridor: true,
    trimEnds: 0,
    duplicateBias: 1,
    maxRadius: 12,
    requireThroat,
  });

  // Merge unique relaxed candidates into the main candidate list.
  const seenKey = new Set<string>();
  for (const s of candidates) {
    const lo = Math.min(s.roomA, s.roomB);
    const hi = Math.max(s.roomA, s.roomB);
    seenKey.add(`${s.x},${s.y},${lo},${hi}`);
  }
  for (const s of relaxed.candidates) {
    const lo = Math.min(s.roomA, s.roomB);
    const hi = Math.max(s.roomA, s.roomB);
    const k = `${s.x},${s.y},${lo},${hi}`;
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    candidates.push(s);
  }

  // NEW: central policy pick — returns (x,y) plus oriented rooms:
  // triggerRoomId = earlier, gateRoomId = later, gateDepth = BFS distance.
  const pick = pickOrderedDoorSiteFromCorridors({
    rng,
    dungeon,
    featureType: ft,
    entranceRoomId,
    maxRadius: 10,
    minDistToWall: 1,
    preferCorridor: true,
    trimEnds: 0,
    duplicateBias: 1,
  });

  if (!pick.ok) {
    return {
      ok: false,
      didCarve: false,
      reason: `No ordered door site (${pick.reason}).`,
      stats: { doorSites: stats },
    };
  }

  // Try to actually place (tile might be occupied by a previous pattern)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const circuitId = allocId();

    const di = idxOf(dungeon.width, pick.x, pick.y);
    if ((ft[di] | 0) !== 0) {
      // If occupied, we cannot “re-pick” without reintroducing duplication.
      // Keep best-effort: just fail this pattern.
      break;
    }

    // Place door fixture
    ft[di] = 4;
    fid[di] = circuitId;
    fparam[di] = 0;

    doors.push({
      id: circuitId,
      x: pick.x,
      y: pick.y,
      // IMPORTANT: oriented rooms (trigger earlier than gate)
      roomA: pick.triggerRoomId,
      roomB: pick.gateRoomId,
      kind: 0 as DoorKind,
      depth: pick.gateDepth,
    });

    // Place plate + block in the TRIGGER (earlier) room.
    const plateRoom = rooms[pick.triggerRoomId - 1];
    if (!plateRoom) {
      // rollback door
      ft[di] = 0;
      fid[di] = 0;
      fparam[di] = 0;
      doors.pop();
      continue;
    }

    const plateP = sampleRoomFloorNoFeatures(rng, dungeon, plateRoom, ft);
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
      roomId: pick.triggerRoomId,
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
      roomId: pick.triggerRoomId,
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
