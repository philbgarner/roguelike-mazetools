// src/debug/CircuitDiagnosticsPanel.tsx
//
// Milestone 4 — Phase 1 (observability only):
// UI for CircuitEvalDiagnostics produced by evaluateCircuits().
// - No gameplay semantics
// - No thresholding / "difficulty" coloring
// - Purely renders the diagnostics bundle + underlying circuit defs

import React, { useMemo, useState } from "react";
import type { CircuitDef } from "../mazeGen";
import type {
  CircuitEvalDiagnostics,
  CircuitChainingDiag,
  CycleGroupDiag,
  SignalRef,
} from "../evaluateCircuits";

export type CircuitDiagFilters = {
  search: string;
  onlySignal: boolean;
  onlyCycles: boolean;
  hideDepth0: boolean;
};

export type CircuitDiagnosticsPanelProps = {
  circuits: CircuitDef[];
  diagnostics?: CircuitEvalDiagnostics | null;

  /** Selected circuit INDEX (0..circuits.length-1). */
  selectedCircuitIndex?: number | null;
  onSelectCircuitIndex?: (idx: number | null) => void;

  /** Optional: show raw JSON dump in a <details>. */
  showRawJsonToggle?: boolean;

  /** Optional: seed/size echo shown in header (if present in diagnostics). */
  title?: string;
};

type RowVM = {
  circuitIndex: number;
  circuitId: number;
  evalOrderIndex: number;
  topoDepth: number;
  signalDepCount: number;
  participatesInCycle: boolean;
  blockedByCycle: boolean;
  signalDeps: SignalRef[];
};

function glyphFlags(r: RowVM): string {
  const a = r.participatesInCycle ? "⟳" : "";
  const b = r.blockedByCycle ? "⊘" : "";
  return a + b || "◉";
}

