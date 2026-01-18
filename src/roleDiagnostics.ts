// src/roleDiagnostics.ts
//
// Milestone 4 — Phase 2 (observational)
// Role-aware diagnostics built on top of CircuitEvalDiagnostics + content meta.
//
// Goals:
// - No gameplay effects (observational only)
// - Batch-safe (stable schemaVersion, stable keys)
// - Deterministic anchor derivation (per circuit) using content meta
// - Conservative default thresholds with depth-based ramping
//
// Notes:
// - Roles are annotations (generation-time). This module only reads them.
// - Anchor derivation is best-effort. SIGNAL-only circuits are anchored via a 2nd pass
//   using upstream deps from CircuitEvalDiagnostics.perCircuit[].signalDeps.

import type { ContentOutputs, CircuitDef } from "./mazeGen";
import type { CircuitEvalDiagnostics } from "./evaluateCircuits";

// -----------------------------
// Public types
// -----------------------------

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
  | "MAIN_TRIVIAL"
  | "MAIN_LATE_TRIVIAL"
  | "MAIN_TOO_DEEP_EARLY"

  // OPTIONAL_REWARD quality
  | "OPTIONAL_TRIVIAL"
  | "OPTIONAL_OVERGATED_BY_MAIN"

  // SHORTCUT quality
  | "SHORTCUT_NOT_REDUCING_DISTANCE"

  // FORESHADOW quality
  | "FORESHADOW_AFTER_MAIN"
  | "FORESHADOW_TOO_DEEP";

export type CircuitAnchorV1 = {
  anchorRoomId: number | null;
  roomDepth: number | null; // BFS distance from entrance
  depthN: number | null; // normalized 0..1
  onMainPath: boolean | null;

  // Optional: if a door is involved and we can map it
  doorId?: number;
  mainPathEdgeDepth?: number;
};

export type CircuitRoleRecordV1 = {
  circuitIndex: number;
  role: PuzzleRole | null;

  anchor: CircuitAnchorV1;

  topoDepth: number;
  signalDepCount: number;
  participatesInCycle: boolean;
  blockedByCycle: boolean;
};

export type RoleRuleHitV1 = {
  ruleId: RoleRuleId;
  role: PuzzleRole | null;
  circuitIndex: number;

  depthN: number | null;
  roomDepth: number | null;
  topoDepth: number;

  code: string; // short stable code for aggregation
  detail?: string; // keep short (UI only)
};

export type RoleThresholdsV1 = {
  schemaVersion: 1;

  main: {
    minTopoDepth: Array<{ atLeastDepthN: number; minTopoDepth: number }>;

    lateStartsAtDepthN: number;
    lateMinTopoDepth: number;

    earlyEndsAtDepthN: number;
    earlyMaxTopoDepth: number;
  };

  optional: {
    lateStartsAtDepthN: number;
    lateMinTopoDepth: number;
  };

  foreshadow: {
    maxTopoDepth: number;
    mustOccurBeforeDepthN: number;
  };

  shortcut: {
    minRoomDepthReduction: number;
  };
};

export const DEFAULT_ROLE_THRESHOLDS_V1: RoleThresholdsV1 = {
  schemaVersion: 1,

  main: {
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
    lateStartsAtDepthN: 0.6,
    lateMinTopoDepth: 1,
  },

  foreshadow: {
    maxTopoDepth: 1,
    mustOccurBeforeDepthN: 0.45,
  },

  shortcut: {
    minRoomDepthReduction: 2,
  },
};

export type RoleSummaryStatsV1 = {
  schemaVersion: 1;

  roleCounts: Record<PuzzleRole, number>;
  roleMissingCount: number;

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

  ruleCounts: Record<RoleRuleId, number>;
};

export type RoleDiagnosticsV1 = {
  schemaVersion: 1;

  seedUsed?: number;
  entranceRoomId?: number;
  farthestRoomId?: number;
  maxRoomDepth?: number;

  perCircuit: CircuitRoleRecordV1[];
  hits: RoleRuleHitV1[];
  summary: RoleSummaryStatsV1;
};

