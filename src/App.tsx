// src/App.tsx
import React, { useEffect, useMemo, useReducer } from "react";
import "./styles.css";

import { AnimatePresence, motion } from "framer-motion";

import SingleInspectView from "./inspect/SingleInspectView";
import BatchResultsView from "./inspect/BatchResultsView";

import {
  wizardReducer,
  initialWizardState,
  deriveRunContract,
  type WizardState,
  type WizardAction,
} from "./wizard/wizardReducer";

import { generateBspDungeon, generateDungeonContent } from "./mazeGen";
import {
  initDungeonRuntimeState,
  derivePlatesFromBlocks,
} from "./dungeonState";
import { evaluateCircuits } from "./evaluateCircuits";
import { aggregateBatchRuns, type BatchRunInput } from "./batchStats";
import { computeGlobalCircuitMetrics } from "./debug/circuitDiagnosticsVM";

import WizardScreen from "./wizard/WizardScreen";

// --- Thin Shell Router --------------------------------------------------------

const screenMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

export default function App() {
  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    initialWizardState,
  );

  // Step 5 wants a read-only preview; we compute a "would-be contract" even if
  // state.contract isn't derived yet.
  const previewContract = useMemo(() => {
    return state.contract ?? deriveRunContract(state);
  }, [state]);

  // Derive a stable "screen key" for transitions.
  const screenKey = useMemo(() => {
    if (state.step <= 5)
      return `wizard-${state.step}-${state.mode?.mode ?? "none"}`;
    if (state.step === 6) return "exec";
    return `inspect-${state.result?.kind ?? "none"}`;
  }, [state.step, state.mode?.mode, state.result?.kind]);

  const centered = state.step <= 6; // wizard + execution are centered panels

  return (
    <div className={`maze-app ${centered ? "maze-app--centered" : ""}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={screenKey} {...screenMotion} style={{ width: "100%" }}>
          {state.step <= 5 ? (
            <WizardScreen
              state={state}
              dispatch={dispatch}
              previewContract={previewContract}
            />
          ) : state.step === 6 ? (
            <ExecutionView state={state} dispatch={dispatch} />
          ) : (
            <InspectionRouter state={state} dispatch={dispatch} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// --- Step 6 Execution View ----------------------------------------------------

function ExecutionView(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { state, dispatch } = props;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const contract = state.contract;
      if (!contract) {
        dispatch({
          type: "EXEC_ERROR",
          error:
            "Missing contract (Step 5 must derive contract before execution).",
        });
        return;
      }

      try {
        if (contract.mode === "single") {
          dispatch({
            type: "EXEC_PROGRESS",
            progress: { kind: "single", status: "running" },
          });

          const opts = {
            width: contract.world.width,
            height: contract.world.height,
            seed: contract.world.seed,
            ...contract.bsp,
          };

          const dungeon = generateBspDungeon(opts);

          // IMPORTANT: generateDungeonContent expects ContentOptions-ish fields.
          // (It can accept string seed; it gets hashed internally.)
          const p = contract.pattern;

          const contentOpts =
            contract.contentStrategy === "atomic"
              ? {
                  seed: contract.world.seed as any,

                  includeLeverHiddenPocket: false,
                  leverHiddenPocketSize: p.leverHiddenPocketSize,

                  includeLeverOpensDoor: false,
                  leverOpensDoorCount: p.leverOpensDoorCount,

                  includePlateOpensDoor: false,
                  plateOpensDoorCount: p.plateOpensDoorCount,

                  includeIntroGate: false,

                  patternMaxAttempts: p.patternMaxAttempts,

                  includePhase3Compositions: false,
                  gateThenOptionalRewardCount: 0,
                }
              : {
                  seed: contract.world.seed as any,

                  includeLeverHiddenPocket: p.includeLeverHiddenPocket,
                  leverHiddenPocketSize: p.leverHiddenPocketSize,

                  includeLeverOpensDoor: p.includeLeverOpensDoor,
                  leverOpensDoorCount: p.leverOpensDoorCount,

                  includePlateOpensDoor: p.includePlateOpensDoor,
                  plateOpensDoorCount: p.plateOpensDoorCount,

                  includeIntroGate: p.includeIntroGate,

                  patternMaxAttempts: p.patternMaxAttempts,

                  includePhase3Compositions: p.includePhase3Compositions,
                  gateThenOptionalRewardCount: p.gateThenOptionalRewardCount,
                };

          const content = generateDungeonContent(dungeon, contentOpts);

          // Normalize arrays that downstream code iterates
          if (!content.meta) content.meta = {} as any;
          if (!Array.isArray((content.meta as any).plates))
            (content.meta as any).plates = [];
          if (!Array.isArray((content.meta as any).circuits))
            (content.meta as any).circuits = [];

          // Init runtime
          let rt0 = initDungeonRuntimeState(content);

          // derivePlatesFromBlocks RETURNS the next state in this repo
          rt0 = derivePlatesFromBlocks(rt0, content);

          // Correct signature: (runtime, circuits)
          const eval0 = evaluateCircuits(rt0, content.meta.circuits);

          // Metrics want diagnostics, not eval result
          const diag0 = (eval0 as any).diagnostics ?? null;
          const metrics0 = computeGlobalCircuitMetrics(diag0);

          if (cancelled) return;

          dispatch({
            type: "EXEC_DONE",
            result: {
              kind: "single",
              seed: String(contract.world.seed),
              seedUsed: String(dungeon.meta?.seedUsed ?? ""),

              dungeon,
              content,

              runtime0: rt0,

              // Keep whatever your inspection expects:
              circuitEval0: eval0,
              // If your UI expects debug, keep debug here:
              circuitDebug0: (eval0 as any).debug ?? null,
            },
          });

          return;
        }

        // --- Batch mode ------------------------------------------------------
        const total = contract.batch.runs;
        dispatch({
          type: "EXEC_PROGRESS",
          progress: { kind: "batch", done: 0, total },
        });

        const runs: BatchRunInput[] = [];

        // Let the UI paint once before the heavy loop
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        const updateEvery = Math.max(1, Math.floor(total / 50));

        for (let i = 0; i < total; i++) {
          if (cancelled) return;

          const seedStr = `${contract.batch.seedPrefix}-${contract.batch.startIndex + i}`;

          const opts = {
            width: contract.world.width,
            height: contract.world.height,
            seed: seedStr,
            ...contract.bsp,
          };

          const dungeon = generateBspDungeon(opts);

          const p = contract.pattern;

          const content = generateDungeonContent(dungeon, {
            seed: seedStr as any,
            includeLeverHiddenPocket: p.includeLeverHiddenPocket,
            leverHiddenPocketSize: p.leverHiddenPocketSize,
            includeLeverOpensDoor: p.includeLeverOpensDoor,
            leverOpensDoorCount: p.leverOpensDoorCount,
            includePlateOpensDoor: p.includePlateOpensDoor,
            plateOpensDoorCount: p.plateOpensDoorCount,
            includeIntroGate: p.includeIntroGate,
            patternMaxAttempts: p.patternMaxAttempts,
            includePhase3Compositions: p.includePhase3Compositions,
            gateThenOptionalRewardCount: p.gateThenOptionalRewardCount,
          });

          if (!content.meta) content.meta = {} as any;
          if (!Array.isArray((content.meta as any).plates))
            (content.meta as any).plates = [];
          if (!Array.isArray((content.meta as any).circuits))
            (content.meta as any).circuits = [];

          let rt0 = initDungeonRuntimeState(content);
          rt0 = derivePlatesFromBlocks(rt0, content);

          const eval0 = evaluateCircuits(rt0, content.meta.circuits);
          const diag0 = (eval0 as any).diagnostics ?? null;
          const metrics0 = computeGlobalCircuitMetrics(diag0);

          runs.push({
            seed: seedStr,
            seedUsed: dungeon.meta.seedUsed,
            rooms: dungeon.meta.rooms.length,
            corridors: dungeon.meta.corridors.length,
            patternDiagnostics: content.meta.patternDiagnostics ?? [],
            circuitMetrics: metrics0
              ? ({ schemaVersion: 1, ...metrics0 } as any)
              : null,
          });

          if (i % updateEvery === 0 || i === total - 1) {
            dispatch({
              type: "EXEC_PROGRESS",
              progress: { kind: "batch", done: i + 1, total },
            });
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
          }
        }

        const summary = aggregateBatchRuns(runs);
        const json = JSON.stringify(summary, null, 2);

        if (cancelled) return;

        dispatch({
          type: "EXEC_DONE",
          result: { kind: "batch", summary, summaryJson: json },
        });
      } catch (err: any) {
        if (cancelled) return;
        dispatch({ type: "EXEC_ERROR", error: String(err?.message ?? err) });
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [state.contract, dispatch]);

  return (
    <div className="maze-controls">
      <h2 className="maze-title">Dungeon Creation</h2>

      <div style={{ opacity: 0.75, marginBottom: 10 }}>
        Execution phase is configuration-free. No inspection UI is mounted here.
      </div>

      {state.error ? (
        <div
          style={{
            padding: 10,
            border: "1px solid rgba(251,113,133,0.6)",
            borderRadius: 12,
          }}
        >
          <b>Execution error:</b> {state.error}
          <div style={{ height: 10 }} />
          <button onClick={() => dispatch({ type: "EXEC_CLEAR_ERROR" })}>
            Clear error
          </button>
          <div style={{ height: 10 }} />
          <button onClick={() => dispatch({ type: "SET_STEP", step: 5 })}>
            ← Back to Confirm
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
          }}
        >
          {state.progress?.kind === "single" ? (
            <div>
              Status: <b>{state.progress.status}</b>
            </div>
          ) : state.progress?.kind === "batch" ? (
            <div>
              Batch progress: <b>{state.progress.done}</b> /{" "}
              <b>{state.progress.total}</b>
            </div>
          ) : (
            <div>Starting…</div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Step 7 Inspection Router ------------------------------------------------

function InspectionRouter(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { state, dispatch } = props;

  const result = state.result;
  if (!result) {
    return (
      <div className="maze-controls">
        <h2 className="maze-title">No Result</h2>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 1 })}>
          Back to Wizard
        </button>
      </div>
    );
  }

  if (result.kind === "single") {
    return (
      <SingleInspectView
        payload={{
          dungeon: result.dungeon,
          content: result.content,
          runtime0: result.runtime0,
          seed: result.seed,
          seedUsed: result.seedUsed,
          circuitDiagnostics0:
            (result.circuitEval0 as any)?.diagnostics ?? null,
          circuitDebug0: (result.circuitDebug0 as any) ?? null,
        }}
        onBack={() => {
          dispatch({ type: "INVALIDATE_RESULTS" });
          dispatch({ type: "SET_STEP", step: 1 });
        }}
      />
    );
  }

  const batchSeedPrefix =
    state.contract && state.contract.mode === "batch"
      ? state.contract.batch.seedPrefix
      : undefined;

  return (
    <BatchResultsView
      payload={{
        summary: result.summary,
        summaryJson: result.summaryJson,
        runs: result.summary?.runs ?? undefined,
        seedPrefix: batchSeedPrefix,
      }}
      onBack={() => {
        dispatch({ type: "INVALIDATE_RESULTS" });
        dispatch({ type: "SET_STEP", step: 1 });
      }}
      title="Batch Results — Summary Only"
    />
  );
}
