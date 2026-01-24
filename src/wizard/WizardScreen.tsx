// src/wizard/WizardScreen.tsx
import React, { useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  DEFAULT_BSP,
  DEFAULT_BATCH,
  DEFAULT_PATTERN,
  type WizardAction,
  type WizardState,
  type WorldConfig,
  type BspConfig,
  type BatchConfig,
  type PatternConfig,
  type ContentStrategy,
} from "./wizardReducer";

const stepMotion = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.16 } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.12 } },
};

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

function Row(p: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...p}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        marginBottom: 10,
        ...(p.style ?? {}),
      }}
    />
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: 12,
        background: "rgba(255,255,255,0.03)",
        marginBottom: 12,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{props.title}</div>
      {props.children}
    </div>
  );
}

function LabeledField(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
        <b>{props.label}</b>
        {props.hint ? (
          <span style={{ opacity: 0.75 }}> — {props.hint}</span>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function NumInput(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(props.value) ? props.value : props.min}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      onChange={(e) => props.onChange(Number(e.target.value))}
      style={{
        width: "100%",
        padding: "9px 10px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.92)",
      }}
    />
  );
}

function TextInput(props: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "9px 10px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.92)",
      }}
    />
  );
}

function Toggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

export default function WizardScreen(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  previewContract: any;
}) {
  const { state, dispatch, previewContract } = props;

  const canStep2 = !!state.world;
  const canStep3 = !!state.world && !!state.bsp;
  const canStep4 = !!state.world && !!state.bsp && !!state.mode;
  const canStep5 = canStep4;

  const stepKey = useMemo(
    () => `step-${state.step}-${state.mode?.mode ?? "none"}`,
    [state.step, state.mode?.mode],
  );

  return (
    <div className="maze-controls">
      <div className="maze-header-row">
        <h2 className="maze-title">World Creation Wizard</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => dispatch({ type: "RESET_ALL" })}>Reset</button>
        </div>
      </div>

      <div style={{ opacity: 0.8, marginBottom: 10 }}>
        Step <b>{state.step}</b> / 5
      </div>

      {!!state.error && (
        <div
          style={{
            padding: 10,
            border: "1px solid rgba(251,113,133,0.6)",
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          <b>Execution error:</b> {state.error}
          <div style={{ height: 8 }} />
          <button onClick={() => dispatch({ type: "EXEC_CLEAR_ERROR" })}>
            Clear
          </button>
        </div>
      )}

      <WizardStepper
        step={state.step}
        canStep2={canStep2}
        canStep3={canStep3}
        canStep4={canStep4}
        canStep5={canStep5}
        onGo={(s) => dispatch({ type: "SET_STEP", step: s })}
      />

      <div style={{ height: 12 }} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={stepKey} {...stepMotion}>
          {state.step === 1 && <Step1World state={state} dispatch={dispatch} />}
          {state.step === 2 && <Step2Bsp state={state} dispatch={dispatch} />}
          {state.step === 3 && <Step3Mode state={state} dispatch={dispatch} />}
          {state.step === 4 && (
            <Step4Options state={state} dispatch={dispatch} />
          )}
          {state.step === 5 && (
            <Step5Confirm
              state={state}
              dispatch={dispatch}
              previewContract={previewContract}
              canRun={canStep5}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div style={{ opacity: 0.7, marginTop: 10 }}>
        Wizard steps enforce the invalidation matrix: upstream edits clear
        downstream state immediately.
      </div>
    </div>
  );
}

// --- Stepper --------------------------------------------------------------

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
      onClick={() => (p.enabled ? onGo(p.n) : null)}
      disabled={!p.enabled}
      style={{
        opacity: step === p.n ? 1 : 0.85,
        fontWeight: step === p.n ? 800 : 600,
      }}
    >
      {p.label}
    </button>
  );

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Btn n={1} enabled={true} label="1 World" />
      <Btn n={2} enabled={canStep2} label="2 BSP" />
      <Btn n={3} enabled={canStep3} label="3 Mode" />
      <Btn n={4} enabled={canStep4} label="4 Options" />
      <Btn n={5} enabled={canStep5} label="5 Confirm" />
    </div>
  );
}

