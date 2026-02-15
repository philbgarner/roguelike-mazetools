// src/wizard/wizardReducer.ts
//
// Milestone 5 — UI Refactor (rev S)
// Wizard reducer enforcing the AUTHORITATIVE invalidation matrix.
//
// Contract:
// - Steps 1–5 configure only (no generation).
// - Step 6 executes (no map/inspection).
// - Step 7 inspects results (map/panels mount only here).
//
// Invalidation matrix (rev S):
// - Step 1 changes invalidate BSP + mode branch + results => back to Step 1.
// - Step 2 changes invalidate mode branch + results      => back to Step 2.
// - Step 3 changes invalidate Step 4 branch + results    => back to Step 3.
// - Step 4 changes invalidate results only               => stay in Step 4.
// - Any post-exec change invalidates entire result and tears down inspection.

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type WorldConfig = {
  seed: string;
  width: number;
  height: number;
};

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
  // rev S: “summary only” for now
  summaryOnly: boolean;
};

export type ModeConfig =
  | { mode: "single"; contentStrategy: ContentStrategy; pattern: PatternConfig }
  | { mode: "batch"; batch: BatchConfig; pattern: PatternConfig }; // batch uses patterns too in your current harness

export type RunContract =
  | {
      mode: "single";
      world: WorldConfig;
      bsp: BspConfig;
      contentStrategy: ContentStrategy;
      pattern: PatternConfig;
      guarantees: string[];
    }
  | {
      mode: "batch";
      world: WorldConfig;
      bsp: BspConfig;
      batch: BatchConfig;
      pattern: PatternConfig;
      guarantees: string[];
    };

export type ExecProgress =
  | null
  | { kind: "single"; status: "starting" | "running" | "done" }
  | { kind: "batch"; done: number; total: number };

export type SingleRunResult = {
  kind: "single";
  seed: string;
  seedUsed: string;
  // keep opaque to avoid type import churn (your inspect shell can type these later)
  dungeon: any;
  content: any;
  runtime0: any;
  circuitEval0: any;
  circuitDebug0: any;
};

export type BatchRunResult = {
  kind: "batch";
  summary: any;
  summaryJson: string;
  seedBank?: any;
  seedBankJson?: string;
};

export type RunResult = SingleRunResult | BatchRunResult;

export type WizardState = {
  step: WizardStep;

  world: WorldConfig | null;
  bsp: BspConfig | null;
  mode: ModeConfig | null;

  // Derived at/for Step 5; persisted for Step 6 execution (run contract is what we execute)
  contract: RunContract | null;

  // Step 6/7
  progress: ExecProgress;
  result: RunResult | null;
  error: string;

  // UI polish: brief message shown when upstream edits clear downstream state
  invalidationMessage: string;
};

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

export function initialWizardState(): WizardState {
  return {
    step: 1,
    world: null,
    bsp: null,
    mode: null,
    contract: null,
    progress: null,
    result: null,
    error: "",
    invalidationMessage: "",
  };
}

export type WizardAction =
  | { type: "SET_STEP"; step: WizardStep }

  // Step 1
  | { type: "SET_WORLD"; world: WorldConfig }

  // Step 2
  | { type: "SET_BSP"; bsp: BspConfig }

  // Step 3
  | { type: "SET_MODE_SINGLE"; contentStrategy: ContentStrategy }
  | { type: "SET_MODE_BATCH" }

  // Step 4 (branch)
  | { type: "SET_SINGLE_CONTENT_STRATEGY"; contentStrategy: ContentStrategy }
  | { type: "SET_PATTERN"; patch: Partial<PatternConfig> }
  | { type: "SET_BATCH"; batch: BatchConfig }

  // Step 5
  | { type: "DERIVE_CONTRACT" }
  // “Fast path”: from any step, build defaults for missing config and run immediately.
  | { type: "FINISH_RUN" }

  // Step 6/7 lifecycle
  | { type: "EXEC_START" }
  | { type: "EXEC_PROGRESS"; progress: ExecProgress }
  | { type: "EXEC_DONE"; result: RunResult }
  | { type: "EXEC_ERROR"; error: string }
  | { type: "EXEC_CLEAR_ERROR" }

  // Global reset
  | { type: "RESET_ALL" }
  | { type: "INVALIDATE_RESULTS" }
  | { type: "REROLL_SEED"; seed: string }
  | { type: "CLEAR_INVALIDATION_MSG" }

  // Seed curation: re-run a specific seed from batch results in single mode
  | { type: "RERUN_SEED_SINGLE"; seed: string };

