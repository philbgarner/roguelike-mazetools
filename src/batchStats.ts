// src/batchStats.ts
//
// Batch runner aggregation helpers.
// This file is intentionally framework-agnostic (no React) so it can be reused
// by UI panels, scripts, or future CLI harnesses.
export type PatternDiag = {
  name: string;
  ok: boolean;
  didCarve: boolean;
  reason?: string;
  ms?: number;
  stats?: {
    doorSites?: Record<string, number>;
  };
};

export type BatchRunInput = {
  seed: string;
  seedUsed: number;
  rooms: number;
  corridors: number;
  patternDiagnostics: PatternDiag[];
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
};

export type BatchSummary = {
  runs: number;
  roomsAvg: number;
  corridorsAvg: number;
  patterns: BatchPatternSummary[];
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
    }
  >();

  for (const r of runs) {
    roomsSum += safeNum(r.rooms);
    corridorsSum += safeNum(r.corridors);

    for (const d of r.patternDiagnostics ?? []) {
      const name = String(d.name ?? "unknown");
      const acc =
        byPattern.get(name) ??
        ({
          runs: 0,
          ok: 0,
          fail: 0,
          carved: 0,
          msTotal: 0,
          reasons: {},
          doorSitesSum: {},
          doorSitesCount: 0,
        } as const);

      // Clone-on-write only when new
      let next = acc as any;
      if (!byPattern.has(name)) {
        next = {
          runs: 0,
          ok: 0,
          fail: 0,
          carved: 0,
          msTotal: 0,
          reasons: {},
          doorSitesSum: {},
          doorSitesCount: 0,
        };
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

      byPattern.set(name, next);
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

      return {
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
    });

  return {
    runs: totalRuns,
    roomsAvg: totalRuns ? round2(roomsSum / totalRuns) : 0,
    corridorsAvg: totalRuns ? round2(corridorsSum / totalRuns) : 0,
    patterns,
  };
}