// -----------------------------
// Analyzer entry point
// -----------------------------

export function analyzeRoleDiagnosticsV1(args: {
  meta: ContentOutputs["meta"];
  circuitEval: CircuitEvalDiagnostics;
  thresholds?: RoleThresholdsV1;
}): RoleDiagnosticsV1 {
  const { meta, circuitEval } = args;
  const thresholds = args.thresholds ?? DEFAULT_ROLE_THRESHOLDS_V1;

  // Normalize depth
  const maxRoomDepth = getMaxRoomDepth(meta);

  // Build quick lookup maps for id->entity meta
  const maps = buildMetaIdMaps(meta);

  // Role annotation map (optional; may not exist yet)
  const roleMap = (meta as any).circuitRoles as
    | Record<number, PuzzleRole>
    | undefined;

  // Build initial per-circuit records from circuitEval (stable ordering)
  const perCircuit: CircuitRoleRecordV1[] = circuitEval.perCircuit.map((cd) => {
    const circuitIndex = cd.circuitIndex;
    const circuit = meta.circuits[circuitIndex];

    const role = roleMap?.[circuitIndex] ?? null;

    const anchor = circuit
      ? deriveCircuitAnchorV1({
          meta,
          circuit,
          maxRoomDepth,
          maps,
        })
      : {
          anchorRoomId: null,
          roomDepth: null,
          depthN: null,
          onMainPath: null,
        };

    return {
      circuitIndex,
      role,
      anchor,
      topoDepth: cd.topoDepth | 0,
      signalDepCount: cd.signalDepCount | 0,
      participatesInCycle: !!cd.participatesInCycle,
      blockedByCycle: !!cd.blockedByCycle,
    };
  });

  // Second pass: if anchor is missing (usually SIGNAL-only circuits),
  // try to inherit a stable anchor from upstream deps (min depthN).
  fillMissingAnchorsFromDeps(perCircuit, circuitEval);

  const hits = evaluateRoleRulesV1(perCircuit, thresholds);

  const summary = summarizeRoleDiagnosticsV1(perCircuit, hits);

  return {
    schemaVersion: 1,
    seedUsed: meta.seedUsed,
    entranceRoomId: meta.entranceRoomId,
    farthestRoomId: meta.farthestRoomId,
    maxRoomDepth,
    perCircuit,
    hits,
    summary,
  };
}

// -----------------------------
// Anchor derivation
// -----------------------------

type MetaIdMaps = {
  doorById: Map<number, ContentOutputs["meta"]["doors"][number]>;
  keyById: Map<number, ContentOutputs["meta"]["keys"][number]>;
  leverById: Map<number, ContentOutputs["meta"]["levers"][number]>;
  plateById: Map<number, ContentOutputs["meta"]["plates"][number]>;
  hiddenById: Map<number, ContentOutputs["meta"]["hidden"][number]>;
  hazardById: Map<number, ContentOutputs["meta"]["hazards"][number]>;
};

function buildMetaIdMaps(meta: ContentOutputs["meta"]): MetaIdMaps {
  const doorById = new Map<number, ContentOutputs["meta"]["doors"][number]>();
  const keyById = new Map<number, ContentOutputs["meta"]["keys"][number]>();
  const leverById = new Map<number, ContentOutputs["meta"]["levers"][number]>();
  const plateById = new Map<number, ContentOutputs["meta"]["plates"][number]>();
  const hiddenById = new Map<
    number,
    ContentOutputs["meta"]["hidden"][number]
  >();
  const hazardById = new Map<
    number,
    ContentOutputs["meta"]["hazards"][number]
  >();

  for (const d of meta.doors) doorById.set(d.id, d);
  for (const k of meta.keys) keyById.set(k.id, k);
  for (const l of meta.levers) leverById.set(l.id, l);
  for (const p of meta.plates) plateById.set(p.id, p);
  for (const h of meta.hidden) hiddenById.set(h.id, h);
  for (const hz of meta.hazards) hazardById.set(hz.id, hz);

  return { doorById, keyById, leverById, plateById, hiddenById, hazardById };
}