function clampInt(n: number, lo: number, hi: number): number {
  const x = n | 0;
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function normalizeWorld(w: WorldConfig): WorldConfig {
  return {
    seed: String(w.seed ?? ""),
    width: clampInt(w.width, 16, 4096),
    height: clampInt(w.height, 16, 4096),
  };
}

function normalizeBsp(b: BspConfig): BspConfig {
  return {
    maxDepth: clampInt(b.maxDepth, 1, 32),
    minLeafSize: clampInt(b.minLeafSize, 4, 512),
    maxLeafSize: clampInt(b.maxLeafSize, 4, 2048),
    splitPadding: clampInt(b.splitPadding, 0, 32),

    roomPadding: clampInt(b.roomPadding, 0, 16),
    minRoomSize: clampInt(b.minRoomSize, 3, 128),
    maxRoomSize: clampInt(b.maxRoomSize, 3, 256),
    roomFillLeafChance: Number.isFinite(b.roomFillLeafChance)
      ? Math.max(0, Math.min(1, b.roomFillLeafChance))
      : 0.9,

    corridorWidth: clampInt(b.corridorWidth, 1, 8),
    keepOuterWalls: !!b.keepOuterWalls,
  };
}

function normalizePattern(p: PatternConfig): PatternConfig {
  return {
    includeLeverHiddenPocket: !!p.includeLeverHiddenPocket,
    leverHiddenPocketSize: clampInt(p.leverHiddenPocketSize, 3, 64),

    includeLeverOpensDoor: !!p.includeLeverOpensDoor,
    leverOpensDoorCount: clampInt(p.leverOpensDoorCount, 0, 32),

    includePlateOpensDoor: !!p.includePlateOpensDoor,
    plateOpensDoorCount: clampInt(p.plateOpensDoorCount, 0, 32),

    includeIntroGate: !!p.includeIntroGate,

    patternMaxAttempts: clampInt(p.patternMaxAttempts, 1, 1000),

    includePhase3Compositions: !!p.includePhase3Compositions,
    gateThenOptionalRewardCount: clampInt(p.gateThenOptionalRewardCount, 0, 16),
  };
}

function normalizeBatch(b: BatchConfig): BatchConfig {
  return {
    runs: clampInt(b.runs, 1, 20000),
    seedPrefix: String(b.seedPrefix ?? "batch"),
    startIndex: clampInt(b.startIndex, 0, 1_000_000_000),
    summaryOnly: !!b.summaryOnly,
  };
}

export function deriveRunContract(state: WizardState): RunContract | null {
  if (!state.world || !state.bsp || !state.mode) return null;

  const guarantees = [
    "deterministic",
    "best-effort (never aborts)",
    "patterns may skip; failures are diagnostics, not fatal",
    "Option A geometry recompute post-patterns",
  ];

  if (state.mode.mode === "single") {
    return {
      mode: "single",
      world: state.world,
      bsp: state.bsp,
      contentStrategy: state.mode.contentStrategy,
      pattern: state.mode.pattern,
      guarantees,
    };
  }

  return {
    mode: "batch",
    world: state.world,
    bsp: state.bsp,
    batch: state.mode.batch,
    pattern: state.mode.pattern,
    guarantees,
  };
}

function materializeMode(state: WizardState): ModeConfig {
  // If the user has already selected a mode, preserve it, but normalize the parts
  // so the resulting contract is always well-formed.
  if (state.mode?.mode === "single") {
    return {
      mode: "single",
      contentStrategy: state.mode.contentStrategy,
      pattern: normalizePattern(
        state.mode.pattern ?? (DEFAULT_PATTERN as PatternConfig),
      ),
    };
  }

  if (state.mode?.mode === "batch") {
    return {
      mode: "batch",
      batch: normalizeBatch(state.mode.batch ?? (DEFAULT_BATCH as BatchConfig)),
      pattern: normalizePattern(
        state.mode.pattern ?? (DEFAULT_PATTERN as PatternConfig),
      ),
    };
  }

  // If mode is not chosen yet, default to the fastest “starting dungeon” path:
  // single + atomic content. Patterns still exist in the contract for later use.
  return {
    mode: "single",
    contentStrategy: "atomic",
    pattern: normalizePattern(DEFAULT_PATTERN as PatternConfig),
  };
}

function buildContract(
  world: WorldConfig,
  bsp: BspConfig,
  mode: ModeConfig,
): RunContract {
  const guarantees = [
    "deterministic",
    "best-effort (never aborts)",
    "patterns may skip; failures are diagnostics, not fatal",
    "Option A geometry recompute post-patterns",
  ];

  if (mode.mode === "single") {
    return {
      mode: "single",
      world,
      bsp,
      contentStrategy: mode.contentStrategy,
      pattern: mode.pattern,
      guarantees,
    };
  }

  return {
    mode: "batch",
    world,
    bsp,
    batch: mode.batch,
    pattern: mode.pattern,
    guarantees,
  };
}

function initialProgressFor(contract: RunContract): ExecProgress {
  return contract.mode === "single"
    ? { kind: "single", status: "starting" }
    : { kind: "batch", done: 0, total: contract.batch.runs };
}

function clearResults(state: WizardState): WizardState {
  return {
    ...state,
    contract: null,
    progress: null,
    result: null,
    error: "",
  };
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "RESET_ALL":
      return initialWizardState();
    case "REROLL_SEED": {
      if (!state.world) return state;

      const seed = String(action.seed ?? "");

      const world: WorldConfig = { ...state.world, seed };

      // If we already derived a contract, keep it and patch only the seed.
      // This preserves all wizard choices and allows immediate re-exec.
      const contract = state.contract
        ? {
            ...state.contract,
            world: { ...state.contract.world, seed },
          }
        : null;

      return {
        ...state,
        world,
        contract,
        progress: null,
        result: null,
        error: "",
      };
    }

    case "RERUN_SEED_SINGLE": {
      // Re-run a specific seed in single mode, preserving world/bsp/pattern config.
      // Used from batch results to inspect an individual seed.
      if (!state.world || !state.bsp || !state.mode) return state;
      const rerunSeed = String(action.seed);
      const rerunWorld: WorldConfig = { ...state.world, seed: rerunSeed };
      const rerunPattern = state.mode.pattern;
      // Batch ModeConfig lacks contentStrategy; default to "patterns" which is
      // what the batch harness effectively uses (all pattern toggles explicit).
      const rerunCS: ContentStrategy =
        state.mode.mode === "single" ? state.mode.contentStrategy : "patterns";
      const rerunContract: RunContract = {
        mode: "single",
        world: rerunWorld,
        bsp: state.bsp,
        contentStrategy: rerunCS,
        pattern: rerunPattern,
        guarantees:
          deriveRunContract({ ...state, world: rerunWorld })?.guarantees ?? [],
      };
      return {
        ...state,
        world: rerunWorld,
        contract: rerunContract,
        step: 5 as WizardStep,
        progress: null,
        result: null,
        error: "",
      };
    }

    case "INVALIDATE_RESULTS":
      // Used when any upstream edit happens after execution
      return {
        ...clearResults(state),
        step: Math.min(state.step, 5) as WizardStep,
      };

    case "CLEAR_INVALIDATION_MSG":
      return { ...state, invalidationMessage: "" };

    case "SET_STEP":
      // navigation only; does NOT auto-derive contract
      return { ...state, step: action.step, invalidationMessage: "" };

    case "SET_WORLD": {
      // Step 1 change invalidates everything downstream and returns to Step 1.
      const world = normalizeWorld(action.world);
      // Only show invalidation message if downstream state existed
      const worldMsg =
        state.bsp || state.mode || state.result
          ? "World changed — BSP, mode, and results cleared."
          : "";
      return {
        step: 1,
        world,
        bsp: null,
        mode: null,
        contract: null,
        progress: null,
        result: null,
        error: "",
        invalidationMessage: worldMsg,
      };
    }

    case "SET_BSP": {
      // Step 2 change invalidates downstream (mode branch + results) and returns to Step 2.
      if (!state.world) {
        // Cannot set BSP without world; stay safe.
        return state;
      }
      const bsp = normalizeBsp(action.bsp);
      const bspMsg =
        state.mode || state.result
          ? "BSP changed — mode and results cleared."
          : "";
      return {
        step: 2,
        world: state.world,
        bsp,
        mode: null,
        contract: null,
        progress: null,
        result: null,
        error: "",
        invalidationMessage: bspMsg,
      };
    }

    case "SET_MODE_SINGLE": {
      // Step 3 change invalidates Step 4 branch + results and returns to Step 3.
      if (!state.world || !state.bsp) return state;

      const mode: ModeConfig = {
        mode: "single",
        contentStrategy: action.contentStrategy,
        pattern: normalizePattern(DEFAULT_PATTERN),
      };

      const singleMsg = state.result
        ? "Mode changed — options and results cleared."
        : "";

      return {
        ...clearResults(state),
        step: 3,
        mode,
        invalidationMessage: singleMsg,
      };
    }

    case "SET_MODE_BATCH": {
      if (!state.world || !state.bsp) return state;

      const mode: ModeConfig = {
        mode: "batch",
        batch: normalizeBatch(DEFAULT_BATCH),
        pattern: normalizePattern(DEFAULT_PATTERN),
      };

      const batchMsg = state.result
        ? "Mode changed — options and results cleared."
        : "";

      return {
        ...clearResults(state),
        step: 3,
        mode,
        invalidationMessage: batchMsg,
      };
    }

    case "SET_SINGLE_CONTENT_STRATEGY": {
      // Step 4 change invalidates results only; does not invalidate world/bsp/mode selection.
      if (!state.mode || state.mode.mode !== "single") return state;
      const mode: ModeConfig = {
        ...state.mode,
        contentStrategy: action.contentStrategy,
      };
      return {
        ...clearResults(state),
        step: 4,
        mode,
      };
    }

    case "SET_BATCH": {
      if (!state.mode || state.mode.mode !== "batch") return state;
      const mode: ModeConfig = {
        ...state.mode,
        batch: normalizeBatch(action.batch),
      };
      return {
        ...clearResults(state),
        step: 4,
        mode,
      };
    }

    case "SET_PATTERN": {
      if (!state.mode) return state;
      const patched = normalizePattern({
        ...state.mode.pattern,
        ...action.patch,
      });
      const mode: ModeConfig =
        state.mode.mode === "single"
          ? { ...state.mode, pattern: patched }
          : { ...state.mode, pattern: patched };

      // Step 4 change invalidates results only.
      return {
        ...clearResults(state),
        step: 4,
        mode,
      };
    }
    case "FINISH_RUN": {
      // Fast path: from any step (>=1) run immediately using:
      // - user edits so far
      // - defaults for anything not yet edited/visited
      if (!state.world) return state;

      const world = normalizeWorld(state.world);
      const bsp = normalizeBsp((state.bsp ?? DEFAULT_BSP) as BspConfig);
      const mode = materializeMode(state);

      const contract = buildContract(world, bsp, mode);

      return {
        ...state,
        // Materialize these so the wizard panels reflect what actually ran.
        world,
        bsp,
        mode,
        contract,
        step: 6,
        progress: initialProgressFor(contract),
        result: null,
        error: "",
      };
    }
    case "DERIVE_CONTRACT": {
      // Step 5: compute the immutable run contract (read-only confirmation step)
      const contract = deriveRunContract(state);
      if (!contract) return state;
      return {
        ...state,
        step: 5,
        contract,
        error: "",
      };
    }

    case "EXEC_CLEAR_ERROR":
      return { ...state, error: "" };

    case "EXEC_START":
      if (!state.contract) return state;
      return {
        ...state,
        step: 6,
        progress: initialProgressFor(state.contract),
        result: null,
        error: "",
      };

    case "EXEC_PROGRESS":
      return { ...state, progress: action.progress };

    case "EXEC_DONE":
      return {
        ...state,
        step: 7,
        progress:
          state.progress && state.progress.kind === "single"
            ? { kind: "single", status: "done" }
            : state.progress,
        result: action.result,
        error: "",
      };

    case "EXEC_ERROR":
      return {
        ...state,
        step: 5, // return to confirm step on error (contract still valid)
        progress: null,
        result: null,
        error: String(action.error ?? "Execution failed"),
      };

    default:
      return state;
  }
}
