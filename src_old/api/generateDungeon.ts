/**
 * Public API entry point.
 *
 * Wraps the existing generator + validators into a single call.
 */

import { generateBspDungeon, generateDungeonContent } from "../mazeGen";
import type { CircuitDef } from "../mazeGen";
import { DEFAULT_BSP, DEFAULT_PATTERN } from "../configTypes";
import { getTheme } from "../theme/themeRegistry";
import { dungeonThemeToShaderUniforms } from "../rendering/renderTheme";
import { computeRoomTags } from "../theme/roomTags";
import { selectAllRoomThemes } from "../theme/selectRoomThemes";
import { resolveSpawns } from "../resolve/resolveSpawns";
import {
  validateContentBudget,
  validateDifficultyBand,
} from "../contentBudget";
import { validatePacingTargets } from "../pacingTargets";
import { validateInclusionRules } from "../inclusionRules";
import { getBand, getBudget, getPacingPreset } from "./authorialPresets";
import { applyBossRoomGatePattern } from "../puzzlePatterns";
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
    level,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    bsp: bspOverrides,
    pattern: patternOverrides,
    contentStrategy = "patterns",
    isFinalFloor = true,
    difficultyBandId,
    difficultyBand = null,
    budgetId,
    contentBudget = null,
    pacingId,
    pacingTargets = null,
    inclusionRules = null,
  } = request;

  // ---- Resolve preset IDs (inline values take precedence) -----------------

  const resolvedBand =
    difficultyBand ?? (difficultyBandId ? getBand(difficultyBandId) : null);
  const resolvedBudget =
    contentBudget ?? (budgetId ? getBudget(budgetId) : null);
  const resolvedPacing =
    pacingTargets ?? (pacingId ? getPacingPreset(pacingId) : null);

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
    level,
    guaranteeChestInFarthestRoom: true,

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

    // Scatter a few pickups per floor; deeper floors get slightly more.
    floorItemsTargetCount: Math.max(2, level + 1),
  };

  const content = generateDungeonContent(bsp, contentOpts);

  // --- Boss room gate (final floor only) ---
  if (isFinalFloor) {
    // Seeded RNG offset from the main dungeon seed
    const seedNum = bsp.meta?.seedUsed ?? 0;
    let t = (seedNum + 0xb055_babe) >>> 0;
    function mulberry32step(): number {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    }
    const patternRng = {
      nextFloat(): number {
        return mulberry32step();
      },
      nextInt(lo: number, hi: number): number {
        return lo + Math.floor(mulberry32step() * (hi - lo + 1));
      },
    };

    // Allocate IDs above all existing ones
    let maxId = 0;
    for (const arr of [
      content.meta.doors,
      content.meta.levers,
      content.meta.plates,
      content.meta.blocks,
      content.meta.circuits,
    ] as Array<Array<{ id: number }>>) {
      for (const item of arr) if (item.id > maxId) maxId = item.id;
    }
    let nextId = maxId + 1;

    const circuitsById = new Map<number, CircuitDef>();
    const result = applyBossRoomGatePattern({
      rng: patternRng,
      dungeon: bsp,
      rooms: bsp.meta.rooms,
      entranceRoomId: content.meta.entranceRoomId,
      farthestRoomId: content.meta.farthestRoomId,
      roomDistance: content.meta.roomDistance,
      featureType: content.masks.featureType,
      featureId: content.masks.featureId,
      featureParam: content.masks.featureParam,
      doors: content.meta.doors,
      levers: content.meta.levers,
      plates: content.meta.plates,
      blocks: content.meta.blocks,
      circuitsById,
      allocId: () => nextId++,
    });

    if (result.ok) {
      for (const circuit of circuitsById.values()) {
        content.meta.circuits.push(circuit);
      }
      content.textures.featureType.needsUpdate = true;
      content.textures.featureId.needsUpdate = true;
      content.textures.featureParam.needsUpdate = true;
    }
  }

  // Normalize arrays that downstream code iterates (matches App.tsx pattern)
  if (!content.meta) (content as any).meta = {} as any;
  if (!Array.isArray((content.meta as any).plates))
    (content.meta as any).plates = [];
  if (!Array.isArray((content.meta as any).circuits))
    (content.meta as any).circuits = [];
  if (!Array.isArray((content.meta as any).floorItems))
    (content.meta as any).floorItems = [];

  // ---- Validation ---------------------------------------------------------

  const budgetResult = resolvedBudget
    ? validateContentBudget(content.meta as any, resolvedBudget)
    : null;

  const difficultyResult = validateDifficultyBand(
    content.meta as any,
    resolvedBand,
  );

  const pacingResult = validatePacingTargets(
    content.meta as any,
    resolvedPacing,
  );

  const inclusionResult = validateInclusionRules(
    content.meta as any,
    inclusionRules,
    content.meta.patternDiagnostics ?? [],
  );

  // ---- Theme resolution ---------------------------------------------------

  const { themeId } = request;
  const seedNum = bsp.meta?.seedUsed ?? 0;
  let themePayload: GenerateDungeonResult["theme"] = null;
  let resolved: GenerateDungeonResult["resolved"] = null;
  if (themeId) {
    const dungeonTheme = getTheme(themeId);
    const roomTagsByRoomId = computeRoomTags(bsp, content);
    const roomThemesByRoomId = selectAllRoomThemes(
      seedNum,
      dungeonTheme,
      roomTagsByRoomId,
    );
    themePayload = {
      themeId: dungeonTheme.id,
      uniforms: dungeonThemeToShaderUniforms(dungeonTheme),
      roomTagsByRoomId,
      roomThemesByRoomId,
    };
    resolved = resolveSpawns({
      theme: dungeonTheme,
      content,
      seed: seedNum,
      level,
      isFinalFloor,
    });
  }

  // ---- Assemble result ----------------------------------------------------

  return {
    bsp,
    content,

    resolved,
    theme: themePayload,

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