function deriveCircuitAnchorV1(args: {
  meta: ContentOutputs["meta"];
  circuit: CircuitDef;
  maxRoomDepth: number;
  maps: MetaIdMaps;
}): CircuitAnchorV1 {
  const { meta, circuit, maxRoomDepth, maps } = args;

  const candidates: number[] = [];
  let doorHint: { doorId: number; mainPathEdgeDepth: number } | null = null;

  // Triggers: LEVER, KEY, PLATE are anchored by their roomId.
  for (const t of circuit.triggers) {
    if (t.kind === "LEVER") {
      const lever = maps.leverById.get(t.refId);
      if (lever) candidates.push(lever.roomId);
    } else if (t.kind === "KEY") {
      const key = maps.keyById.get(t.refId);
      if (key) candidates.push(key.roomId);
    } else if (t.kind === "PLATE") {
      const plate = maps.plateById.get(t.refId);
      if (plate) candidates.push(plate.roomId);
    } else if (t.kind === "SIGNAL") {
      // SIGNAL triggers are handled by 2nd-pass anchor fill using deps.
    } else {
      // COMBAT_CLEAR / INTERACT: no stable mapping yet
    }
  }

  // Targets: DOOR/HAZARD/HIDDEN
  for (const trg of circuit.targets) {
    if (trg.kind === "DOOR") {
      const door = maps.doorById.get(trg.refId);
      if (door) {
        // Door has two rooms; anchor to whichever is earlier by roomDistance
        const ra = door.roomA;
        const rb = door.roomB;
        const da = meta.roomDistance.get(ra);
        const db = meta.roomDistance.get(rb);

        // Deterministic pick: min distance, tie -> min roomId
        const pick =
          da === undefined && db === undefined
            ? Math.min(ra, rb)
            : da === undefined
              ? rb
              : db === undefined
                ? ra
                : da < db
                  ? ra
                  : db < da
                    ? rb
                    : Math.min(ra, rb);

        candidates.push(pick);
        doorHint = { doorId: door.id, mainPathEdgeDepth: door.depth | 0 };
      }
    } else if (trg.kind === "HAZARD") {
      const hz = maps.hazardById.get(trg.refId);
      if (hz) candidates.push(hz.roomId);
    } else if (trg.kind === "HIDDEN") {
      const hid = maps.hiddenById.get(trg.refId);
      if (hid) candidates.push(hid.roomId);
    }
  }

  const anchorRoomId = pickAnchorRoomId(meta, candidates);

  if (anchorRoomId == null) {
    return {
      anchorRoomId: null,
      roomDepth: null,
      depthN: null,
      onMainPath: null,
    };
  }

  const roomDepth = meta.roomDistance.get(anchorRoomId) ?? null;
  const depthN =
    roomDepth == null || maxRoomDepth <= 0
      ? null
      : clamp01(roomDepth / maxRoomDepth);

  const onMainPath =
    meta.mainPathRoomIds && Array.isArray(meta.mainPathRoomIds)
      ? meta.mainPathRoomIds.includes(anchorRoomId)
      : null;

  const out: CircuitAnchorV1 = {
    anchorRoomId,
    roomDepth,
    depthN,
    onMainPath,
  };

  if (doorHint) {
    out.doorId = doorHint.doorId;
    out.mainPathEdgeDepth = doorHint.mainPathEdgeDepth;
  }

  return out;
}

function pickAnchorRoomId(
  meta: ContentOutputs["meta"],
  candidates: number[],
): number | null {
  if (!candidates.length) return null;

  // Filter invalid ids (0 means corridor / not-room in your regionId mask)
  const rooms = candidates.filter((r) => Number.isFinite(r) && r > 0);
  if (!rooms.length) return null;

  // Deterministic: pick min by roomDistance, tie -> min roomId
  let bestRoom = rooms[0];
  let bestDist = meta.roomDistance.get(bestRoom);

  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const d = meta.roomDistance.get(r);

    // Treat undefined distances as "worst"
    const dBest = bestDist ?? Number.POSITIVE_INFINITY;
    const dHere = d ?? Number.POSITIVE_INFINITY;

    if (dHere < dBest || (dHere === dBest && r < bestRoom)) {
      bestRoom = r;
      bestDist = d;
    }
  }

  return bestRoom;
}

