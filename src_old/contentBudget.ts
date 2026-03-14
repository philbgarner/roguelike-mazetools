// src/contentBudget.ts
//
// Milestone 6 — Authorial Controls: Post-Generation Validation
//
// Phase 1: Content Budget Validation (item count min/max)
// Phase 2: Difficulty Band Validation (structural metrics)
//
// Post-generation validation: checks generated content against authorial
// constraints. No changes to pattern logic. Failures are acceptable —
// the batch curation workflow filters them out.

import type {
  ContentBudget,
  ContentBudgetEntry,
  DifficultyBand,
  DifficultyBandEntry,
} from "./configTypes";

export type BudgetViolation = {
  category: string; // "levers", "doors", etc.
  actual: number;
  min?: number;
  max?: number;
};

export type BudgetResult = {
  pass: boolean;
  violations: BudgetViolation[];
};

type CountableMeta = {
  levers: unknown[];
  doors: unknown[];
  plates: unknown[];
  blocks: unknown[];
  chests: unknown[];
  secrets: unknown[];
  hazards: unknown[];
  monsters: unknown[];
  keys: unknown[];
  circuits: unknown[];
};

function checkEntry(
  category: string,
  count: number,
  entry: ContentBudgetEntry | undefined,
  out: BudgetViolation[],
): void {
  if (!entry) return;
  if (entry.min != null && count < entry.min) {
    out.push({ category, actual: count, min: entry.min });
  }
  if (entry.max != null && count > entry.max) {
    out.push({ category, actual: count, max: entry.max });
  }
}

export function validateContentBudget(
  meta: CountableMeta,
  budget: ContentBudget,
): BudgetResult {
  const violations: BudgetViolation[] = [];

  checkEntry("levers", meta.levers.length, budget.levers, violations);
  checkEntry("doors", meta.doors.length, budget.doors, violations);
  checkEntry("plates", meta.plates.length, budget.plates, violations);
  checkEntry("blocks", meta.blocks.length, budget.blocks, violations);
  checkEntry("chests", meta.chests.length, budget.chests, violations);
  checkEntry("secrets", meta.secrets.length, budget.secrets, violations);
  checkEntry("hazards", meta.hazards.length, budget.hazards, violations);
  checkEntry("monsters", meta.monsters.length, budget.monsters, violations);
  checkEntry("keys", meta.keys.length, budget.keys, violations);
  checkEntry("circuits", meta.circuits.length, budget.circuits, violations);

  return { pass: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Phase 2: Difficulty Band Validation
// ---------------------------------------------------------------------------

export type DifficultyViolation = {
  metric: string; // "totalRooms", "criticalPathLength", etc.
  actual: number;
  min?: number;
  max?: number;
};

export type DifficultyMetrics = {
  totalRooms: number;
  criticalPathLength: number;
  maxGateDepth: number;
  branchCount: number;
  puzzleDensity: number; // puzzles per room, rounded to 2 decimals
};

export type DifficultyResult = {
  pass: boolean;
  violations: DifficultyViolation[];
  metrics: DifficultyMetrics;
};

type DifficultyMeta = {
  rooms: unknown[];
  mainPathRoomIds: number[];
  roomGraph: Map<number, Set<number>>;
  doors: Array<{ depth?: number }>;
  levers: unknown[];
  plates: unknown[];
  blocks: unknown[];
};

function checkBandEntry(
  metric: string,
  value: number,
  entry: DifficultyBandEntry | undefined,
  out: DifficultyViolation[],
): void {
  if (!entry) return;
  if (entry.min != null && value < entry.min) {
    out.push({ metric, actual: value, min: entry.min });
  }
  if (entry.max != null && value > entry.max) {
    out.push({ metric, actual: value, max: entry.max });
  }
}

export function validateDifficultyBand(
  meta: DifficultyMeta,
  band: DifficultyBand | null,
): DifficultyResult {
  const totalRooms = meta.rooms.length;
  const criticalPathLength = meta.mainPathRoomIds.length;

  // Max gate depth: highest depth value across all doors (0 if no doors)
  let maxGateDepth = 0;
  for (const d of meta.doors) {
    const depth = typeof d.depth === "number" ? d.depth : 0;
    if (depth > maxGateDepth) maxGateDepth = depth;
  }

  // Branch count: rooms not on main path with degree <= 1 (dead-end side rooms)
  const mainPathSet = new Set(meta.mainPathRoomIds);
  let branchCount = 0;
  for (const [roomId, neighbors] of meta.roomGraph) {
    if (!mainPathSet.has(roomId) && neighbors.size <= 1) {
      branchCount++;
    }
  }

  // Puzzle density: (doors + levers + plates + blocks) / rooms
  const puzzleItems =
    meta.doors.length +
    meta.levers.length +
    meta.plates.length +
    meta.blocks.length;
  const puzzleDensity =
    totalRooms > 0 ? Math.round((puzzleItems / totalRooms) * 100) / 100 : 0;

  const metrics: DifficultyMetrics = {
    totalRooms,
    criticalPathLength,
    maxGateDepth,
    branchCount,
    puzzleDensity,
  };

  const violations: DifficultyViolation[] = [];

  if (band) {
    checkBandEntry("totalRooms", totalRooms, band.totalRooms, violations);
    checkBandEntry(
      "criticalPathLength",
      criticalPathLength,
      band.criticalPathLength,
      violations,
    );
    checkBandEntry("maxGateDepth", maxGateDepth, band.maxGateDepth, violations);
    checkBandEntry("branchCount", branchCount, band.branchCount, violations);
    checkBandEntry(
      "puzzleDensity",
      puzzleDensity,
      band.puzzleDensity,
      violations,
    );
  }

  return { pass: violations.length === 0, violations, metrics };
}