function fmtPct(n: number, d: number): string {
  if (d <= 0) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function findCycleForCircuit(
  cycles: CycleGroupDiag[] | undefined,
  circuitIndex: number,
): CycleGroupDiag | null {
  if (!cycles || cycles.length === 0) return null;
  for (const c of cycles) {
    if (c.members.includes(circuitIndex)) return c;
  }
  return null;
}

export function CircuitDiagnosticsPanel(props: CircuitDiagnosticsPanelProps) {
  const {
    circuits,
    diagnostics,
    selectedCircuitIndex,
    onSelectCircuitIndex,
    showRawJsonToggle = true,
    title = "Circuit Diagnostics",
  } = props;

  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const selectedIdx =
    selectedCircuitIndex !== undefined ? selectedCircuitIndex : localSelected;

  const selectIdx =
    onSelectCircuitIndex ??
    ((idx) => {
      setLocalSelected(idx);
    });

  const [filters, setFilters] = useState<CircuitDiagFilters>({
    search: "",
    onlySignal: false,
    onlyCycles: false,
    hideDepth0: false,
  });

  const rowsAll: RowVM[] = useMemo(() => {
    if (!diagnostics) return [];
    const byIdx: Record<number, CircuitDef | undefined> = {};
    for (let i = 0; i < circuits.length; i++) byIdx[i] = circuits[i];

    // diagnostics.perCircuit is authoritative for eval order & graph info
    const out: RowVM[] = diagnostics.perCircuit.map(
      (d: CircuitChainingDiag) => {
        const c = byIdx[d.circuitIndex];
        return {
          circuitIndex: d.circuitIndex,
          circuitId: c?.id ?? d.circuitIndex,
          evalOrderIndex: d.evalOrderIndex,
          topoDepth: d.topoDepth,
          signalDepCount: d.signalDepCount,
          participatesInCycle: d.participatesInCycle,
          blockedByCycle: d.blockedByCycle,
          signalDeps: d.signalDeps ?? [],
        };
      },
    );

    // Always keep list sorted by evaluation order (engine-truth view)
    out.sort((a, b) => a.evalOrderIndex - b.evalOrderIndex);
    return out;
  }, [diagnostics, circuits]);

  const rowsFiltered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rowsAll.filter((r) => {
      if (filters.onlySignal && r.signalDepCount <= 0) return false;
      if (filters.onlyCycles && !r.participatesInCycle && !r.blockedByCycle)
        return false;
      if (filters.hideDepth0 && r.topoDepth === 0) return false;

      if (!q) return true;

      // Search by circuitIndex or circuitId
      const s = `idx:${r.circuitIndex} id:${r.circuitId}`;
      return s.toLowerCase().includes(q);
    });
  }, [rowsAll, filters]);

  const selectedRow = useMemo(() => {
    if (selectedIdx == null) return null;
    return rowsAll.find((r) => r.circuitIndex === selectedIdx) ?? null;
  }, [rowsAll, selectedIdx]);

  const selectedCircuit = useMemo(() => {
    if (selectedIdx == null) return null;
    return circuits[selectedIdx] ?? null;
  }, [circuits, selectedIdx]);

  const selectedCycle = useMemo(() => {
    if (!diagnostics || selectedIdx == null) return null;
    return findCycleForCircuit(diagnostics.cycles, selectedIdx);
  }, [diagnostics, selectedIdx]);

  const quickCounts = useMemo(() => {
    const total = rowsAll.length;
    let withSignal = 0;
    let inCycle = 0;
    let blocked = 0;
    for (const r of rowsAll) {
      if (r.signalDepCount > 0) withSignal++;
      if (r.participatesInCycle) inCycle++;
      if (r.blockedByCycle) blocked++;
    }
    return { total, withSignal, inCycle, blocked };
  }, [rowsAll]);

  const summary = diagnostics?.summary;
  const hasDiag = !!diagnostics;

  return (
    <div className="panel">
      <div className="panelTitle">{title}</div>

      {!hasDiag && (
        <div className="muted">
          No circuit diagnostics yet. (Expected during Phase 1 wiring.)
        </div>
      )}

      {hasDiag && (
        <>
          {/* Toolbar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              gap: 8,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <input
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              placeholder="search: idx:12  id:3"
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "rgba(0,0,0,0.15)",
                color: "var(--text)",
                fontFamily: "var(--mono)",
                fontSize: 12,
              }}
            />

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={filters.onlySignal}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, onlySignal: e.target.checked }))
                }
              />
              <span className="muted" style={{ fontSize: 12 }}>
                SIGNAL only
              </span>
            </label>

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={filters.onlyCycles}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, onlyCycles: e.target.checked }))
                }
              />
              <span className="muted" style={{ fontSize: 12 }}>
                cycles only
              </span>
            </label>

            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={filters.hideDepth0}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, hideDepth0: e.target.checked }))
                }
              />
              <span className="muted" style={{ fontSize: 12 }}>
                hide depth 0
              </span>
            </label>
          </div>

          {/* Split panes */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 10,
              alignItems: "stretch",
            }}
          >
            {/* List */}
            <div className="circuitCard">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  Circuit List
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  total {quickCounts.total} · SIGNAL {quickCounts.withSignal} (
                  {fmtPct(quickCounts.withSignal, quickCounts.total)}) · cycles{" "}
                  {quickCounts.inCycle} · blocked {quickCounts.blocked}
                </div>
              </div>

              <div
                style={{
                  maxHeight: 340,
                  overflow: "auto",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                }}
              >
                {rowsFiltered.length === 0 && (
                  <div style={{ padding: 10 }} className="muted">
                    No circuits match filters.
                  </div>
                )}

                {rowsFiltered.map((r) => {
                  const isSelected = selectedIdx === r.circuitIndex;
                  return (
                    <button
                      key={r.circuitIndex}
                      onClick={() => selectIdx(r.circuitIndex)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        background: isSelected
                          ? "rgba(255,255,255,0.08)"
                          : "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        lineHeight: 1.35,
                      }}
                      title="Click to inspect"
                    >
                      <span style={{ display: "inline-block", width: 44 }}>
                        [{String(r.evalOrderIndex).padStart(2, "0")}]
                      </span>
                      <span style={{ display: "inline-block", width: 62 }}>
                        topo:{r.topoDepth}
                      </span>
                      <span style={{ display: "inline-block", width: 58 }}>
                        sig:{r.signalDepCount}
                      </span>
                      <span style={{ display: "inline-block", width: 26 }}>
                        {glyphFlags(r)}
                      </span>
                      <span>
                        idx:{r.circuitIndex} id:{r.circuitId}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inspector */}
            <div className="circuitCard">
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                Circuit Inspector
              </div>

              {!selectedCircuit || !selectedRow ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  Select a circuit from the list to inspect it.
                </div>
              ) : (
                <div style={{ fontSize: 12 }}>
                  {/* Header */}
                  <div style={{ marginBottom: 10 }}>
                    <div className="mono" style={{ fontSize: 12 }}>
                      <b>idx:</b> {selectedRow.circuitIndex}{" "}
                      <span className="muted">·</span> <b>id:</b>{" "}
                      {selectedRow.circuitId}
                    </div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      Eval Order:{" "}
                      <span className="mono">{selectedRow.evalOrderIndex}</span>{" "}
                      · Topo Depth:{" "}
                      <span className="mono">{selectedRow.topoDepth}</span> ·
                      SIGNAL deps:{" "}
                      <span className="mono">{selectedRow.signalDepCount}</span>{" "}
                      · Flags:{" "}
                      <span className="mono">{glyphFlags(selectedRow)}</span>
                    </div>
                  </div>

                  {/* SIGNAL deps */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      SIGNAL Dependencies
                    </div>
                    {selectedRow.signalDeps.length === 0 ? (
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
                        {selectedRow.signalDeps.map((s, i) => (
                          <div
                            key={`${s.key}-${i}`}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <div className="mono">
                              ← idx:{s.fromCircuitIndex}
                            </div>
                            <div className="mono">{s.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cycle info */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      Cycle Group
                    </div>
                    {!selectedCycle ? (
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
                          cycleIndex{" "}
                          <span className="mono">
                            {selectedCycle.cycleIndex}
                          </span>{" "}
                          · size{" "}
                          <span className="mono">
                            {selectedCycle.members.length}
                          </span>
                        </div>
                        <div
                          className="mono"
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          {selectedCycle.members.map((m) => (
                            <button
                              key={m}
                              onClick={() => selectIdx(m)}
                              style={{
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.04)",
                                color: "var(--text)",
                                borderRadius: 999,
                                padding: "2px 8px",
                                cursor: "pointer",
                                fontFamily: "var(--mono)",
                                fontSize: 12,
                              }}
                              title="Jump to member"
                            >
                              idx:{m}
                            </button>
                          ))}
                        </div>
                        {selectedCycle.outboundTo?.length ? (
                          <div className="muted" style={{ marginTop: 8 }}>
                            outboundTo:{" "}
                            <span className="mono">
                              {selectedCycle.outboundTo.join(", ")}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Underlying circuit definition (still observational) */}
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
                          {selectedCircuit.logic.type}
                          {selectedCircuit.logic.type === "THRESHOLD"
                            ? `(${selectedCircuit.logic.threshold ?? 0})`
                            : ""}
                        </span>{" "}
                        · behavior{" "}
                        <span className="mono">
                          {selectedCircuit.behavior.mode}
                        </span>
                        {selectedCircuit.behavior.invert ? (
                          <>
                            {" "}
                            · <span className="mono">invert</span>
                          </>
                        ) : null}
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <div>
                          <div className="muted">triggers</div>
                          <div className="mono">
                            {selectedCircuit.triggers?.length ?? 0}
                          </div>
                        </div>

                        <div>
                          <div className="muted">targets</div>
                          <div className="mono">
                            {selectedCircuit.targets?.length ?? 0}
                          </div>
                        </div>

                        {selectedCircuit.outputs?.length ? (
                          <div>
                            <div className="muted">outputs</div>
                            <div className="mono">
                              {selectedCircuit.outputs
                                .map((o) => o.name)
                                .join(", ")}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Global metrics */}
          <div className="circuitCard" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
              Global Metrics
            </div>

            {!summary ? (
              <div className="muted">No summary available.</div>
            ) : (
              <div
                className="mono"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <div>
                  <div className="muted">circuitCount</div>
                  <div>{diagnostics?.circuitCount ?? rowsAll.length}</div>
                </div>
                <div>
                  <div className="muted">signalEdgeCount</div>
                  <div>{diagnostics?.signalEdgeCount ?? 0}</div>
                </div>
                <div>
                  <div className="muted">cycleGroups</div>
                  <div>{diagnostics?.cycles?.length ?? 0}</div>
                </div>

                <div>
                  <div className="muted">maxTopoDepth</div>
                  <div>{summary.maxTopoDepth}</div>
                </div>
                <div>
                  <div className="muted">avgTopoDepth</div>
                  <div>{summary.avgTopoDepth.toFixed(2)}</div>
                </div>
                <div>
                  <div className="muted">circuitsWithSignalDeps</div>
                  <div>
                    {summary.circuitsWithSignalDeps} (
                    {fmtPct(
                      summary.circuitsWithSignalDeps,
                      diagnostics?.circuitCount ?? rowsAll.length,
                    )}
                    )
                  </div>
                </div>

                <div>
                  <div className="muted">cycleCircuitCount</div>
                  <div>{summary.cycleCircuitCount}</div>
                </div>
                <div>
                  <div className="muted">blockedByCycleCount</div>
                  <div>{summary.blockedByCycleCount}</div>
                </div>
              </div>
            )}

            {showRawJsonToggle && diagnostics ? (
              <details style={{ marginTop: 10 }}>
                <summary className="muted">Raw diagnostics JSON</summary>
                <pre
                  className="maze-ascii-pre"
                  style={{ marginTop: 8, maxHeight: 260 }}
                >
                  {JSON.stringify(diagnostics, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default CircuitDiagnosticsPanel;