function fillMissingAnchorsFromDeps(
  perCircuit: CircuitRoleRecordV1[],
  circuitEval: CircuitEvalDiagnostics,
) {
  const recByIndex = new Map<number, CircuitRoleRecordV1>();
  for (const r of perCircuit) recByIndex.set(r.circuitIndex, r);

  // Do up to 2 passes to allow shallow propagation even if ordering is odd.
  // (Still deterministic; small constant.)
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;

    for (const cd of circuitEval.perCircuit) {
      const rec = recByIndex.get(cd.circuitIndex);
      if (!rec) continue;
      if (rec.anchor.anchorRoomId != null) continue;

      // Choose upstream anchored circuit with minimal depthN, tie -> smallest circuitIndex
      let best: CircuitRoleRecordV1 | null = null;

      for (const dep of cd.signalDeps ?? []) {
        const up = recByIndex.get(dep.fromCircuitIndex);
        if (!up) continue;
        if (up.anchor.anchorRoomId == null) continue;

        if (!best) {
          best = up;
          continue;
        }

        const a = up.anchor.depthN ?? Number.POSITIVE_INFINITY;
        const b = best.anchor.depthN ?? Number.POSITIVE_INFINITY;

        if (a < b || (a === b && up.circuitIndex < best.circuitIndex)) {
          best = up;
        }
      }

      if (best) {
        rec.anchor = { ...best.anchor };
        changed = true;
      }
    }

    if (!changed) break;
  }
}

// -----------------------------
// Rule evaluation (v1 — conservative, observational)
// -----------------------------

