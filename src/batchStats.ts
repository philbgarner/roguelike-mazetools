// src/batchStats.ts
//
// Batch runner aggregation helpers.
// This file is intentionally framework-agnostic (no React) so it can be reused
// by UI panels, scripts, or future CLI harnesses.
//

import type { DoorSiteStatsBundle } from "./doorSites";

export type LeverBehindOwnGateDiagV1 = {
  schemaVersion: 1;
  gateDoorId: number; // the door id the lever controls (same id for this pattern)
  leverId: number; // lever fixture id (same id for this pattern)
  leverX: number;
  leverY: number;

  // Reachability of the lever from entrance with all doors closed:
  reachableWithGateClosed: boolean;

  // Reachability if we "open" ONLY the gate door tile (treat as floor) for analysis:
  reachableIfGateWereOpen: boolean;

  // The actual diagnostic flag we care about:
  isBehindOwnGate: boolean;
  reachableIfAllDoorsWereOpen: boolean;
  blockedByOtherDoor: boolean;
  unreachableEvenIfAllDoorsOpen: boolean;
};

export type GateEdgeReuseDiagV1 = {
  schemaVersion: 1;

  // Total doors placed by the pattern run (typically 0, 1, or 2)
  doorsPlaced: number;

  // Unique graph edges among those doors
  uniqueEdgesPlaced: number;

  // Count of doors whose edge was already occupied BEFORE this pattern committed
  reusedExistingCount: number;

  // Count of doors that reuse an edge already placed earlier in THIS pattern commit
  // (should usually be 0; helpful as a sanity check)
  reusedInternalCount: number;

  // Small list of edgeIds that were reused (best-effort; keep short)
  reusedEdgeIds: string[];
};

export type PatternDiag = {
  name: string;
  ok: boolean;
  didCarve: boolean;
  reason?: string;
  ms?: number;
  stats?: DoorSiteStatsBundle;
  reachability?: ReachabilityStats;
  gateEdgeReuse?: GateEdgeReuseDiagV1;
  leverBehindOwnGate?: LeverBehindOwnGateDiagV1;
};

export type Point = { x: number; y: number };

export type ReachabilityStats = {
  start: Point;
  connector: Point;
  pocketCenter: Point;
  goal: Point;
  reachablePre: boolean;
  reachablePost: boolean;
  shortestPathPost: number | null;
};

export type CircuitBatchMetrics = {
  schemaVersion: 1;

  circuitCount: number;
  signalEdgeCount: number;

  maxTopoDepth: number;
  avgTopoDepth: number;

  circuitsWithSignalDeps: number;
  pctWithSignalDeps: number; // 0..1

  cycleGroupCount: number;
  cycleCircuitCount: number;

  blockedByCycleCount: number;

  largestCycleSize: number;
};

export type BatchRunInput = {
  seed: string;
  seedUsed: number;
  rooms: number;
  corridors: number;
  patternDiagnostics: PatternDiag[];
  circuitMetrics: CircuitBatchMetrics | null;
};

export type BatchPatternSummary = {
  name: string;
  runs: number;
  ok: number;
  fail: number;
  okRate: number; // 0..1
  carved: number;
  carvedRate: number; // 0..1
  msTotal: number;
  msAvg: number;
  reasons: Record<string, number>;
  topReasons: Array<[string, number]>;
  doorSitesAvg?: Record<string, number>;
  // Optional: reachability diagnostics (present when any run reported it)
  reachabilityPreReachable?: number;
  reachabilityPreReachableRate?: number; // 0..1
  reachabilityPostUnreachable?: number;
  reachabilityPostUnreachableRate?: number; // 0..1
  shortestPathPostAvg?: number;

  // Optional: graph-edge reuse diagnostics (present when any run reported it)
  gateEdgeReuseAvg?: {
    runsWithDiag: number;
    pctRunsWithDiag: number; // 0..1

    doorsPlacedAvg: number;
    uniqueEdgesPlacedAvg: number;

    reusedExistingCountAvg: number;
    reusedInternalCountAvg: number;

    runsWithExistingReuse: number;
    pctRunsWithExistingReuse: number; // 0..1
  };

  leverAccessAvg?: {
    runsWithDiag: number;
    pctRunsWithDiag: number; // 0..1

    // A) Lever is behind *its own* gate (opening only that gate makes it reachable)
    leverBehindOwnGateCount: number;
    pctLeverBehindOwnGate: number; // 0..1

    // B) Lever becomes reachable if ALL doors are opened, but NOT if only its own gate is opened
    // => blocked by some other door(s)
    leverBlockedByOtherDoorCount: number;
    pctLeverBlockedByOtherDoor: number; // 0..1

    // C) Lever is unreachable even if all doors are opened
    // => topology/disconnect/walls/hidden etc.
    leverUnreachableEvenIfAllDoorsOpenCount: number;
    pctLeverUnreachableEvenIfAllDoorsOpen: number; // 0..1

    // (Optional but useful) Old signal: unreachable even when only gate is opened (other doors still closed)
    leverUnreachableWithGateOpenButOtherDoorsClosedCount: number;
    pctLeverUnreachableWithGateOpenButOtherDoorsClosed: number; // 0..1
  };
};

