// src/debug/CircuitDiagToolbar.tsx
//
// Milestone 4 — Phase 1 (observability only):
// Toolbar for circuit diagnostics list: search + filters + sort.
// No gameplay semantics, no thresholds.
//
// Intended to be used by CircuitDiagnosticsPanel.tsx but also reusable.

import React from "react";
import type {
  CircuitDiagFilters,
  CircuitDiagSort,
} from "./circuitDiagnosticsVM";

export type CircuitDiagQuickCounts = {
  total: number;
  withSignal: number;
  inCycle: number;
  blocked: number;
};

export type CircuitDiagToolbarProps = {
  filters: CircuitDiagFilters;
  onChangeFilters(next: CircuitDiagFilters): void;

  sort: CircuitDiagSort;
  onChangeSort(next: CircuitDiagSort): void;

  counts: CircuitDiagQuickCounts;
};

function fmtPct(n: number, d: number): string {
  if (d <= 0) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}

function sortLabel(s: CircuitDiagSort): string {
  const dir = s.dir === "desc" ? "↓" : "↑";
  switch (s.kind) {
    case "evalOrder":
      return `eval order ${dir}`;
    case "topoDepth":
      return `topo depth ${dir}`;
    case "signalDepCount":
      return `SIGNAL deps ${dir}`;
    case "circuitIndex":
      return `index ${dir}`;
    case "circuitId":
      return `id ${dir}`;
    default:
      return `eval order ${dir}`;
  }
}

export default function CircuitDiagToolbar(props: CircuitDiagToolbarProps) {
  const { filters, onChangeFilters, sort, onChangeSort, counts } = props;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto auto",
        gap: 8,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      {/* Search */}
      <input
        value={filters.search ?? ""}
        onChange={(e) =>
          onChangeFilters({ ...filters, search: e.target.value })
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

      {/* Filters */}
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={!!filters.onlySignal}
          onChange={(e) =>
            onChangeFilters({ ...filters, onlySignal: e.target.checked })
          }
        />
        <span className="muted" style={{ fontSize: 12 }}>
          SIGNAL only
        </span>
      </label>

      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={!!filters.onlyCycles}
          onChange={(e) =>
            onChangeFilters({ ...filters, onlyCycles: e.target.checked })
          }
        />
        <span className="muted" style={{ fontSize: 12 }}>
          cycles only
        </span>
      </label>

      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={!!filters.hideDepth0}
          onChange={(e) =>
            onChangeFilters({ ...filters, hideDepth0: e.target.checked })
          }
        />
        <span className="muted" style={{ fontSize: 12 }}>
          hide depth 0
        </span>
      </label>

      {/* Sort */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 12 }}>
          sort
        </span>
        <select
          value={`${sort.kind}:${sort.dir ?? "asc"}`}
          onChange={(e) => {
            const [kind, dir] = e.target.value.split(":") as [
              CircuitDiagSort["kind"],
              "asc" | "desc",
            ];
            onChangeSort({ kind, dir });
          }}
          title={sortLabel(sort)}
          style={{
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "rgba(0,0,0,0.15)",
            color: "var(--text)",
            fontFamily: "var(--mono)",
            fontSize: 12,
          }}
        >
          <option value="evalOrder:asc">eval order ↑</option>
          <option value="evalOrder:desc">eval order ↓</option>

          <option value="topoDepth:asc">topo depth ↑</option>
          <option value="topoDepth:desc">topo depth ↓</option>

          <option value="signalDepCount:asc">SIGNAL deps ↑</option>
          <option value="signalDepCount:desc">SIGNAL deps ↓</option>

          <option value="circuitIndex:asc">index ↑</option>
          <option value="circuitIndex:desc">index ↓</option>

          <option value="circuitId:asc">id ↑</option>
          <option value="circuitId:desc">id ↓</option>
        </select>
      </div>

      {/* One-line stats (wrap under on small widths via CSS or container) */}
      <div
        className="muted"
        style={{
          gridColumn: "1 / -1",
          fontSize: 12,
          marginTop: 2,
        }}
      >
        total <span className="mono">{counts.total}</span> · SIGNAL{" "}
        <span className="mono">{counts.withSignal}</span> (
        <span className="mono">{fmtPct(counts.withSignal, counts.total)}</span>)
        · cycles <span className="mono">{counts.inCycle}</span> · blocked{" "}
        <span className="mono">{counts.blocked}</span>
      </div>
    </div>
  );
}
