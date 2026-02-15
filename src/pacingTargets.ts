// src/pacingTargets.ts
//
// Milestone 6 Phase 3 — Pacing Targets: Post-Generation Validation
//
// Measures progression rhythm along the critical path and validates
// against authorial pacing constraints. Metrics are always computed
// (even when unconstrained) so inspection can display them.

import type { PacingTargets, RampProfile } from "./wizard/wizardReducer";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type PacingViolation = {
  metric: string;
  actual: number | string | boolean;
  expected?: number | string | boolean;
  detail?: string;
};

export type PacingMetrics = {
  /** Rooms on critical path before the first gate. -1 if no gates. */
  firstGateDistance: number;

  /** Fraction of gates with a reward within range (0..1). */
  rewardAfterGateRate: number;
  /** Total gates checked for reward-after-gate. */
  rewardAfterGateTotal: number;
  /** Gates that passed the reward-after-gate check. */
  rewardAfterGatePassed: number;

  /** Consecutive rooms at the start of critical path with zero content. */
  contentFreeIntroCount: number;

  /** Whether at least one shortcut/loop exists. */
  shortcutPresent: boolean;

  /** Classified ramp profile based on content density across 3 buckets. */
  rampProfileActual: RampProfile;
  /** Content counts per bucket (for inspection). */
  rampBuckets: [number, number, number];
};

export type PacingResult = {
  pass: boolean;
  violations: PacingViolation[];
  metrics: PacingMetrics;
};

// ---------------------------------------------------------------------------
// Internal meta shape (kept minimal — cast from content.meta)
// ---------------------------------------------------------------------------

type PacingMeta = {
  mainPathRoomIds: number[];
  roomGraph: Map<number, Set<number>>;
  doors: Array<{ id: number; roomA: number; roomB: number; depth: number }>;
  chests: Array<{ roomId: number }>;
  monsters: Array<{ roomId: number }>;
  hazards: Array<{ roomId: number }>;
  levers: Array<{ roomId: number }>;
  plates: Array<{ roomId: number }>;
  blocks: Array<{ roomId: number }>;
};

// ---------------------------------------------------------------------------
// Metric computations
// ---------------------------------------------------------------------------

function computeFirstGateDistance(meta: PacingMeta): number {
  const mainSet = new Set(meta.mainPathRoomIds);
  const gatePositions: number[] = [];
  for (const door of meta.doors) {
    if (mainSet.has(door.roomA) && mainSet.has(door.roomB)) {
      // Gate is encountered at whichever room comes later on the path.
      const idxA = meta.mainPathRoomIds.indexOf(door.roomA);
      const idxB = meta.mainPathRoomIds.indexOf(door.roomB);
      gatePositions.push(Math.max(idxA, idxB));
    }
  }
  if (gatePositions.length === 0) return -1;
  return Math.min(...gatePositions);
}

function computeRewardAfterGate(
  meta: PacingMeta,
  maxDistance: number,
): { total: number; passed: number } {
  const mainSet = new Set(meta.mainPathRoomIds);
  const chestRoomSet = new Set(meta.chests.map((c) => c.roomId));

  const gatePositions: number[] = [];
  for (const door of meta.doors) {
    if (mainSet.has(door.roomA) && mainSet.has(door.roomB)) {
      const idxA = meta.mainPathRoomIds.indexOf(door.roomA);
      const idxB = meta.mainPathRoomIds.indexOf(door.roomB);
      gatePositions.push(Math.max(idxA, idxB));
    }
  }

  let passed = 0;
  for (const pos of gatePositions) {
    const end = Math.min(pos + maxDistance, meta.mainPathRoomIds.length - 1);
    let found = false;
    for (let i = pos; i <= end; i++) {
      if (chestRoomSet.has(meta.mainPathRoomIds[i])) {
        found = true;
        break;
      }
    }
    if (found) passed++;
  }
  return { total: gatePositions.length, passed };
}

function computeContentFreeIntro(meta: PacingMeta): number {
  const contentRooms = new Set<number>();
  for (const m of meta.monsters) contentRooms.add(m.roomId);
  for (const h of meta.hazards) contentRooms.add(h.roomId);
  for (const d of meta.doors) {
    contentRooms.add(d.roomA);
    contentRooms.add(d.roomB);
  }
  for (const c of meta.chests) contentRooms.add(c.roomId);
  for (const l of meta.levers) contentRooms.add(l.roomId);
  for (const p of meta.plates) contentRooms.add(p.roomId);
  for (const b of meta.blocks) contentRooms.add(b.roomId);

  let count = 0;
  for (const roomId of meta.mainPathRoomIds) {
    if (contentRooms.has(roomId)) break;
    count++;
  }
  return count;
}

function computeShortcutPresent(meta: PacingMeta): boolean {
  let edgeCount = 0;
  for (const [, neighbors] of meta.roomGraph) {
    edgeCount += neighbors.size;
  }
  edgeCount /= 2; // undirected
  const nodeCount = meta.roomGraph.size;
  return edgeCount > nodeCount - 1;
}