// --- Step 1 ---------------------------------------------------------------

function Step1World(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { state, dispatch } = props;

  const world: WorldConfig = state.world ?? {
    seed: "demo",
    width: 64,
    height: 64,
  };

  const setWorld = (patch: Partial<WorldConfig>) => {
    const next: WorldConfig = {
      seed: patch.seed ?? world.seed,
      width: patch.width ?? world.width,
      height: patch.height ?? world.height,
    };
    dispatch({ type: "SET_WORLD", world: next });
  };

  const randomSeed = () => {
    const s = `seed-${Math.floor(Date.now() / 1000)}`;
    setWorld({ seed: s });
  };

  useEffect(() => {
    if (!state.world) {
      dispatch({
        type: "SET_WORLD",
        world: { seed: "demo", width: 64, height: 64 },
      });
    }
  }, [state.world, dispatch]);

  return (
    <Section title="Step 1 — World Seed & Dimensions">
      <Row>
        <LabeledField label="Seed" hint="manual or randomize">
          <TextInput
            value={world.seed}
            onChange={(v) => setWorld({ seed: v })}
          />
        </LabeledField>
        <div style={{ width: 10 }} />
        <button onClick={randomSeed}>Randomize</button>
      </Row>

      <Row>
        <LabeledField label="Width" hint="tiles">
          <NumInput
            value={world.width}
            min={24}
            max={256}
            onChange={(v) => setWorld({ width: clampInt(v, 24, 256) })}
          />
        </LabeledField>
        <LabeledField label="Height" hint="tiles">
          <NumInput
            value={world.height}
            min={24}
            max={256}
            onChange={(v) => setWorld({ height: clampInt(v, 24, 256) })}
          />
        </LabeledField>
      </Row>

      <Row style={{ opacity: 0.75 }}>
        No generation occurs in this step. You are only defining deterministic
        inputs.
      </Row>

      <Row>
        <button
          onClick={() =>
            dispatch({ type: "SET_BSP", bsp: DEFAULT_BSP as BspConfig })
          }
        >
          Use BSP defaults
        </button>
        <div style={{ flex: 1 }} />
        <button
          disabled={!state.world}
          onClick={() => dispatch({ type: "SET_STEP", step: 2 })}
        >
          Next → Step 2
        </button>
      </Row>
    </Section>
  );
}

// --- Step 2 ---------------------------------------------------------------