export function evaluateRoleRulesV1(
  perCircuit: CircuitRoleRecordV1[],
  thresholds: RoleThresholdsV1,
): RoleRuleHitV1[] {
  const hits: RoleRuleHitV1[] = [];

  for (const r of perCircuit) {
    const role = r.role;
    const depthN = r.anchor.depthN;
    const roomDepth = r.anchor.roomDepth;
    const topoDepth = r.topoDepth | 0;

    // Role missing: only warn if you've begun assigning roles (heuristic: any non-null roles exist)
    // If you'd rather always warn, remove the "anyRoleAssigned" check.
  }

  const anyRoleAssigned = perCircuit.some((r) => r.role != null);

  for (const r of perCircuit) {
    const role = r.role;
    const depthN = r.anchor.depthN;
    const roomDepth = r.anchor.roomDepth;
    const topoDepth = r.topoDepth | 0;

    if (anyRoleAssigned && role == null) {
      hits.push({
        ruleId: "ROLE_MISSING",
        role: null,
        circuitIndex: r.circuitIndex,
        depthN,
        roomDepth,
        topoDepth,
        code: "ROLE_MISSING",
        detail: "Circuit has no role annotation.",
      });
    }

    if (role === "MAIN_PATH_GATE") {
      // MAIN_TRIVIAL: topoDepth below ramped minimum
      const minTD = requiredMinTopoDepth(depthN, thresholds.main.minTopoDepth);
      if (minTD != null && topoDepth < minTD) {
        hits.push({
          ruleId: "MAIN_TRIVIAL",
          role,
          circuitIndex: r.circuitIndex,
          depthN,
          roomDepth,
          topoDepth,
          code: `MAIN_TD_LT_${minTD}`,
          detail: `Main gate topoDepth ${topoDepth} < min ${minTD} at depthN=${fmt(depthN)}`,
        });
      }

      // MAIN_LATE_TRIVIAL: late in dungeon but still < lateMinTopoDepth
      if (
        depthN != null &&
        depthN >= thresholds.main.lateStartsAtDepthN &&
        topoDepth < thresholds.main.lateMinTopoDepth
      ) {
        hits.push({
          ruleId: "MAIN_LATE_TRIVIAL",
          role,
          circuitIndex: r.circuitIndex,
          depthN,
          roomDepth,
          topoDepth,
          code: `MAIN_LATE_TD_LT_${thresholds.main.lateMinTopoDepth}`,
          detail: `Late main gate topoDepth ${topoDepth} < ${thresholds.main.lateMinTopoDepth}`,
        });
      }

      // MAIN_TOO_DEEP_EARLY: rare guardrail
      if (
        depthN != null &&
        depthN <= thresholds.main.earlyEndsAtDepthN &&
        topoDepth > thresholds.main.earlyMaxTopoDepth
      ) {
        hits.push({
          ruleId: "MAIN_TOO_DEEP_EARLY",
          role,
          circuitIndex: r.circuitIndex,
          depthN,
          roomDepth,
          topoDepth,
          code: `MAIN_EARLY_TD_GT_${thresholds.main.earlyMaxTopoDepth}`,
          detail: `Early main gate topoDepth ${topoDepth} > ${thresholds.main.earlyMaxTopoDepth}`,
        });
      }
    }

    if (role === "OPTIONAL_REWARD") {
      if (
        depthN != null &&
        depthN >= thresholds.optional.lateStartsAtDepthN &&
        topoDepth < thresholds.optional.lateMinTopoDepth
      ) {
        hits.push({
          ruleId: "OPTIONAL_TRIVIAL",
          role,
          circuitIndex: r.circuitIndex,
          depthN,
          roomDepth,
          topoDepth,
          code: `OPT_LATE_TD_LT_${thresholds.optional.lateMinTopoDepth}`,
          detail: `Late optional topoDepth ${topoDepth} < ${thresholds.optional.lateMinTopoDepth}`,
        });
      }
      // OPTIONAL_OVERGATED_BY_MAIN is intentionally left for Phase 2+ once you compute dependency closure by role.
    }

    if (role === "FORESHADOW") {
      if (topoDepth > thresholds.foreshadow.maxTopoDepth) {
        hits.push({
          ruleId: "FORESHADOW_TOO_DEEP",
          role,
          circuitIndex: r.circuitIndex,
          depthN,
          roomDepth,
          topoDepth,
          code: `FS_TD_GT_${thresholds.foreshadow.maxTopoDepth}`,
          detail: `Foreshadow topoDepth ${topoDepth} > ${thresholds.foreshadow.maxTopoDepth}`,
        });
      }
      if (
        depthN != null &&
        depthN > thresholds.foreshadow.mustOccurBeforeDepthN
      ) {
        hits.push({
          ruleId: "FORESHADOW_AFTER_MAIN",
          role,
          circuitIndex: r.circuitIndex,
          depthN,
          roomDepth,
          topoDepth,
          code: `FS_DEPTHN_GT_${fmt(thresholds.foreshadow.mustOccurBeforeDepthN)}`,
          detail: `Foreshadow appears late (depthN=${fmt(depthN)}).`,
        });
      }
    }

    // SHORTCUT_NOT_REDUCING_DISTANCE requires endpoint roomIds; leave for when shortcut semantics are introduced.
  }

  return hits;
}

function requiredMinTopoDepth(
  depthN: number | null,
  ramp: Array<{ atLeastDepthN: number; minTopoDepth: number }>,
): number | null {
  if (depthN == null) return null;
  let best: number | null = null;
  for (const r of ramp) {
    if (depthN >= r.atLeastDepthN) best = r.minTopoDepth;
  }
  return best;
}

// -----------------------------
// Summary stats
// -----------------------------

