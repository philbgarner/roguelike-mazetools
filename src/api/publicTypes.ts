/**
 * Public API types for mazegen.
 *
 * Session 1 scaffold — request/result shapes are stable;
 * `resolved` and `theme` will be populated in later sessions.
 */

import type {
  BspDungeonOptions,
  BspDungeonOutputs,
  ContentOutputs,
} from "../mazeGen";
import type {
  ContentBudget,
  ContentStrategy,
  DifficultyBand,
  InclusionRules,
  PacingTargets,
  PatternConfig,
} from "../configTypes";
import type { BudgetResult, DifficultyResult } from "../contentBudget";
import type { PacingResult } from "../pacingTargets";
import type { InclusionResult } from "../inclusionRules";
import type { PatternDiagnostics, PuzzleRole } from "../puzzlePatterns";
import type { ThemeResolvedPayload } from "../theme/themeTypes";
import type { ResolvedSpawns } from "../resolve/resolveTypes";

// Re-export for consumer convenience
export type {
  BspDungeonOptions,
  BspDungeonOutputs,
  ContentOutputs,
  ContentBudget,
  ContentStrategy,
  DifficultyBand,
  InclusionRules,
  PacingTargets,
  PatternConfig,
  BudgetResult,
  DifficultyResult,
  PacingResult,
  InclusionResult,
  PatternDiagnostics,
  PuzzleRole,
  ThemeResolvedPayload,
  ResolvedSpawns,
};

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type GenerateDungeonRequest = {
  /** Seed for deterministic generation. */
  seed: number | string;

  /** Dungeon depth / level. Reserved for future theme scaling. */
  level: number;

  /** Theme identifier (stub — no theme registry yet). */
  themeId?: string;

  // -- Generation config (optional overrides; sensible defaults applied) ----

  /** Dungeon width in cells. Default 96. */
  width?: number;

  /** Dungeon height in cells. Default 96. */
  height?: number;

  /** BSP tree overrides. Merged with DEFAULT_BSP. */
  bsp?: Partial<BspDungeonOptions>;

  /** Pattern placement overrides. Merged with DEFAULT_PATTERN. */
  pattern?: Partial<PatternConfig>;

  /** "atomic" skips puzzle patterns; "patterns" (default) enables them. */
  contentStrategy?: ContentStrategy;

  // -- Authorial controls (optional — null/undefined = skip validation) -----
  // Provide either an inline value or a preset ID. Inline takes precedence.

  difficultyBandId?: string;
  difficultyBand?: DifficultyBand | null;

  budgetId?: string;
  contentBudget?: ContentBudget | null;

  pacingId?: string;
  pacingTargets?: PacingTargets | null;

  inclusionRules?: InclusionRules | null;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type GenerateDungeonResult = {
  bsp: BspDungeonOutputs;
  content: ContentOutputs;

  /** Theme-resolved spawnables. null when no themeId provided. */
  resolved: ResolvedSpawns | null;

  /** Theme payload (render uniforms + identifiers). null when no themeId provided. */
  theme: ThemeResolvedPayload | null;

  /** Authorial-control validation results. */
  validation: {
    budget: BudgetResult | null;
    difficulty: DifficultyResult;
    pacing: PacingResult;
    inclusion: InclusionResult;
  };

  /** Diagnostics pass-through from the generator. */
  diagnostics: {
    patterns: PatternDiagnostics[];
    circuitRoles: Record<number, PuzzleRole> | undefined;
  };

  meta: {
    seedUsed: number;
  };
};