function Step2Bsp(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { state, dispatch } = props;

  useEffect(() => {
    if (state.world && !state.bsp) {
      dispatch({ type: "SET_BSP", bsp: DEFAULT_BSP as BspConfig });
    }
  }, [state.world, state.bsp, dispatch]);

  const bsp: BspConfig = state.bsp ?? (DEFAULT_BSP as BspConfig);
  const setBsp = (patch: Partial<BspConfig>) => {
    dispatch({ type: "SET_BSP", bsp: { ...bsp, ...patch } });
  };

  return (
    <Section title="Step 2 — BSP Geometry Settings">
      <Row>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 1 })}>
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() =>
            dispatch({ type: "SET_BSP", bsp: DEFAULT_BSP as BspConfig })
          }
        >
          Reset BSP Defaults
        </button>
      </Row>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <LabeledField label="maxDepth" hint="split depth cap">
          <NumInput
            value={bsp.maxDepth}
            min={2}
            max={12}
            onChange={(v) => setBsp({ maxDepth: clampInt(v, 2, 12) })}
          />
        </LabeledField>

        <LabeledField label="splitPadding" hint="min spacing near splits">
          <NumInput
            value={bsp.splitPadding}
            min={0}
            max={6}
            onChange={(v) => setBsp({ splitPadding: clampInt(v, 0, 6) })}
          />
        </LabeledField>

        <LabeledField label="minLeafSize">
          <NumInput
            value={bsp.minLeafSize}
            min={8}
            max={64}
            onChange={(v) => setBsp({ minLeafSize: clampInt(v, 8, 64) })}
          />
        </LabeledField>

        <LabeledField label="maxLeafSize">
          <NumInput
            value={bsp.maxLeafSize}
            min={10}
            max={96}
            onChange={(v) => setBsp({ maxLeafSize: clampInt(v, 10, 96) })}
          />
        </LabeledField>

        <LabeledField label="roomPadding">
          <NumInput
            value={bsp.roomPadding}
            min={0}
            max={6}
            onChange={(v) => setBsp({ roomPadding: clampInt(v, 0, 6) })}
          />
        </LabeledField>

        <LabeledField label="roomFillLeafChance" hint="0..1">
          <NumInput
            value={bsp.roomFillLeafChance}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) =>
              setBsp({ roomFillLeafChance: Math.max(0, Math.min(1, v)) })
            }
          />
        </LabeledField>

        <LabeledField label="minRoomSize">
          <NumInput
            value={bsp.minRoomSize}
            min={3}
            max={24}
            onChange={(v) => setBsp({ minRoomSize: clampInt(v, 3, 24) })}
          />
        </LabeledField>

        <LabeledField label="maxRoomSize">
          <NumInput
            value={bsp.maxRoomSize}
            min={4}
            max={32}
            onChange={(v) => setBsp({ maxRoomSize: clampInt(v, 4, 32) })}
          />
        </LabeledField>

        <LabeledField label="corridorWidth">
          <NumInput
            value={bsp.corridorWidth}
            min={1}
            max={4}
            onChange={(v) => setBsp({ corridorWidth: clampInt(v, 1, 4) })}
          />
        </LabeledField>

        <LabeledField label="keepOuterWalls">
          <div
            style={{
              padding: 8,
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
            }}
          >
            <Toggle
              checked={bsp.keepOuterWalls}
              onChange={(v) => setBsp({ keepOuterWalls: v })}
              label="Keep outer walls"
            />
          </div>
        </LabeledField>
      </div>

      <Row style={{ opacity: 0.75 }}>
        This defines geometry only. No content or puzzles are implied by this
        step.
      </Row>

      <Row>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 1 })}>
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          disabled={!state.world || !state.bsp}
          onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
        >
          Next → Step 3
        </button>
      </Row>
    </Section>
  );
}

// --- Step 3 ---------------------------------------------------------------

function Step3Mode(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { state, dispatch } = props;

  return (
    <Section title="Step 3 — Generation Mode Selection">
      <Row>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 2 })}>
          ← Back
        </button>
      </Row>

      <Row>
        <button
          onClick={() =>
            dispatch({ type: "SET_MODE_SINGLE", contentStrategy: "atomic" })
          }
          style={{ fontWeight: state.mode?.mode === "single" ? 900 : 600 }}
        >
          Single Seed Generation
        </button>
        <button
          onClick={() => dispatch({ type: "SET_MODE_BATCH" })}
          style={{ fontWeight: state.mode?.mode === "batch" ? 900 : 600 }}
        >
          Batch Run
        </button>
      </Row>

      <Row style={{ opacity: 0.75 }}>
        Single produces an inspectable dungeon. Batch produces summary-only
        diagnostics (no map).
      </Row>

      <Row>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 2 })}>
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          disabled={!state.mode}
          onClick={() => dispatch({ type: "SET_STEP", step: 4 })}
        >
          Next → Step 4
        </button>
      </Row>
    </Section>
  );
}

// --- Step 4 ---------------------------------------------------------------

