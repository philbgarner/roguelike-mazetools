// src/wizard/WizardScreen.tsx
import React, { useMemo, useEffect, useCallback } from "react";
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
  type InclusionRules,
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
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div
        style={{
          fontSize: 12,
          opacity: 0.8,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <b>{props.label}</b>

        {props.tooltip ? (
          <span
            title={props.tooltip}
            style={{
              display: "inline-flex",
              width: 16,
              height: 16,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.06)",
              cursor: "help",
              fontSize: 11,
              lineHeight: "16px",
              userSelect: "none",
              opacity: 0.9,
            }}
            aria-label={`${props.label} help`}
          >
            i
          </span>
        ) : null}

        {props.hint ? (
          <span style={{ opacity: 0.75 }}>— {props.hint}</span>
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
  rangeHint?: boolean;
}) {
  return (
    <div>
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
      {props.rangeHint && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
          {props.min} – {props.max}
        </div>
      )}
    </div>
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

      <InvalidationBanner
        message={state.invalidationMessage}
        onDismiss={() => dispatch({ type: "CLEAR_INVALIDATION_MSG" })}
      />

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

// --- Invalidation Banner --------------------------------------------------

function InvalidationBanner(props: { message: string; onDismiss: () => void }) {
  const { message, onDismiss } = props;

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      style={{
        padding: "8px 12px",
        border: "1px solid rgba(251, 191, 36, 0.4)",
        borderRadius: 12,
        marginBottom: 10,
        background: "rgba(251, 191, 36, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        fontSize: 13,
      }}
    >
      <span style={{ opacity: 0.9 }}>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.6)",
          cursor: "pointer",
          fontSize: 14,
          padding: "0 4px",
        }}
      >
        ×
      </button>
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

  const stepNames: Record<number, string> = {
    1: "World Seed & Dimensions",
    2: "BSP Geometry",
    3: "Generation Mode",
    4: "Content Options",
    5: "Confirm & Run",
  };

  const Btn = (p: {
    n: 1 | 2 | 3 | 4 | 5;
    enabled: boolean;
    label: string;
  }) => (
    <button
      onClick={() => (p.enabled ? onGo(p.n) : null)}
      disabled={!p.enabled}
      aria-current={step === p.n ? "step" : undefined}
      aria-label={`Step ${p.n}: ${stepNames[p.n]}`}
      style={{
        opacity: step === p.n ? 1 : 0.85,
        fontWeight: step === p.n ? 800 : 600,
      }}
    >
      {p.label}
    </button>
  );

  return (
    <div
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      role="navigation"
      aria-label="Wizard steps"
    >
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
            rangeHint
            onChange={(v) => setWorld({ width: clampInt(v, 24, 256) })}
          />
        </LabeledField>
        <LabeledField label="Height" hint="tiles">
          <NumInput
            value={world.height}
            min={24}
            max={256}
            rangeHint
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
          onClick={() => dispatch({ type: "FINISH_RUN" })}
          style={{ fontWeight: 800 }}
          title="Run immediately using your current edits and defaults for unvisited steps."
        >
          Finish &amp; Run
        </button>
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
          disabled={!state.world}
          onClick={() => dispatch({ type: "FINISH_RUN" })}
          style={{ fontWeight: 800 }}
        >
          Finish &amp; Run
        </button>
        <button
          onClick={() =>
            dispatch({ type: "SET_BSP", bsp: DEFAULT_BSP as BspConfig })
          }
        >
          Reset BSP Defaults
        </button>
      </Row>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <LabeledField
          label="maxDepth"
          hint="split depth cap"
          tooltip="Maximum BSP recursion depth. Higher = more partitions (more rooms/corridors), but can get more fragmented/noisy."
        >
          <NumInput
            value={bsp.maxDepth}
            min={2}
            max={12}
            rangeHint
            onChange={(v) => setBsp({ maxDepth: clampInt(v, 2, 12) })}
          />
        </LabeledField>

        <LabeledField
          label="splitPadding"
          hint="min spacing near splits"
          tooltip="Extra padding enforced around split lines. Higher = fewer skinny partitions and less edge-hugging rooms."
        >
          <NumInput
            value={bsp.splitPadding}
            min={0}
            max={6}
            rangeHint
            onChange={(v) => setBsp({ splitPadding: clampInt(v, 0, 6) })}
          />
        </LabeledField>

        <LabeledField
          label="minLeafSize"
          tooltip="Minimum size of a BSP leaf region (in tiles). Prevents splitting into tiny regions that can't host useful rooms."
        >
          <NumInput
            value={bsp.minLeafSize}
            min={8}
            max={64}
            rangeHint
            onChange={(v) => setBsp({ minLeafSize: clampInt(v, 8, 64) })}
          />
        </LabeledField>

        <LabeledField
          label="maxLeafSize"
          tooltip="Maximum size of a BSP leaf region (in tiles). Regions larger than this tend to be split again (unless maxDepth stops it)."
        >
          <NumInput
            value={bsp.maxLeafSize}
            min={10}
            max={96}
            rangeHint
            onChange={(v) => setBsp({ maxLeafSize: clampInt(v, 10, 96) })}
          />
        </LabeledField>

        <LabeledField
          label="roomPadding"
          tooltip="Clearance between a room rectangle and its containing leaf bounds. Higher = thicker walls/negative space around rooms."
        >
          <NumInput
            value={bsp.roomPadding}
            min={0}
            max={6}
            rangeHint
            onChange={(v) => setBsp({ roomPadding: clampInt(v, 0, 6) })}
          />
        </LabeledField>

        <LabeledField
          label="roomFillLeafChance"
          hint="0..1"
          tooltip="Probability that a leaf gets a room. Lower = more empty leaves (more corridor/negative space). Higher = denser room placement."
        >
          <NumInput
            value={bsp.roomFillLeafChance}
            min={0}
            max={1}
            step={0.05}
            rangeHint
            onChange={(v) =>
              setBsp({ roomFillLeafChance: Math.max(0, Math.min(1, v)) })
            }
          />
        </LabeledField>

        <LabeledField
          label="minRoomSize"
          tooltip="Minimum room side length (tiles). Prevents tiny closets unless your design wants them."
        >
          <NumInput
            value={bsp.minRoomSize}
            min={3}
            max={24}
            rangeHint
            onChange={(v) => setBsp({ minRoomSize: clampInt(v, 3, 24) })}
          />
        </LabeledField>

        <LabeledField
          label="maxRoomSize"
          tooltip="Maximum room side length (tiles). Caps how large a room can be inside a leaf (even if the leaf is bigger)."
        >
          <NumInput
            value={bsp.maxRoomSize}
            min={4}
            max={32}
            rangeHint
            onChange={(v) => setBsp({ maxRoomSize: clampInt(v, 4, 32) })}
          />
        </LabeledField>

        <LabeledField
          label="corridorWidth"
          tooltip="Corridor thickness in tiles. 1 = classic tight corridors; 2+ = chunkier hallways, easier navigation, more open feel."
        >
          <NumInput
            value={bsp.corridorWidth}
            min={1}
            max={4}
            rangeHint
            onChange={(v) => setBsp({ corridorWidth: clampInt(v, 1, 4) })}
          />
        </LabeledField>

        <LabeledField
          label="keepOuterWalls"
          tooltip="If enabled, the generator keeps a solid border around the map edges (no carve-through to the outside). Useful for containment and nicer silhouettes."
        >
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
        <button
          disabled={!state.world}
          onClick={() => dispatch({ type: "FINISH_RUN" })}
          style={{ fontWeight: 800 }}
        >
          Finish &amp; Run
        </button>
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

      <InclusionRulesSection mode={mode} dispatch={dispatch} />

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

// --- Inclusion / Exclusion Rules Section ----------------------------------

const ALL_PATTERN_NAMES = [
  "introGate",
  "leverHiddenPocket",
  "leverOpensDoor",
  "plateOpensDoor",
  "gateThenOptionalReward",
] as const;

const ALL_CONTENT_TYPES = [
  "levers",
  "doors",
  "plates",
  "blocks",
  "chests",
  "secrets",
  "hazards",
  "monsters",
  "keys",
  "circuits",
  "hidden",
] as const;

function InclusionRulesSection(props: {
  mode: { inclusionRules: InclusionRules | null; [k: string]: any };
  dispatch: React.Dispatch<WizardAction>;
}) {
  const { mode, dispatch } = props;
  const rules = mode.inclusionRules;

  const excludePatterns = rules?.excludePatterns ?? [];
  const requirePatterns = rules?.requirePatterns ?? [];
  const requireContentTypes = rules?.requireContentTypes ?? [];

  const update = (patch: Partial<InclusionRules>) => {
    const next: InclusionRules = {
      excludePatterns: patch.excludePatterns ?? excludePatterns,
      requirePatterns: patch.requirePatterns ?? requirePatterns,
      requireContentTypes: patch.requireContentTypes ?? requireContentTypes,
    };
    // If everything is empty, set null (unconstrained)
    const isEmpty =
      next.excludePatterns!.length === 0 &&
      next.requirePatterns!.length === 0 &&
      next.requireContentTypes!.length === 0;
    dispatch({
      type: "SET_INCLUSION_RULES",
      inclusionRules: isEmpty ? null : next,
    });
  };

  const toggleIn = (arr: string[], val: string): string[] =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  // Detect contradictions (excluded AND required pattern)
  const contradictions = excludePatterns.filter((p) =>
    requirePatterns.includes(p),
  );

  return (
    <Section title="Inclusion / Exclusion Rules">
      <div style={{ opacity: 0.75, marginBottom: 10 }}>
        Exclude patterns (pre-generation skip) and require patterns/content
        (post-generation rejection). Unchecked = unconstrained.
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}
      >
        <div
          style={{
            padding: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Exclude Patterns
          </div>
          {ALL_PATTERN_NAMES.map((name) => (
            <Toggle
              key={`ex-${name}`}
              checked={excludePatterns.includes(name)}
              onChange={() =>
                update({ excludePatterns: toggleIn(excludePatterns, name) })
              }
              label={name}
            />
          ))}
        </div>

        <div
          style={{
            padding: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Require Patterns
          </div>
          {ALL_PATTERN_NAMES.map((name) => (
            <Toggle
              key={`req-${name}`}
              checked={requirePatterns.includes(name)}
              onChange={() =>
                update({ requirePatterns: toggleIn(requirePatterns, name) })
              }
              label={name}
            />
          ))}
        </div>

        <div
          style={{
            padding: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Require Content Types
          </div>
          {ALL_CONTENT_TYPES.map((name) => (
            <Toggle
              key={`rct-${name}`}
              checked={requireContentTypes.includes(name)}
              onChange={() =>
                update({
                  requireContentTypes: toggleIn(requireContentTypes, name),
                })
              }
              label={name}
            />
          ))}
        </div>
      </div>

      {contradictions.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: 6,
            background: "#5a3a1a",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          Warning: pattern(s) <strong>{contradictions.join(", ")}</strong> are
          both excluded and required. This guarantees 100% rejection.
        </div>
      )}
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
            Execution may begin from this step, or via “Finish &amp; Run” from
            any step.
          </div>

          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(previewContract, null, 2)}
          </pre>

          <Row>
            <button
              disabled={!state.world}
              onClick={() => dispatch({ type: "FINISH_RUN" })}
              style={{ fontWeight: 800, marginRight: 8 }}
              title="Run immediately using your current edits and defaults for unvisited steps."
            >
              Finish &amp; Run
            </button>
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