export type BatchSummary = {
  runs: number;
  roomsAvg: number;
  corridorsAvg: number;
  patterns: BatchPatternSummary[];

  circuits?: {
    runsWithMetrics: number;

    circuitCountAvg: number;
    signalEdgeCountAvg: number;

    maxTopoDepthAvg: number;
    avgTopoDepthAvg: number;

    circuitsWithSignalDepsAvg: number;
    pctWithSignalDepsAvg: number;

    cycleGroupCountAvg: number;
    cycleCircuitCountAvg: number;

    blockedByCycleCountAvg: number;

    largestCycleSizeAvg: number;
  };
};

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function aggregateBatchRuns(runs: BatchRunInput[]): BatchSummary {
  const totalRuns = runs.length;

  let roomsSum = 0;
  let corridorsSum = 0;
  let circuitRuns = 0;

  let circuitCountSum = 0;
  let signalEdgeCountSum = 0;

  let maxTopoDepthSum = 0;
  let avgTopoDepthSum = 0;

  let circuitsWithSignalDepsSum = 0;
  let pctWithSignalDepsSum = 0;

  let cycleGroupCountSum = 0;
  let cycleCircuitCountSum = 0;

  let blockedByCycleCountSum = 0;

  let largestCycleSizeSum = 0;

  function makeAcc() {
    return {
      runs: 0,
      ok: 0,
      fail: 0,
      carved: 0,
      msTotal: 0,
      reasons: {} as Record<string, number>,
      doorSitesSum: {} as Record<string, number>,
      doorSitesCount: 0,
      reachabilityCount: 0,
      reachabilityPreReachable: 0,
      reachabilityPostUnreachable: 0,
      shortestPathPostSum: 0,
      shortestPathPostCount: 0,
      gateEdgeReuseCount: 0,
      gateDoorsPlacedSum: 0,
      gateUniqueEdgesSum: 0,
      gateReusedExistingSum: 0,
      gateReusedInternalSum: 0,
      gateRunsWithExistingReuse: 0,
      leverAccessDiagCount: 0,
      leverBehindOwnGateCount: 0,
      leverBlockedByOtherDoorCount: 0,
      leverUnreachableEvenIfAllDoorsOpenCount: 0,
      leverUnreachableWithGateOpenButOtherDoorsClosedCount: 0,
    };
  }

  const byPattern = new Map<
    string,
    {
      runs: number;
      ok: number;
      fail: number;
      carved: number;
      msTotal: number;
      reasons: Record<string, number>;
      doorSitesSum: Record<string, number>;
      doorSitesCount: number;
      reachabilityCount: number;
      reachabilityPreReachable: number;
      reachabilityPostUnreachable: number;
      shortestPathPostSum: number;
      shortestPathPostCount: number;
      gateEdgeReuseCount: number;
      gateDoorsPlacedSum: number;
      gateUniqueEdgesSum: number;
      gateReusedExistingSum: number;
      gateReusedInternalSum: number;
      gateRunsWithExistingReuse: number;
      leverAccessDiagCount: number;
      leverBehindOwnGateCount: number;
      leverBlockedByOtherDoorCount: number;
      leverUnreachableEvenIfAllDoorsOpenCount: number;
      leverUnreachableWithGateOpenButOtherDoorsClosedCount: number;
    }
  >();

  for (const r of runs) {
    roomsSum += safeNum(r.rooms);
    corridorsSum += safeNum(r.corridors);

    for (const d of r.patternDiagnostics ?? []) {
      const name = String(d.name ?? "unknown");
      let next = byPattern.get(name);
      if (!next) {
        next = makeAcc();
        byPattern.set(name, next);
      }

      next.runs += 1;
      if (d.ok) next.ok += 1;
      else next.fail += 1;

      if (d.didCarve) next.carved += 1;

      const ms = safeNum(d.ms);
      if (ms > 0) next.msTotal += ms;

      if (!d.ok) {
        const reason = String(d.reason ?? "unknown");
        next.reasons[reason] = (next.reasons[reason] ?? 0) + 1;
      }

      const ds = d.stats?.doorSites;
      if (ds) {
        next.doorSitesCount += 1;
        for (const [k, v] of Object.entries(ds)) {
          const n = safeNum(v);
          next.doorSitesSum[k] = (next.doorSitesSum[k] ?? 0) + n;
        }
      }
      const rs = d.reachability;
      if (rs) {
        next.reachabilityCount += 1;
        if (rs.reachablePre) next.reachabilityPreReachable += 1;
        if (!rs.reachablePost) next.reachabilityPostUnreachable += 1;

        const sp = rs.shortestPathPost;
        if (typeof sp === "number" && Number.isFinite(sp) && sp >= 0) {
          next.shortestPathPostSum += sp;
          next.shortestPathPostCount += 1;
        }
      }

      const gr = d.gateEdgeReuse;
      if (gr) {
        next.gateEdgeReuseCount += 1;
        next.gateDoorsPlacedSum += safeNum(gr.doorsPlaced);
        next.gateUniqueEdgesSum += safeNum(gr.uniqueEdgesPlaced);
        next.gateReusedExistingSum += safeNum(gr.reusedExistingCount);
        next.gateReusedInternalSum += safeNum(gr.reusedInternalCount);
        if ((gr.reusedExistingCount | 0) > 0)
          next.gateRunsWithExistingReuse += 1;
      }
      const lb = d.leverBehindOwnGate;
      if (lb) {
        next.leverAccessDiagCount += 1;

        if (lb.isBehindOwnGate) next.leverBehindOwnGateCount += 1;

        if (lb.blockedByOtherDoor) next.leverBlockedByOtherDoorCount += 1;

        if (lb.unreachableEvenIfAllDoorsOpen)
          next.leverUnreachableEvenIfAllDoorsOpenCount += 1;

        // Keep the old diagnostic bucket (but renamed to reflect what it really means)
        if (!lb.reachableIfGateWereOpen)
          next.leverUnreachableWithGateOpenButOtherDoorsClosedCount += 1;
      }

      byPattern.set(name, next);
    }

    const cm = r.circuitMetrics;
    if (cm) {
      circuitRuns += 1;

      circuitCountSum += safeNum(cm.circuitCount);
      signalEdgeCountSum += safeNum(cm.signalEdgeCount);

      maxTopoDepthSum += safeNum(cm.maxTopoDepth);
      avgTopoDepthSum += safeNum(cm.avgTopoDepth);

      circuitsWithSignalDepsSum += safeNum(cm.circuitsWithSignalDeps);
      pctWithSignalDepsSum += safeNum(cm.pctWithSignalDeps);

      cycleGroupCountSum += safeNum(cm.cycleGroupCount);
      cycleCircuitCountSum += safeNum(cm.cycleCircuitCount);

      blockedByCycleCountSum += safeNum(cm.blockedByCycleCount);

      largestCycleSizeSum += safeNum(cm.largestCycleSize);
    }
  }

  const patterns: BatchPatternSummary[] = Array.from(byPattern.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, acc]) => {
      const okRate = acc.runs ? acc.ok / acc.runs : 0;
      const carvedRate = acc.runs ? acc.carved / acc.runs : 0;
      const msAvg = acc.runs ? acc.msTotal / acc.runs : 0;

      const topReasons = Object.entries(acc.reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      let doorSitesAvg: Record<string, number> | undefined = undefined;
      if (acc.doorSitesCount > 0) {
        doorSitesAvg = {};
        for (const [k, sum] of Object.entries(acc.doorSitesSum)) {
          doorSitesAvg[k] = round2(sum / acc.doorSitesCount);
        }
      }

      const hasReach = acc.reachabilityCount > 0;
      const reachabilityPreReachableRate = hasReach
        ? acc.reachabilityPreReachable / acc.reachabilityCount
        : 0;
      const reachabilityPostUnreachableRate = hasReach
        ? acc.reachabilityPostUnreachable / acc.reachabilityCount
        : 0;
      const shortestPathPostAvg = acc.shortestPathPostCount
        ? acc.shortestPathPostSum / acc.shortestPathPostCount
        : 0;

      const out: BatchPatternSummary = {
        name,
        runs: acc.runs,
        ok: acc.ok,
        fail: acc.fail,
        okRate: round2(okRate),
        carved: acc.carved,
        carvedRate: round2(carvedRate),
        msTotal: Math.round(acc.msTotal),
        msAvg: round2(msAvg),
        reasons: acc.reasons,
        topReasons,
        doorSitesAvg,
      };

      if (hasReach) {
        out.reachabilityPreReachable = acc.reachabilityPreReachable;
        out.reachabilityPreReachableRate = round2(reachabilityPreReachableRate);
        out.reachabilityPostUnreachable = acc.reachabilityPostUnreachable;
        out.reachabilityPostUnreachableRate = round2(
          reachabilityPostUnreachableRate,
        );
        if (acc.shortestPathPostCount > 0) {
          out.shortestPathPostAvg = round2(shortestPathPostAvg);
        }
      }

      if (acc.gateEdgeReuseCount > 0) {
        const runsWithDiag = acc.gateEdgeReuseCount;
        const doorsPlacedAvg = acc.gateDoorsPlacedSum / runsWithDiag;
        const uniqueEdgesPlacedAvg = acc.gateUniqueEdgesSum / runsWithDiag;
        const reusedExistingCountAvg = acc.gateReusedExistingSum / runsWithDiag;
        const reusedInternalCountAvg = acc.gateReusedInternalSum / runsWithDiag;

        out.gateEdgeReuseAvg = {
          runsWithDiag,
          pctRunsWithDiag: round2(acc.runs ? runsWithDiag / acc.runs : 0),

          doorsPlacedAvg: round2(doorsPlacedAvg),
          uniqueEdgesPlacedAvg: round2(uniqueEdgesPlacedAvg),

          reusedExistingCountAvg: round2(reusedExistingCountAvg),
          reusedInternalCountAvg: round2(reusedInternalCountAvg),

          runsWithExistingReuse: acc.gateRunsWithExistingReuse,
          pctRunsWithExistingReuse: round2(
            runsWithDiag ? acc.gateRunsWithExistingReuse / runsWithDiag : 0,
          ),
        };
      }

      if (acc.leverAccessDiagCount > 0) {
        const runsWithDiag = acc.leverAccessDiagCount;

        out.leverAccessAvg = {
          runsWithDiag,
          pctRunsWithDiag: round2(acc.runs ? runsWithDiag / acc.runs : 0),

          leverBehindOwnGateCount: acc.leverBehindOwnGateCount,
          pctLeverBehindOwnGate: round2(
            runsWithDiag ? acc.leverBehindOwnGateCount / runsWithDiag : 0,
          ),

          leverBlockedByOtherDoorCount: acc.leverBlockedByOtherDoorCount,
          pctLeverBlockedByOtherDoor: round2(
            runsWithDiag ? acc.leverBlockedByOtherDoorCount / runsWithDiag : 0,
          ),

          leverUnreachableEvenIfAllDoorsOpenCount:
            acc.leverUnreachableEvenIfAllDoorsOpenCount,
          pctLeverUnreachableEvenIfAllDoorsOpen: round2(
            runsWithDiag
              ? acc.leverUnreachableEvenIfAllDoorsOpenCount / runsWithDiag
              : 0,
          ),

          leverUnreachableWithGateOpenButOtherDoorsClosedCount:
            acc.leverUnreachableWithGateOpenButOtherDoorsClosedCount,
          pctLeverUnreachableWithGateOpenButOtherDoorsClosed: round2(
            runsWithDiag
              ? acc.leverUnreachableWithGateOpenButOtherDoorsClosedCount /
                  runsWithDiag
              : 0,
          ),
        };
      }

      return out;
    });

  const circuits =
    circuitRuns > 0
      ? {
          runsWithMetrics: circuitRuns,

          circuitCountAvg: round2(circuitCountSum / circuitRuns),
          signalEdgeCountAvg: round2(signalEdgeCountSum / circuitRuns),

          maxTopoDepthAvg: round2(maxTopoDepthSum / circuitRuns),
          avgTopoDepthAvg: round2(avgTopoDepthSum / circuitRuns),

          circuitsWithSignalDepsAvg: round2(
            circuitsWithSignalDepsSum / circuitRuns,
          ),
          pctWithSignalDepsAvg: round2(pctWithSignalDepsSum / circuitRuns),

          cycleGroupCountAvg: round2(cycleGroupCountSum / circuitRuns),
          cycleCircuitCountAvg: round2(cycleCircuitCountSum / circuitRuns),

          blockedByCycleCountAvg: round2(blockedByCycleCountSum / circuitRuns),

          largestCycleSizeAvg: round2(largestCycleSizeSum / circuitRuns),
        }
      : undefined;

  return {
    runs: totalRuns,
    roomsAvg: totalRuns ? round2(roomsSum / totalRuns) : 0,
    corridorsAvg: totalRuns ? round2(corridorsSum / totalRuns) : 0,
    patterns,
    circuits,
  };
}
