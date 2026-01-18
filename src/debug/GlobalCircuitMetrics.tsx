// src/debug/GlobalCircuitMetrics.tsx
//
// Milestone 4 — Phase 1 (observability only):
// Renders dungeon-wide circuit topology summary.
// - Must match batch-harness aggregations
// - No semantics, no thresholding

import React from "react";
import type { CircuitGlobalMetricsVM } from "./circuitDiagnosticsVM";

export type GlobalCircuitMetricsProps = {
  metrics: CircuitGlobalMetricsVM | null;
  title?: string;
};

function fmtPct01(p: number): string {
  const pct = Math.round(p * 100);
  return `${pct}%`;
}

export default function GlobalCircuitMetrics(props: GlobalCircuitMetricsProps) {
  const { metrics, title = "Global Metrics" } = props;

  return (
    <div className="circuitCard" style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
        {title}
      </div>

      {!metrics ? (
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
            <div>{metrics.circuitCount}</div>
          </div>

          <div>
            <div className="muted">signalEdgeCount</div>
            <div>{metrics.signalEdgeCount}</div>
          </div>

          <div>
            <div className="muted">cycleGroupCount</div>
            <div>{metrics.cycleGroupCount}</div>
          </div>

          <div>
            <div className="muted">maxTopoDepth</div>
            <div>{metrics.maxTopoDepth}</div>
          </div>

          <div>
            <div className="muted">avgTopoDepth</div>
            <div>{metrics.avgTopoDepth.toFixed(2)}</div>
          </div>

          <div>
            <div className="muted">pctWithSignalDeps</div>
            <div>
              {metrics.circuitsWithSignalDeps} / {metrics.circuitCount} (
              {fmtPct01(metrics.pctWithSignalDeps)})
            </div>
          </div>

          <div>
            <div className="muted">cycleCircuitCount</div>
            <div>{metrics.cycleCircuitCount}</div>
          </div>

          <div>
            <div className="muted">blockedByCycleCount</div>
            <div>{metrics.blockedByCycleCount}</div>
          </div>

          <div>
            <div className="muted">largestCycleSize</div>
            <div>{metrics.largestCycleSize}</div>
          </div>
        </div>
      )}
    </div>
  );
}
