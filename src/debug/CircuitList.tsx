// src/debug/CircuitList.tsx
//
// Milestone 4 — Phase 1 (observability only):
// Renders the circuit list (already filtered/sorted by the VM layer).
// - Default ordering should be evalOrderIndex asc (engine truth)
// - No gameplay semantics, no thresholding

import React from "react";
import type { CircuitListRowVM } from "./circuitDiagnosticsVM";
import { getGlyphFlags } from "./circuitDiagnosticsVM";

export type CircuitListProps = {
  rows: CircuitListRowVM[];

  selectedCircuitIndex: number | null;
  onSelectCircuitIndex: (idx: number) => void;

  /** Optional: max height for the scroll area (px). */
  maxHeight?: number;

  /** Optional: show a compact summary header above list. */
  header?: React.ReactNode;

  /** Optional: show when rows is empty. */
  emptyMessage?: string;
};

function pad2(n: number) {
  const s = String(n);
  return s.length >= 2 ? s : `0${s}`;
}

export default function CircuitList(props: CircuitListProps) {
  const {
    rows,
    selectedCircuitIndex,
    onSelectCircuitIndex,
    maxHeight = 340,
    header,
    emptyMessage = "No circuits match filters.",
  } = props;

  return (
    <div className="circuitCard">
      {header ? <div style={{ marginBottom: 8 }}>{header}</div> : null}

      <div
        style={{
          maxHeight,
          overflow: "auto",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
        }}
      >
        {rows.length === 0 ? (
          <div style={{ padding: 10 }} className="muted">
            {emptyMessage}
          </div>
        ) : null}

        {rows.map((r) => {
          const isSelected = selectedCircuitIndex === r.circuitIndex;
          return (
            <button
              key={r.circuitIndex}
              onClick={() => onSelectCircuitIndex(r.circuitIndex)}
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
                [{pad2(r.evalOrderIndex)}]
              </span>
              <span style={{ display: "inline-block", width: 62 }}>
                topo:{r.topoDepth}
              </span>
              <span style={{ display: "inline-block", width: 58 }}>
                sig:{r.signalDepCount}
              </span>
              <span style={{ display: "inline-block", width: 26 }}>
                {getGlyphFlags(r)}
              </span>
              <span>
                idx:{r.circuitIndex} id:{r.circuitId}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