export function summarizeRoleDiagnosticsV1(
  perCircuit: CircuitRoleRecordV1[],
  hits: RoleRuleHitV1[],
): RoleSummaryStatsV1 {
  const roles: PuzzleRole[] = [
    "MAIN_PATH_GATE",
    "OPTIONAL_REWARD",
    "SHORTCUT",
    "FORESHADOW",
  ];

  const roleCounts: Record<PuzzleRole, number> = {
    MAIN_PATH_GATE: 0,
    OPTIONAL_REWARD: 0,
    SHORTCUT: 0,
    FORESHADOW: 0,
  };

  let roleMissingCount = 0;

  const topoDepthsByRole: Record<PuzzleRole, number[]> = {
    MAIN_PATH_GATE: [],
    OPTIONAL_REWARD: [],
    SHORTCUT: [],
    FORESHADOW: [],
  };

  const depthNsByRole: Record<PuzzleRole, number[]> = {
    MAIN_PATH_GATE: [],
    OPTIONAL_REWARD: [],
    SHORTCUT: [],
    FORESHADOW: [],
  };

  for (const r of perCircuit) {
    if (r.role == null) {
      roleMissingCount++;
      continue;
    }
    roleCounts[r.role]++;

    topoDepthsByRole[r.role].push(r.topoDepth | 0);
    if (r.anchor.depthN != null) depthNsByRole[r.role].push(r.anchor.depthN);
  }

  const topoDepthByRole = {} as RoleSummaryStatsV1["topoDepthByRole"];
  const depthNByRole = {} as RoleSummaryStatsV1["depthNByRole"];

  for (const role of roles) {
    topoDepthByRole[role] = statsOf(topoDepthsByRole[role]);
    depthNByRole[role] = statsOf(depthNsByRole[role]);
  }

  const ruleCounts: Record<RoleRuleId, number> = {} as any;
  for (const h of hits) {
    ruleCounts[h.ruleId] = (ruleCounts[h.ruleId] ?? 0) + 1;
  }

  // Ensure all known rules appear (batch-safe shape)
  const allRuleIds: RoleRuleId[] = [
    "ROLE_MISSING",
    "ROLE_UNKNOWN",
    "ROLE_DUPLICATE",
    "MAIN_TRIVIAL",
    "MAIN_LATE_TRIVIAL",
    "MAIN_TOO_DEEP_EARLY",
    "OPTIONAL_TRIVIAL",
    "OPTIONAL_OVERGATED_BY_MAIN",
    "SHORTCUT_NOT_REDUCING_DISTANCE",
    "FORESHADOW_AFTER_MAIN",
    "FORESHADOW_TOO_DEEP",
  ];
  for (const id of allRuleIds) ruleCounts[id] = ruleCounts[id] ?? 0;

  return {
    schemaVersion: 1,
    roleCounts,
    roleMissingCount,
    topoDepthByRole,
    depthNByRole,
    ruleCounts,
  };
}

function statsOf(values: number[]): {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  avg: number;
} {
  if (!values.length) {
    return { min: 0, p25: 0, median: 0, p75: 0, max: 0, avg: 0 };
  }
  const v = values.slice().sort((a, b) => a - b);
  const min = v[0];
  const max = v[v.length - 1];
  const avg = v.reduce((s, x) => s + x, 0) / v.length;
  const p25 = quantileSorted(v, 0.25);
  const median = quantileSorted(v, 0.5);
  const p75 = quantileSorted(v, 0.75);
  return { min, p25, median, p75, max, avg };
}

function quantileSorted(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];

  const pos = (sorted.length - 1) * q;
  const i0 = Math.floor(pos);
  const i1 = Math.ceil(pos);
  if (i0 === i1) return sorted[i0];
  const t = pos - i0;
  return sorted[i0] * (1 - t) + sorted[i1] * t;
}

// -----------------------------
// Helpers
// -----------------------------

function getMaxRoomDepth(meta: ContentOutputs["meta"]): number {
  const d = meta.roomDistance.get(meta.farthestRoomId);
  if (typeof d === "number" && Number.isFinite(d)) return Math.max(1, d | 0);

  // Fallback: scan map
  let mx = 1;
  for (const v of meta.roomDistance.values()) {
    if (typeof v === "number" && Number.isFinite(v)) mx = Math.max(mx, v | 0);
  }
  return Math.max(1, mx);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function fmt(v: number | null | undefined) {
  if (v == null) return "null";
  return (Math.round(v * 1000) / 1000).toString();
}
