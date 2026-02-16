/**
 * Public API entry point — Session 1 scaffold.
 *
 * Wraps the existing generator + validators into a single call.
 * `resolved` and `theme` are stubs (null) until later sessions.
 */

import { generateBspDungeon, generateDungeonContent } from "../mazeGen";
import { DEFAULT_BSP, DEFAULT_PATTERN } from "../configTypes";
import {
  validateContentBudget,
  validateDifficultyBand,
} from "../contentBudget";
import { validatePacingTargets } from "../pacingTargets";
import { validateInclusionRules } from "../inclusionRules";
import type {
  GenerateDungeonRequest,
  GenerateDungeonResult,
} from "./publicTypes";

const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 96;

export function generateDungeon(
  request: GenerateDungeonRequest,
): GenerateDungeonResult {
  const {
    seed,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    bsp: bspOverrides,
    pattern: patternOverrides,
    contentStrategy = "patterns",
    difficultyBand = null,
    contentBudget = null,
    pacingTargets = null,
    inclusionRules = null,
  } = request;

  // ---- BSP generation -----------------------------------------------------

  const bspOpts = {
    width,
    height,
    seed,
    ...DEFAULT_BSP,
    ...bspOverrides,
  };

  const bsp = generateBspDungeon(bspOpts);

  // ---- Content generation -------------------------------------------------

  const p = { ...DEFAULT_PATTERN, ...patternOverrides };
  const isAtomic = contentStrategy === "atomic";

  const contentOpts = {
    seed,

    includeLeverHiddenPocket: isAtomic ? false : p.includeLeverHiddenPocket,
    leverHiddenPocketSize: p.leverHiddenPocketSize,

    includeLeverOpensDoor: isAtomic ? false : p.includeLeverOpensDoor,
    leverOpensDoorCount: p.leverOpensDoorCount,

    includePlateOpensDoor: isAtomic ? false : p.includePlateOpensDoor,
    plateOpensDoorCount: p.plateOpensDoorCount,

    includeIntroGate: isAtomic ? false : p.includeIntroGate,

    patternMaxAttempts: p.patternMaxAttempts,

    includePhase3Compositions: isAtomic ? false : p.includePhase3Compositions,
    gateThenOptionalRewardCount: isAtomic ? 0 : p.gateThenOptionalRewardCount,

    excludePatterns: inclusionRules?.excludePatterns,
  };

  const content = generateDungeonContent(bsp, contentOpts);

  // Normalize arrays that downstream code iterates (matches App.tsx pattern)
  if (!content.meta) (content as any).meta = {} as any;
  if (!Array.isArray((content.meta as any).plates))
    (content.meta as any).plates = [];
  if (!Array.isArray((content.meta as any).circuits))
    (content.meta as any).circuits = [];

  // ---- Validation ---------------------------------------------------------

  const budgetResult = contentBudget
    ? validateContentBudget(content.meta as any, contentBudget)
    : null;

  const difficultyResult = validateDifficultyBand(
    content.meta as any,
    difficultyBand,
  );

  const pacingResult = validatePacingTargets(
    content.meta as any,
    pacingTargets,
  );

  const inclusionResult = validateInclusionRules(
    content.meta as any,
    inclusionRules,
    content.meta.patternDiagnostics ?? [],
  );

  // ---- Assemble result ----------------------------------------------------

  return {
    bsp,
    content,

    resolved: null,
    theme: null,

    validation: {
      budget: budgetResult,
      difficulty: difficultyResult,
      pacing: pacingResult,
      inclusion: inclusionResult,
    },

    diagnostics: {
      patterns: content.meta.patternDiagnostics ?? [],
      circuitRoles: content.meta.circuitRoles,
    },

    meta: {
      seedUsed: bsp.meta?.seedUsed ?? 0,
    },
  };
}