function Step4Options(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { state, dispatch } = props;
  const mode = state.mode;

  if (!mode) {
    return (
      <Section title="Step 4 — Options">
        <div style={{ opacity: 0.75 }}>Select a mode in Step 3 first.</div>
        <Row>
          <button onClick={() => dispatch({ type: "SET_STEP", step: 3 })}>
            ← Back
          </button>
        </Row>
      </Section>
    );
  }

  const pattern: PatternConfig =
    mode.pattern ?? (DEFAULT_PATTERN as PatternConfig);

  const setPattern = (patch: Partial<PatternConfig>) => {
    dispatch({ type: "SET_PATTERN", patch });
  };

  const resetPattern = () =>
    dispatch({
      type: "SET_PATTERN",
      patch: { ...(DEFAULT_PATTERN as PatternConfig) },
    });

  const setSingleStrategy = (contentStrategy: ContentStrategy) => {
    dispatch({ type: "SET_SINGLE_CONTENT_STRATEGY", contentStrategy });
  };

  const setBatch = (batch: BatchConfig) => {
    dispatch({ type: "SET_BATCH", batch });
  };

  return (
    <Section title="Step 4 — Content Strategy / Batch Parameters">
      <Row>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 3 })}>
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={resetPattern}>Reset Pattern Defaults</button>
      </Row>

      {mode.mode === "single" ? (
        <>
          <Section title="Single Seed: Content Strategy">
            <Row>
              <button
                onClick={() => setSingleStrategy("atomic")}
                style={{
                  fontWeight: mode.contentStrategy === "atomic" ? 900 : 600,
                }}
              >
                Atomic Content Only
              </button>

              <button
                onClick={() => setSingleStrategy("patterns")}
                style={{
                  fontWeight: mode.contentStrategy === "patterns" ? 900 : 600,
                }}
              >
                Run Composition Patterns
              </button>
            </Row>

            <Row style={{ opacity: 0.75 }}>
              Atomic places fixtures without composition patterns. Patterns may
              skip; generation remains best-effort.
            </Row>
          </Section>
        </>
      ) : (
        <>
          <Section title="Batch: Parameters (summary-only)">
            <Row>
              <button onClick={() => setBatch(DEFAULT_BATCH as BatchConfig)}>
                Use default batch params
              </button>
            </Row>

            <Row>
              <LabeledField label="runs">
                <NumInput
                  value={mode.batch.runs}
                  min={10}
                  max={5000}
                  onChange={(v) =>
                    setBatch({ ...mode.batch, runs: clampInt(v, 10, 5000) })
                  }
                />
              </LabeledField>

              <LabeledField label="seedPrefix">
                <TextInput
                  value={mode.batch.seedPrefix}
                  onChange={(v) => setBatch({ ...mode.batch, seedPrefix: v })}
                />
              </LabeledField>

              <LabeledField label="startIndex">
                <NumInput
                  value={mode.batch.startIndex}
                  min={0}
                  max={999999}
                  onChange={(v) =>
                    setBatch({
                      ...mode.batch,
                      startIndex: clampInt(v, 0, 999999),
                    })
                  }
                />
              </LabeledField>
            </Row>

            <Row>
              <Toggle
                checked={mode.batch.summaryOnly}
                onChange={(v) => setBatch({ ...mode.batch, summaryOnly: v })}
                label="Summary only (no per-seed inspection)"
              />
            </Row>
          </Section>
        </>
      )}

      <Section title="Pattern Configuration">
        <div style={{ opacity: 0.75, marginBottom: 10 }}>
          Patterns apply when enabled (single: only if strategy=patterns; batch:
          always used by harness).
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div
            style={{
              padding: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          >
            <Toggle
              checked={pattern.includeLeverHiddenPocket}
              onChange={(v) => setPattern({ includeLeverHiddenPocket: v })}
              label="Include: leverHiddenPocket"
            />
            <div style={{ height: 8 }} />
            <LabeledField label="leverHiddenPocketSize">
              <NumInput
                value={pattern.leverHiddenPocketSize}
                min={3}
                max={12}
                onChange={(v) =>
                  setPattern({ leverHiddenPocketSize: clampInt(v, 3, 12) })
                }
              />
            </LabeledField>
          </div>

          <div
            style={{
              padding: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          >
            <Toggle
              checked={pattern.includeLeverOpensDoor}
              onChange={(v) => setPattern({ includeLeverOpensDoor: v })}
              label="Include: leverOpensDoor"
            />
            <div style={{ height: 8 }} />
            <LabeledField label="leverOpensDoorCount">
              <NumInput
                value={pattern.leverOpensDoorCount}
                min={0}
                max={6}
                onChange={(v) =>
                  setPattern({ leverOpensDoorCount: clampInt(v, 0, 6) })
                }
              />
            </LabeledField>
          </div>

          <div
            style={{
              padding: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          >
            <Toggle
              checked={pattern.includePlateOpensDoor}
              onChange={(v) => setPattern({ includePlateOpensDoor: v })}
              label="Include: plateOpensDoor"
            />
            <div style={{ height: 8 }} />
            <LabeledField label="plateOpensDoorCount">
              <NumInput
                value={pattern.plateOpensDoorCount}
                min={0}
                max={6}
                onChange={(v) =>
                  setPattern({ plateOpensDoorCount: clampInt(v, 0, 6) })
                }
              />
            </LabeledField>
          </div>

          <div
            style={{
              padding: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          >
            <Toggle
              checked={pattern.includeIntroGate}
              onChange={(v) => setPattern({ includeIntroGate: v })}
              label="Include: intro gate"
            />
            <div style={{ height: 8 }} />
            <LabeledField label="patternMaxAttempts">
              <NumInput
                value={pattern.patternMaxAttempts}
                min={10}
                max={200}
                onChange={(v) =>
                  setPattern({ patternMaxAttempts: clampInt(v, 10, 200) })
                }
              />
            </LabeledField>
          </div>

          <div
            style={{
              padding: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
            }}
          >
            <Toggle
              checked={pattern.includePhase3Compositions}
              onChange={(v) => setPattern({ includePhase3Compositions: v })}
              label="Include: Phase 3 compositions"
            />
            <div style={{ height: 8 }} />
            <LabeledField label="gateThenOptionalRewardCount">
              <NumInput
                value={pattern.gateThenOptionalRewardCount}
                min={0}
                max={4}
                onChange={(v) =>
                  setPattern({ gateThenOptionalRewardCount: clampInt(v, 0, 4) })
                }
              />
            </LabeledField>
          </div>
        </div>
      </Section>

      <Row>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 3 })}>
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            dispatch({ type: "DERIVE_CONTRACT" });
            dispatch({ type: "SET_STEP", step: 5 });
          }}
        >
          Next → Step 5 (Run Summary)
        </button>
      </Row>
    </Section>
  );
}

// --- Step 5 ---------------------------------------------------------------

function Step5Confirm(props: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  previewContract: any;
  canRun: boolean;
}) {
  const { state, dispatch, previewContract, canRun } = props;

  return (
    <Section title="Step 5 — Run Summary & Confirmation (MANDATORY)">
      <Row>
        <button onClick={() => dispatch({ type: "SET_STEP", step: 4 })}>
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => dispatch({ type: "RESET_ALL" })}>Reset</button>
      </Row>

      {!previewContract ? (
        <div style={{ opacity: 0.75 }}>
          Incomplete configuration (Steps 1–4).
        </div>
      ) : (
        <>
          <div style={{ opacity: 0.8, marginBottom: 8 }}>
            Execution may only begin from this step.
          </div>

          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(previewContract, null, 2)}
          </pre>

          <Row>
            <button
              disabled={!canRun}
              onClick={() => {
                dispatch({ type: "DERIVE_CONTRACT" });
                dispatch({ type: "EXEC_START" });
              }}
              style={{ fontWeight: 900 }}
            >
              Run
            </button>
          </Row>
        </>
      )}
    </Section>
  );
}
