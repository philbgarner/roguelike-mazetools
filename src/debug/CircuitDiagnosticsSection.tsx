// src/debug/CircuitDiagnosticsSection.tsx
//
// Milestone 4 — Phase 1 (observability only):
// Thin integration wrapper that composes:
// - CircuitDiagToolbar
// - CircuitList
// - CircuitInspector
// - GlobalCircuitMetrics
//
// This is intended to be dropped into App.tsx where the old
// "Circuit Debug (raw JSON)" <details> lived.
//
// Inputs:
// - circuit defs: content.meta.circuits
// - diagnostics: evalResult.diagnostics (from evaluateCircuits)
//
// No gameplay semantics. No thresholds. No coloring by desirability.

import React, { useMemo } from "react";
import type { CircuitDef } from "../mazeGen";
import type { CircuitEvalDiagnostics } from "../evaluateCircuits";

import CircuitDiagToolbar from "./CircuitDiagToolbar";
import CircuitList from "./CircuitList";
import CircuitInspector from "./CircuitInspector";
import GlobalCircuitMetrics from "./GlobalCircuitMetrics";

import {
  buildVisibleCircuitRows,
  computeGlobalCircuitMetrics,
  buildCircuitInspectorVM,
  type CircuitDiagFilters,
  type CircuitDiagSort,
  type CircuitListRowVM,
} from "./circuitDiagnosticsVM";

export type CircuitDiagnosticsSectionProps = {
  circuits: CircuitDef[];
  diagnostics: CircuitEvalDiagnostics | null | undefined;

  selectedCircuitIndex: number | null;
  onSelectCircuitIndex: (idx: number | null) => void;

  filters: CircuitDiagFilters;
  onChangeFilters: (next: CircuitDiagFilters) => void;

  sort: CircuitDiagSort;
  onChangeSort: (next: CircuitDiagSort) => void;

  /** Optional: allow jumping to circuits from deps/cycle lists */
  allowJumpLinks?: boolean;

  /** Optional: show raw JSON dumps */
  showRawJson?: boolean;

  /** Optional: title shown at top */
  title?: string;
};

function computeQuickCounts(rows: CircuitListRowVM[]) {
  const total = rows.length;
  let withSignal = 0;
  let inCycle = 0;
  let blocked = 0;

  for (const r of rows) {
    if (r.signalDepCount > 0) withSignal++;
    if (r.participatesInCycle) inCycle++;
    if (r.blockedByCycle) blocked++;
  }

  return { total, withSignal, inCycle, blocked };
}

export default function CircuitDiagnosticsSection(
  props: CircuitDiagnosticsSectionProps,
) {
  const {
    circuits,
    diagnostics,
    selectedCircuitIndex,
    onSelectCircuitIndex,

    filters,
    onChangeFilters,

    sort,
    onChangeSort,

    allowJumpLinks = true,
    showRawJson = false,
    title = "Circuit Diagnostics",
  } = props;

  const rows = useMemo(() => {
    return buildVisibleCircuitRows(circuits, diagnostics, filters, sort);
  }, [circuits, diagnostics, filters, sort]);

  const quickCounts = useMemo(() => computeQuickCounts(rows), [rows]);

  const metrics = useMemo(() => {
    return computeGlobalCircuitMetrics(diagnostics);
  }, [diagnostics]);

  const inspectorVm = useMemo(() => {
    return buildCircuitInspectorVM(circuits, diagnostics, selectedCircuitIndex);
  }, [circuits, diagnostics, selectedCircuitIndex]);

  return (
    <div className="panel">
      <div className="panelTitle">{title}</div>

      {!diagnostics ? (
        <div className="muted">
          No circuit diagnostics yet. (Expected during Phase 1 wiring.)
        </div>
      ) : (
        <>
          <CircuitDiagToolbar
            filters={filters}
            onChangeFilters={onChangeFilters}
            sort={sort}
            onChangeSort={onChangeSort}
            counts={quickCounts}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 10,
              alignItems: "stretch",
            }}
          >
            <CircuitList
              rows={rows}
              selectedCircuitIndex={selectedCircuitIndex}
              onSelectCircuitIndex={(idx) => onSelectCircuitIndex(idx)}
              header={
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12 }}>
                    Circuit List
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    sorted by {sort.kind}
                  </div>
                </div>
              }
            />

            <div className="circuitCard">
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                Circuit Inspector
              </div>

              <CircuitInspector
                vm={inspectorVm}
                onSelectCircuitIndex={
                  allowJumpLinks
                    ? (idx) => onSelectCircuitIndex(idx)
                    : undefined
                }
                showRawCircuitDef={showRawJson}
              />
            </div>
          </div>

          <GlobalCircuitMetrics metrics={metrics} />

          {showRawJson && diagnostics ? (
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
        </>
      )}
    </div>
  );
}