function computeRampProfile(meta: PacingMeta): {
  profile: RampProfile;
  buckets: [number, number, number];
} {
  const path = meta.mainPathRoomIds;
  const len = path.length;
  if (len === 0) return { profile: "linear", buckets: [0, 0, 0] };

  const third = Math.ceil(len / 3);
  const bucketRanges = [
    path.slice(0, third),
    path.slice(third, third * 2),
    path.slice(third * 2),
  ];

  const roomContentCount = new Map<number, number>();
  const inc = (roomId: number) =>
    roomContentCount.set(roomId, (roomContentCount.get(roomId) ?? 0) + 1);

  for (const m of meta.monsters) inc(m.roomId);
  for (const h of meta.hazards) inc(h.roomId);
  for (const c of meta.chests) inc(c.roomId);

  // Only count doors on the critical path.
  const mainSet = new Set(path);
  for (const d of meta.doors) {
    if (mainSet.has(d.roomA) && mainSet.has(d.roomB)) {
      inc(d.roomA);
      inc(d.roomB);
    }
  }

  const buckets: [number, number, number] = [0, 0, 0];
  for (let b = 0; b < 3; b++) {
    for (const roomId of bucketRanges[b]) {
      buckets[b] += roomContentCount.get(roomId) ?? 0;
    }
  }

  const total = buckets[0] + buckets[1] + buckets[2];
  if (total === 0) return { profile: "linear", buckets };

  const frontRatio = buckets[0] / Math.max(buckets[2], 0.5);
  const backRatio = buckets[2] / Math.max(buckets[0], 0.5);

  let profile: RampProfile = "linear";
  if (frontRatio > 1.5 && buckets[0] >= buckets[1]) {
    profile = "front-loaded";
  } else if (backRatio > 1.5 && buckets[2] >= buckets[1]) {
    profile = "back-loaded";
  }

  return { profile, buckets };
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

export function validatePacingTargets(
  meta: PacingMeta,
  targets: PacingTargets | null,
): PacingResult {
  const firstGateDistance = computeFirstGateDistance(meta);

  const rewardMaxDist = targets?.rewardAfterGate?.maxDistance ?? 2;
  const rewardResult = computeRewardAfterGate(meta, rewardMaxDist);

  const contentFreeIntroCount = computeContentFreeIntro(meta);
  const shortcutPresent = computeShortcutPresent(meta);
  const ramp = computeRampProfile(meta);

  const metrics: PacingMetrics = {
    firstGateDistance,
    rewardAfterGateRate:
      rewardResult.total > 0
        ? Math.round((rewardResult.passed / rewardResult.total) * 100) / 100
        : 1,
    rewardAfterGateTotal: rewardResult.total,
    rewardAfterGatePassed: rewardResult.passed,
    contentFreeIntroCount,
    shortcutPresent,
    rampProfileActual: ramp.profile,
    rampBuckets: ramp.buckets,
  };

  const violations: PacingViolation[] = [];

  if (targets) {
    // 1. firstGateDistance min/max
    const fgd = targets.firstGateDistance;
    if (fgd && firstGateDistance >= 0) {
      if (fgd.min != null && firstGateDistance < fgd.min) {
        violations.push({
          metric: "firstGateDistance",
          actual: firstGateDistance,
          expected: fgd.min,
          detail: `First gate at position ${firstGateDistance}, min is ${fgd.min}`,
        });
      }
      if (fgd.max != null && firstGateDistance > fgd.max) {
        violations.push({
          metric: "firstGateDistance",
          actual: firstGateDistance,
          expected: fgd.max,
          detail: `First gate at position ${firstGateDistance}, max is ${fgd.max}`,
        });
      }
    }
    // No gates on critical path but min constraint set → violation.
    if (fgd && firstGateDistance === -1 && fgd.min != null) {
      violations.push({
        metric: "firstGateDistance",
        actual: -1,
        detail: "No gates on critical path but min distance constraint set",
      });
    }

    // 2. rewardAfterGate
    const rag = targets.rewardAfterGate;
    if (
      rag?.enabled &&
      rewardResult.total > 0 &&
      rewardResult.passed < rewardResult.total
    ) {
      violations.push({
        metric: "rewardAfterGate",
        actual: rewardResult.passed,
        expected: rewardResult.total,
        detail: `${rewardResult.passed}/${rewardResult.total} gates have reward within ${rewardMaxDist} rooms`,
      });
    }

    // 3. contentFreeIntro
    const cfi = targets.contentFreeIntro;
    if (cfi?.min != null && contentFreeIntroCount < cfi.min) {
      violations.push({
        metric: "contentFreeIntro",
        actual: contentFreeIntroCount,
        expected: cfi.min,
        detail: `${contentFreeIntroCount} content-free intro rooms, min is ${cfi.min}`,
      });
    }

    // 4. shortcutPresent
    const sp = targets.shortcutPresent;
    if (sp?.required && !shortcutPresent) {
      violations.push({
        metric: "shortcutPresent",
        actual: false,
        expected: true,
        detail: "No shortcut/loop detected but required",
      });
    }

    // 5. rampProfile
    const rp = targets.rampProfile;
    if (rp?.target && ramp.profile !== rp.target) {
      violations.push({
        metric: "rampProfile",
        actual: ramp.profile,
        expected: rp.target,
        detail: `Ramp is "${ramp.profile}" but target is "${rp.target}" (buckets: ${ramp.buckets.join(", ")})`,
      });
    }
  }

  return { pass: violations.length === 0, violations, metrics };
}
