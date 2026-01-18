// src/debug/CircuitInspector.tsx
//
// Milestone 4 — Phase 1 (observability only):
// Renders a focused view of a single circuit using the Inspector VM.
// - No gameplay semantics
// - No thresholds / difficulty labeling
// - Purely mechanical/topological info + underlying circuit definition

import React from "react";
import type { CircuitInspectorVM } from "./circuitDiagnosticsVM";

export type CircuitInspectorProps = {
  vm: CircuitInspectorVM | null;

  /** Optional: enable "jump to circuit" buttons (deps, cycle members). */
  onSelectCircuitIndex?: (idx: number) => void;

  /** Optional: show the full circuit definition JSON under a <details>. */
  showRawCircuitDef?: boolean;
};

function fmtMaybeBool(v: boolean) {
  return v ? "true" : "false";
}

function pillStyle(selected: boolean) {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    background: selected ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
    color: "var(--text)",
    borderRadius: 999,
    padding: "2px 8px",
    cursor: "pointer",
    fontFamily: "var(--mono)",
    fontSize: 12,
  } as const;
}

export default function CircuitInspector(props: CircuitInspectorProps) {
  const { vm, onSelectCircuitIndex, showRawCircuitDef = false } = props;

  if (!vm) {
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        Select a circuit from the list to inspect it.
      </div>
    );
  }

  const logic = vm.def.logic;
  const behavior = vm.def.behavior;

  return (
    <div style={{ fontSize: 12 }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div className="mono" style={{ fontSize: 12 }}>
          <b>idx:</b> {vm.circuitIndex} <span className="muted">·</span>{" "}
          <b>id:</b> {vm.circuitId}
        </div>

        <div className="muted" style={{ marginTop: 4, lineHeight: 1.4 }}>
          Eval Order: <span className="mono">{vm.evalOrderIndex}</span> · Topo
          Depth: <span className="mono">{vm.topoDepth}</span> · SIGNAL deps:{" "}
          <span className="mono">{vm.signalDepCount}</span> · inCycle:{" "}
          <span className="mono">{fmtMaybeBool(vm.participatesInCycle)}</span> ·
          blockedByCycle:{" "}
          <span className="mono">{fmtMaybeBool(vm.blockedByCycle)}</span>
        </div>
      </div>

      {/* SIGNAL deps */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          SIGNAL Dependencies
        </div>

        {vm.signalDeps.length === 0 ? (
          <div className="muted">None</div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 6,
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: 8,
            }}
          >
            {vm.signalDeps.map((s, i) => (
              <div
                key={`${s.key}-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div className="mono">← idx:{s.fromCircuitIndex}</div>
                <div className="mono">{s.name}</div>

                {onSelectCircuitIndex ? (
                  <button
                    onClick={() => onSelectCircuitIndex(s.fromCircuitIndex)}
                    style={pillStyle(false)}
                    title="Jump to dependency"
                  >
                    jump
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cycle group */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Cycle Group</div>

        {!vm.cycle ? (
          <div className="muted">Not in a detected SCC cycle.</div>
        ) : (
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: 8,
            }}
          >
            <div className="muted" style={{ marginBottom: 6 }}>
              cycleIndex <span className="mono">{vm.cycle.cycleIndex}</span> ·
              size <span className="mono">{vm.cycle.members.length}</span>
            </div>

            <div
              className="mono"
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
            >
              {vm.cycle.members.map((m) => {
                const isMe = m === vm.circuitIndex;
                return (
                  <button
                    key={m}
                    onClick={() => onSelectCircuitIndex?.(m)}
                    disabled={!onSelectCircuitIndex}
                    style={pillStyle(isMe)}
                    title={isMe ? "Current circuit" : "Jump to member"}
                  >
                    idx:{m}
                  </button>
                );
              })}
            </div>

            {vm.cycle.outboundTo?.length ? (
              <div className="muted" style={{ marginTop: 8 }}>
                outboundTo:{" "}
                <span className="mono">{vm.cycle.outboundTo.join(", ")}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Circuit definition summary */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          Circuit Definition
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: 8,
          }}
        >
          <div className="muted" style={{ marginBottom: 6 }}>
            logic{" "}
            <span className="mono">
              {logic.type}
              {logic.type === "THRESHOLD" ? `(${logic.threshold ?? 0})` : ""}
            </span>{" "}
            · behavior{" "}
            <span className="mono">
              {behavior.mode}
              {behavior.invert ? " (invert)" : ""}
            </span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "baseline",
              }}
            >
              <div className="muted">triggers</div>
              <div className="mono">{vm.def.triggers?.length ?? 0}</div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "baseline",
              }}
            >
              <div className="muted">targets</div>
              <div className="mono">{vm.def.targets?.length ?? 0}</div>
            </div>

            {vm.def.outputs?.length ? (
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  outputs
                </div>
                <div className="mono" style={{ lineHeight: 1.4 }}>
                  {vm.def.outputs.map((o) => o.name).join(", ")}
                </div>
              </div>
            ) : null}
          </div>

          {showRawCircuitDef ? (
            <details style={{ marginTop: 10 }}>
              <summary className="muted">Raw circuit def JSON</summary>
              <pre
                className="maze-ascii-pre"
                style={{ marginTop: 8, maxHeight: 240 }}
              >
                {JSON.stringify(vm.def, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
