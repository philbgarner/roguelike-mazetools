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
  DEFAULT_BSP,
  DEFAULT_PATTERN,
  DEFAULT_BATCH,
  type WizardState,
  type WizardAction,
  type WorldConfig,
  type BspConfig,
  type PatternConfig,
  type BatchConfig,
} from "./wizard/wizardReducer";

import { generateBspDungeon, generateDungeonContent } from "./mazeGen";
import {
  initDungeonRuntimeState,
  derivePlatesFromBlocks,
} from "./dungeonState";
import { evaluateCircuits } from "./evaluateCircuits";
import { aggregateBatchRuns, type BatchRunInput } from "./batchStats";
import { computeGlobalCircuitMetrics } from "./debug/circuitDiagnosticsVM";

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
  // - Step drives the main switch.
  // - Step 4 includes mode to avoid weird reuse when switching branches.
  const screenKey = useMemo(() => {
    if (state.step <= 5)
      return `wizard-${state.step}-${state.mode?.mode ?? "none"}`;
    if (state.step === 6) return "exec";
    // Step 7: key by kind so switching single/batch feels correct.
    return `inspect-${state.result?.kind ?? "none"}`;
  }, [state.step, state.mode?.mode, state.result?.kind]);

  return (
    <div className="maze-app">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={screenKey} {...screenMotion} style={{ width: "100%" }}>
          {state.step <= 5 ? (
            <Wizard
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

// --- Step 1–5 Wizard (single step visible at a time + Framer Motion) ----------

function Wizard(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  previewContract: any;
}) {
  const { state, dispatch, previewContract } = props;

  const canStep2 = !!state.world;
  const canStep3 = !!state.world && !!state.bsp;
  const canStep4 = !!state.world && !!state.bsp && !!state.mode;
  const canStep5 = canStep4;

  const go = (step: 1 | 2 | 3 | 4 | 5) => dispatch({ type: "SET_STEP", step });

  // Render ONLY one step panel at a time.
  return (
    <div className="maze-controls" style={{ width: 520, maxWidth: "100%" }}>
      <h2 className="maze-title">World Creation Wizard (rev S)</h2>

      <div style={{ opacity: 0.8, marginBottom: 8 }}>
        Step <b>{state.step}</b> / 5
      </div>

      {!!state.error && (
        <div style={{ padding: 8, border: "1px solid #b33", marginBottom: 8 }}>
          <b>Execution error:</b> {state.error}
        </div>
      )}

      <WizardStepper
        step={state.step}
        canStep2={canStep2}
        canStep3={canStep3}
        canStep4={canStep4}
        canStep5={canStep5}
        onGo={go}
      />

      <div style={{ height: 10 }} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`wiz-step-${state.step}-${state.mode?.mode ?? "none"}`}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.16 } }}
          exit={{ opacity: 0, x: -10, transition: { duration: 0.12 } }}
        >
          {state.step === 1 && (
            <Section title="Step 1 — World Seed & Dimensions">
              <Row>
                <label style={{ width: 140 }}>Seed</label>
                <input
                  value={state.world?.seed ?? "demo-seed"}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_WORLD",
                      world: {
                        seed: e.target.value,
                        width: state.world?.width ?? 64,
                        height: state.world?.height ?? 48,
                      },
                    })
                  }
                  style={{ flex: 1 }}
                />
              </Row>

              <Row>
                <label style={{ width: 140 }}>Width</label>
                <input
                  type="number"
                  value={state.world?.width ?? 64}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_WORLD",
                      world: {
                        seed: state.world?.seed ?? "demo-seed",
                        width: Number(e.target.value),
                        height: state.world?.height ?? 48,
                      },
                    })
                  }
                />
                <div style={{ width: 12 }} />
                <label style={{ width: 60 }}>Height</label>
                <input
                  type="number"
                  value={state.world?.height ?? 48}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_WORLD",
                      world: {
                        seed: state.world?.seed ?? "demo-seed",
                        width: state.world?.width ?? 64,
                        height: Number(e.target.value),
                      },
                    })
                  }
                />
              </Row>

              <Row>
                <button
                  onClick={() => {
                    const w: WorldConfig = state.world ?? {
                      seed: "demo-seed",
                      width: 64,
                      height: 48,
                    };
                    dispatch({ type: "SET_WORLD", world: w });
                    dispatch({ type: "SET_STEP", step: 2 });
                  }}
                >
                  Next → Step 2
                </button>
              </Row>
            </Section>
          )}

          {state.step === 2 && (
            <Section title="Step 2 — BSP Geometry Settings">
              <Row>
                <button onClick={() => dispatch({ type: "SET_STEP", step: 1 })}>
                  ← Back
                </button>
                <div style={{ flex: 1 }} />
                <button
                  disabled={!canStep2}
                  onClick={() => {
                    const bsp: BspConfig = state.bsp ?? DEFAULT_BSP;
                    dispatch({ type: "SET_BSP", bsp });
                    dispatch({ type: "SET_STEP", step: 3 });
                  }}
                >
                  Use defaults + Next → Step 3
                </button>
              </Row>

              <Row style={{ opacity: 0.8 }}>
                (Replace this placeholder with your full BSP form later.)
              </Row>
            </Section>
          )}

          {state.step === 3 && (
            <Section title="Step 3 — Generation Mode Selection">
              <Row>
                <button onClick={() => dispatch({ type: "SET_STEP", step: 2 })}>
                  ← Back
                </button>
              </Row>

              <Row>
                <button
                  disabled={!canStep3}
                  onClick={() => {
                    dispatch({
                      type: "SET_MODE_SINGLE",
                      contentStrategy: "patterns",
                    });
                    dispatch({ type: "SET_STEP", step: 4 });
                  }}
                >
                  Single Seed
                </button>

                <div style={{ width: 12 }} />

                <button
                  disabled={!canStep3}
                  onClick={() => {
                    dispatch({ type: "SET_MODE_BATCH" });
                    dispatch({ type: "SET_STEP", step: 4 });
                  }}
                >
                  Batch Run
                </button>
              </Row>
            </Section>
          )}

          {state.step === 4 && (
            <Section title="Step 4 — Content Strategy / Batch Params">
              <Row>
                <button onClick={() => dispatch({ type: "SET_STEP", step: 3 })}>
                  ← Back
                </button>
              </Row>

              {!state.mode ? (
                <div style={{ opacity: 0.8 }}>Select a mode in Step 3.</div>
              ) : state.mode.mode === "single" ? (
                <>
                  <Row>
                    <button
                      onClick={() =>
                        dispatch({
                          type: "SET_SINGLE_CONTENT_STRATEGY",
                          contentStrategy: "atomic",
                        })
                      }
                    >
                      Atomic Content Only
                    </button>
                    <div style={{ width: 12 }} />
                    <button
                      onClick={() =>
                        dispatch({
                          type: "SET_SINGLE_CONTENT_STRATEGY",
                          contentStrategy: "patterns",
                        })
                      }
                    >
                      Run Composition Patterns
                    </button>
                  </Row>

                  <Row style={{ opacity: 0.8 }}>
                    Current: <b>{state.mode.contentStrategy}</b>
                  </Row>

                  <Row>
                    <button
                      onClick={() =>
                        dispatch({
                          type: "SET_PATTERN",
                          patch: {
                            ...DEFAULT_PATTERN,
                          } as Partial<PatternConfig>,
                        })
                      }
                    >
                      Reset Pattern Defaults
                    </button>
                  </Row>
                </>
              ) : (
                <>
                  <Row>
                    <button
                      onClick={() =>
                        dispatch({
                          type: "SET_BATCH",
                          batch: DEFAULT_BATCH as BatchConfig,
                        })
                      }
                    >
                      Use default batch params
                    </button>
                  </Row>
                  <Row style={{ opacity: 0.8 }}>
                    Current runs: <b>{state.mode.batch.runs}</b> (prefix:{" "}
                    {state.mode.batch.seedPrefix})
                  </Row>
                </>
              )}

              <Row>
                <button
                  disabled={!canStep4}
                  onClick={() => dispatch({ type: "DERIVE_CONTRACT" })}
                >
                  Next → Step 5 (Run Summary)
                </button>
              </Row>
            </Section>
          )}

          {state.step === 5 && (
            <Section title="Step 5 — Run Summary & Confirmation (MANDATORY)">
              <Row>
                <button onClick={() => dispatch({ type: "SET_STEP", step: 4 })}>
                  ← Back
                </button>
                <div style={{ flex: 1 }} />
                <button onClick={() => dispatch({ type: "RESET_ALL" })}>
                  Reset
                </button>
              </Row>

              {!previewContract ? (
                <div style={{ opacity: 0.8 }}>
                  Incomplete configuration (Steps 1–4).
                </div>
              ) : (
                <>
                  <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(previewContract, null, 2)}
                  </pre>

                  <Row>
                    <button
                      disabled={!canStep5}
                      onClick={() => {
                        dispatch({ type: "DERIVE_CONTRACT" });
                        dispatch({ type: "EXEC_START" });
                      }}
                    >
                      Run
                    </button>
                  </Row>
                </>
              )}
            </Section>
          )}
        </motion.div>
      </AnimatePresence>

      <div style={{ opacity: 0.75, marginTop: 12 }}>
        This wizard currently uses placeholder panels. Next step is replacing
        the defaults-only BSP step and the batch params step with full forms.
      </div>
    </div>
  );
}

