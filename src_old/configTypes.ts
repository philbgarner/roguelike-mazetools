// src/configTypes.ts
//
// Pure data types and default constants for dungeon generation configuration.
// Shared by both runtime (src/api/*, validators) and dev-harness (wizard).
// MUST NOT import React, R3F, or any UI module.

export type BspConfig = {
  maxDepth: number;
  minLeafSize: number;
  maxLeafSize: number;
  splitPadding: number;

  roomPadding: number;
  minRoomSize: number;
  maxRoomSize: number;
  roomFillLeafChance: number;

  corridorWidth: number;
  keepOuterWalls: boolean;
};

export type ContentStrategy = "atomic" | "patterns";

export type PatternConfig = {
  // Phase 2 patterns (atomic-ish)
  includeLeverHiddenPocket: boolean;
  leverHiddenPocketSize: number;

  includeLeverOpensDoor: boolean;
  leverOpensDoorCount: number;

  includePlateOpensDoor: boolean;
  plateOpensDoorCount: number;

  includeIntroGate: boolean;

  patternMaxAttempts: number;

  // Phase 3 compositions
  includePhase3Compositions: boolean;
  gateThenOptionalRewardCount: number;
};

export type BatchConfig = {
  runs: number;
  seedPrefix: string;
  startIndex: number;
  summaryOnly: boolean;
};

// Milestone 6, Phase 1 — Content Budgets (authorial controls)
export type ContentBudgetEntry = {
  min?: number; // undefined = no floor
  max?: number; // undefined = no cap
};

export type ContentBudget = {
  levers?: ContentBudgetEntry;
  doors?: ContentBudgetEntry;
  plates?: ContentBudgetEntry;
  blocks?: ContentBudgetEntry;
  chests?: ContentBudgetEntry;
  secrets?: ContentBudgetEntry;
  hazards?: ContentBudgetEntry;
  monsters?: ContentBudgetEntry;
  keys?: ContentBudgetEntry;
  circuits?: ContentBudgetEntry;
};

// Milestone 6, Phase 2 — Difficulty Bands
export type DifficultyBandEntry = {
  min?: number;
  max?: number;
};

export type DifficultyBand = {
  totalRooms?: DifficultyBandEntry;
  criticalPathLength?: DifficultyBandEntry;
  maxGateDepth?: DifficultyBandEntry;
  branchCount?: DifficultyBandEntry;
  puzzleDensity?: DifficultyBandEntry; // ratio: puzzles per room
};

// Milestone 6, Phase 3 — Pacing Targets
export type RampProfile = "linear" | "front-loaded" | "back-loaded";

export type PacingTargets = {
  firstGateDistance?: { min?: number; max?: number };
  rewardAfterGate?: { enabled?: boolean; maxDistance?: number };
  contentFreeIntro?: { min?: number };
  shortcutPresent?: { required?: boolean };
  rampProfile?: { target?: RampProfile };
};

// Milestone 6, Phase 4 — Exclusion / Inclusion Rules
export type InclusionRules = {
  excludePatterns?: string[]; // pre-gen: forcibly skip these pattern names
  requirePatterns?: string[]; // post-gen: these pattern names must have ok=true in diagnostics
  requireContentTypes?: string[]; // post-gen: these meta arrays must be non-empty
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_BSP: BspConfig = {
  maxDepth: 6,
  minLeafSize: 12,
  maxLeafSize: 28,
  splitPadding: 2,

  roomPadding: 4,
  minRoomSize: 5,
  maxRoomSize: 12,
  roomFillLeafChance: 0.9,

  corridorWidth: 1,
  keepOuterWalls: true,
};

export const DEFAULT_PATTERN: PatternConfig = {
  includeLeverHiddenPocket: true,
  leverHiddenPocketSize: 5,

  includeLeverOpensDoor: true,
  leverOpensDoorCount: 1,

  includePlateOpensDoor: true,
  plateOpensDoorCount: 1,

  includeIntroGate: true,

  patternMaxAttempts: 60,

  includePhase3Compositions: true,
  gateThenOptionalRewardCount: 1,
};

export const DEFAULT_BATCH: BatchConfig = {
  runs: 300,
  seedPrefix: "batch",
  startIndex: 0,
  summaryOnly: true,
};