function WizardStepper(props: {
  step: number;
  canStep2: boolean;
  canStep3: boolean;
  canStep4: boolean;
  canStep5: boolean;
  onGo: (s: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const { step, canStep2, canStep3, canStep4, canStep5, onGo } = props;

  const Btn = (p: {
    n: 1 | 2 | 3 | 4 | 5;
    enabled: boolean;
    label: string;
  }) => (
    <button
      onClick={() => enabledGo(p.n, p.enabled)}
      disabled={!p.enabled}
      style={{
        opacity: step === p.n ? 1 : 0.85,
        fontWeight: step === p.n ? 700 : 500,
      }}
    >
      {p.label}
    </button>
  );

  const enabledGo = (n: 1 | 2 | 3 | 4 | 5, enabled: boolean) => {
    if (!enabled) return;
    onGo(n);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <Btn n={1} enabled={true} label="1 World" />
      <Btn n={2} enabled={canStep2} label="2 BSP" />
      <Btn n={3} enabled={canStep3} label="3 Mode" />
      <Btn n={4} enabled={canStep4} label="4 Options" />
      <Btn n={5} enabled={canStep5} label="5 Confirm" />
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

          const p = contract.pattern;
          const contentOpts =
            contract.contentStrategy === "atomic"
              ? {
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

          let rt0 = initDungeonRuntimeState(content);
          rt0 = derivePlatesFromBlocks(rt0, content);

          const eval0 = evaluateCircuits(rt0, content.meta.circuits);

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
              circuitEval0: eval0,
              circuitDebug0: (eval0 as any).debug ?? null,
            },
          });
        } else {
          const total = contract.batch.runs;
          dispatch({
            type: "EXEC_PROGRESS",
            progress: { kind: "batch", done: 0, total },
          });

          const runs: BatchRunInput[] = [];

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

            let rt0 = initDungeonRuntimeState(content);
            rt0 = derivePlatesFromBlocks(rt0, content);

            const eval0 = evaluateCircuits(rt0, content.meta.circuits);
            const diag0 = (eval0 as any).diagnostics ?? null;
            const metrics0 = computeGlobalCircuitMetrics(diag0);

            const circuitMetrics = metrics0
              ? ({ schemaVersion: 1, ...metrics0 } as any)
              : null;

            runs.push({
              seed: seedStr,
              seedUsed: dungeon.meta.seedUsed,
              rooms: dungeon.meta.rooms.length,
              corridors: dungeon.meta.corridors.length,
              patternDiagnostics: content.meta.patternDiagnostics ?? [],
              circuitMetrics,
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
        }
      } catch (err: any) {
        if (cancelled) return;
        dispatch({
          type: "EXEC_ERROR",
          error: err?.message ? String(err.message) : String(err),
        });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [state.contract, dispatch]);

  return (
    <div className="maze-controls" style={{ width: 520, maxWidth: "100%" }}>
      <h2 className="maze-title">Step 6 — Execution</h2>

      <div style={{ opacity: 0.85, marginBottom: 8 }}>
        Running… (configuration is locked; no inspection UI mounted)
      </div>

      <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
        {JSON.stringify(state.progress, null, 2)}
      </pre>

      <div style={{ opacity: 0.75 }}>
        Any upstream change invalidates the run and will tear down inspection.
      </div>
    </div>
  );
}

// --- Step 7 Inspection Router (REAL wrappers) --------------------------------

function InspectionRouter(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { state, dispatch } = props;

  if (!state.result) {
    return (
      <div className="maze-controls" style={{ width: 720, maxWidth: "100%" }}>
        <h2 className="maze-title">Step 7 — Inspection</h2>
        <div style={{ opacity: 0.85 }}>No result (should not happen).</div>
        <button onClick={() => dispatch({ type: "RESET_ALL" })}>
          Back to Wizard
        </button>
      </div>
    );
  }

  if (state.result.kind === "batch") {
    return (
      <BatchResultsView
        onBack={() => dispatch({ type: "RESET_ALL" })}
        payload={{
          summary: state.result.summary,
          summaryJson: state.result.summaryJson,
          runs:
            state.contract && state.contract.mode === "batch"
              ? state.contract.batch.runs
              : undefined,
          seedPrefix:
            state.contract && state.contract.mode === "batch"
              ? state.contract.batch.seedPrefix
              : undefined,
        }}
      />
    );
  }

  // single
  return (
    <SingleInspectView
      onBack={() => dispatch({ type: "RESET_ALL" })}
      payload={{
        dungeon: state.result.dungeon,
        content: state.result.content,
        runtime0: state.result.runtime0,
        seed: state.result.seed,
        seedUsed: state.result.seedUsed,
        circuitDiagnostics0: state.result.circuitEval0?.diagnostics ?? null,
        circuitDebug0: state.result.circuitDebug0 ?? null,
      }}
    />
  );
}

// --- Small layout helpers -----------------------------------------------------

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

function Row(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        ...(props.style ?? {}),
      }}
    />
  );
}
