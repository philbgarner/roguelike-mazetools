// src/debug/RoleDiagnosticsSection.tsx
//
// Milestone 4 — Phase 2 (observational only):
// UI surfacing for RoleDiagnosticsV1 produced by analyzeRoleDiagnosticsV1().
// - Read-only
// - Deterministic
// - Batch-safe (renders stable schema; no side effects)
//
// Intended to sit next to CircuitDiagnosticsSection in App.tsx.

import React, { useMemo, useState } from "react";
import type { CircuitDef } from "../mazeGen";
import type {
  PuzzleRole,
  RoleDiagnosticsV1,
  RoleRuleHitV1,
  RoleRuleId,
} from "../roleDiagnostics";

type RoleFilter = "ALL" | "MISSING" | PuzzleRole;

type SortKind = "depthN" | "topoDepth" | "signalDepCount" | "circuitIndex";
type SortDir = "asc" | "desc";

type Sort = { kind: SortKind; dir: SortDir };

export type RoleDiagnosticsSectionProps = {
  title?: string;

  circuits: CircuitDef[];
  diagnostics: RoleDiagnosticsV1 | null;

  selectedCircuitIndex: number | null;
  onSelectCircuitIndex: (idx: number | null) => void;

  /** Optional: show raw JSON dump in a <details> (UI only). */
  showRawJson?: boolean;
};

type RowVM = {
  circuitIndex: number;
  role: PuzzleRole | null;
  topoDepth: number;
  signalDepCount: number;
  participatesInCycle: boolean;
  blockedByCycle: boolean;

  anchorRoomId: number | null;
  roomDepth: number | null;
  depthN: number | null;
  onMainPath: boolean | null;

  ruleHitCount: number;
};

function fmtDepthN(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function fmtBool(v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? "yes" : "no";
}

function pad2(n: number) {
  const s = String(n);
  return s.length >= 2 ? s : `0${s}`;
}

function roleLabel(r: PuzzleRole | null): string {
  return r ?? "—";
}

function glyphFlags(r: Pick<RowVM, "participatesInCycle" | "blockedByCycle">) {
  const a = r.participatesInCycle ? "⟳" : "";
  const b = r.blockedByCycle ? "⊘" : "";
  return a + b || "◉";
}

function parseSearch(raw: string) {
  // Supported (simple, stable):
  // - "idx:12"
  // - "role:MAIN_PATH_GATE" or "role:missing"
  // - "rule:MAIN_LATE_TRIVIAL"
  // - otherwise substring match over role/rule ids
  const s = (raw ?? "").trim();
  const parts = s.split(/\s+/).filter(Boolean);

  let idx: number | null = null;
  let role: string | null = null;
  let rule: string | null = null;
  const free: string[] = [];

  for (const p of parts) {
    const mIdx = /^idx:(\d+)$/i.exec(p);
    if (mIdx) {
      idx = Number(mIdx[1]);
      continue;
    }
    const mRole = /^role:(.+)$/i.exec(p);
    if (mRole) {
      role = mRole[1];
      continue;
    }
    const mRule = /^rule:(.+)$/i.exec(p);
    if (mRule) {
      rule = mRule[1];
      continue;
    }
    free.push(p);
  }

  return { idx, role, rule, freeText: free.join(" ").toLowerCase() };
}

function sortRows(rows: RowVM[], sort: Sort): RowVM[] {
  const dir = sort.dir === "desc" ? -1 : 1;

  const key = (r: RowVM): number => {
    switch (sort.kind) {
      case "depthN":
        // nulls sort last
        return r.depthN == null ? Number.POSITIVE_INFINITY : r.depthN;
      case "topoDepth":
        return r.topoDepth;
      case "signalDepCount":
        return r.signalDepCount;
      case "circuitIndex":
      default:
        return r.circuitIndex;
    }
  };

  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1 * dir;
    if (ka > kb) return 1 * dir;
    // Stable tie-breakers
    return (a.circuitIndex - b.circuitIndex) * dir;
  });
}

function buildHitsByCircuitIndex(hits: RoleRuleHitV1[]) {
  const map = new Map<number, RoleRuleHitV1[]>();
  for (const h of hits) {
    const arr = map.get(h.circuitIndex) ?? [];
    arr.push(h);
    map.set(h.circuitIndex, arr);
  }
  // stable-ish ordering inside each list
  for (const [k, arr] of map) {
    arr.sort((a, b) => {
      if (a.ruleId < b.ruleId) return -1;
      if (a.ruleId > b.ruleId) return 1;
      return a.code.localeCompare(b.code);
    });
    map.set(k, arr);
  }
  return map;
}

function ruleListFromSummary(ruleCounts: Record<string, number>) {
  const items = Object.entries(ruleCounts)
    .filter(([, n]) => (n | 0) > 0)
    .sort((a, b) => b[1] - a[1]);
  return items as Array<[RoleRuleId, number]>;
}

export default function RoleDiagnosticsSection(
  props: RoleDiagnosticsSectionProps,
) {
  const {
    title = "Role Diagnostics",
    circuits,
    diagnostics,
    selectedCircuitIndex,
    onSelectCircuitIndex,
    showRawJson = false,
  } = props;

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [onlyWithRuleHits, setOnlyWithRuleHits] = useState(false);
  const [sort, setSort] = useState<Sort>({ kind: "depthN", dir: "asc" });

  const hitsByCircuitIndex = useMemo(() => {
    return diagnostics
      ? buildHitsByCircuitIndex(diagnostics.hits ?? [])
      : new Map();
  }, [diagnostics]);

  const rows: RowVM[] = useMemo(() => {
    if (!diagnostics) return [];

    return diagnostics.perCircuit.map((pc) => {
      const hits = hitsByCircuitIndex.get(pc.circuitIndex) ?? [];
      return {
        circuitIndex: pc.circuitIndex,
        role: pc.role,
        topoDepth: pc.topoDepth | 0,
        signalDepCount: pc.signalDepCount | 0,
        participatesInCycle: !!pc.participatesInCycle,
        blockedByCycle: !!pc.blockedByCycle,

        anchorRoomId: pc.anchor?.anchorRoomId ?? null,
        roomDepth: pc.anchor?.roomDepth ?? null,
        depthN: pc.anchor?.depthN ?? null,
        onMainPath: pc.anchor?.onMainPath ?? null,

        ruleHitCount: hits.length,
      };
    });
  }, [diagnostics, hitsByCircuitIndex]);

  const visibleRows = useMemo(() => {
    if (!diagnostics) return [];

    const { idx, role, rule, freeText } = parseSearch(search);
    const ruleQ = (rule ?? "").toUpperCase();
    const roleQ = (role ?? "").toUpperCase();

    const out: RowVM[] = [];

    for (const r of rows) {
      if (idx != null && r.circuitIndex !== idx) continue;

      // role dropdown filter
      if (roleFilter !== "ALL") {
        if (roleFilter === "MISSING") {
          if (r.role != null) continue;
        } else {
          if (r.role !== roleFilter) continue;
        }
      }

      // role: query override (optional)
      if (roleQ) {
        if (roleQ === "MISSING") {
          if (r.role != null) continue;
        } else if ((r.role ?? "").toUpperCase() !== roleQ) {
          continue;
        }
      }

      if (onlyWithRuleHits && r.ruleHitCount <= 0) continue;

      // rule: query filter
      if (ruleQ) {
        const hits = hitsByCircuitIndex.get(r.circuitIndex) ?? [];
        if (!hits.some((h: any) => (h.ruleId ?? "").toUpperCase() === ruleQ))
          continue;
      }

      // free-text match: role / any hit ruleId / hit code
      if (freeText) {
        const roleStr = (r.role ?? "").toLowerCase();
        const hits = hitsByCircuitIndex.get(r.circuitIndex) ?? [];
        const hitStr = hits
          .map((h: any) =>
            `${h.ruleId} ${h.code} ${h.detail ?? ""}`.toLowerCase(),
          )
          .join(" | ");
        const merged = `${roleStr} ${hitStr}`;
        if (!merged.includes(freeText)) continue;
      }

      out.push(r);
    }

    return sortRows(out, sort);
  }, [
    diagnostics,
    rows,
    hitsByCircuitIndex,
    search,
    roleFilter,
    onlyWithRuleHits,
    sort,
  ]);

  const selectedRow = useMemo(() => {
    if (!diagnostics) return null;
    if (selectedCircuitIndex == null) return null;
    return rows.find((r) => r.circuitIndex === selectedCircuitIndex) ?? null;
  }, [diagnostics, rows, selectedCircuitIndex]);

  const selectedCircuitDef = useMemo(() => {
    if (!selectedRow) return null;
    return circuits[selectedRow.circuitIndex] ?? null;
  }, [circuits, selectedRow]);

  const selectedHits = useMemo(() => {
    if (!selectedRow) return [];
    return hitsByCircuitIndex.get(selectedRow.circuitIndex) ?? [];
  }, [hitsByCircuitIndex, selectedRow]);

  const summaryRuleList = useMemo(() => {
    if (!diagnostics) return [];
    return ruleListFromSummary(diagnostics.summary.ruleCounts as any);
  }, [diagnostics]);

  const roleCounts = diagnostics?.summary.roleCounts ?? null;
  const roleMissingCount = diagnostics?.summary.roleMissingCount ?? 0;

  function toggleSort(kind: SortKind) {
    setSort((prev) => {
      if (prev.kind === kind) {
        return { kind, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      // sensible defaults:
      const dir: SortDir = kind === "depthN" ? "asc" : "desc";
      return { kind, dir };
    });
  }

  return (
    <div className="panel">
      <div className="panelTitle">{title}</div>

      {!diagnostics ? (
        <div className="muted">No role diagnostics available yet.</div>
      ) : (
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search: idx:12  role:MAIN_PATH_GATE  rule:MAIN_LATE_TRIVIAL"
              style={{
                width: "100%",
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "rgba(0,0,0,0.15)",
                color: "var(--text)",
              }}
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "rgba(0,0,0,0.15)",
                color: "var(--text)",
                fontFamily: "var(--mono)",
                fontSize: 12,
              }}
              title="Role filter"
            >
              <option value="ALL">role: all</option>
              <option value="MISSING">role: missing</option>
              <option value="MAIN_PATH_GATE">role: MAIN_PATH_GATE</option>
              <option value="OPTIONAL_REWARD">role: OPTIONAL_REWARD</option>
              <option value="SHORTCUT">role: SHORTCUT</option>
              <option value="FORESHADOW">role: FORESHADOW</option>
            </select>

            <label
              className="muted"
              style={{ fontSize: 12, display: "flex", gap: 6 }}
            >
              <input
                type="checkbox"
                checked={onlyWithRuleHits}
                onChange={(e) => setOnlyWithRuleHits(e.target.checked)}
              />
              only rule hits
            </label>

            <div className="muted" style={{ fontSize: 12, textAlign: "right" }}>
              showing {visibleRows.length} / {rows.length}
            </div>
          </div>

          {/* Summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div className="circuitCard">
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                Role Counts
              </div>

              {!roleCounts ? (
                <div className="muted">No roleCounts.</div>
              ) : (
                <div
                  className="mono"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div className="muted">MAIN_PATH_GATE</div>
                    <div>{roleCounts.MAIN_PATH_GATE ?? 0}</div>
                  </div>
                  <div>
                    <div className="muted">OPTIONAL_REWARD</div>
                    <div>{roleCounts.OPTIONAL_REWARD ?? 0}</div>
                  </div>
                  <div>
                    <div className="muted">SHORTCUT</div>
                    <div>{roleCounts.SHORTCUT ?? 0}</div>
                  </div>
                  <div>
                    <div className="muted">FORESHADOW</div>
                    <div>{roleCounts.FORESHADOW ?? 0}</div>
                  </div>
                  <div style={{ gridColumn: "1 / span 2" }}>
                    <div className="muted">roleMissingCount</div>
                    <div>{roleMissingCount}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="circuitCard">
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                Rule Counts (non-zero)
              </div>

              {summaryRuleList.length === 0 ? (
                <div className="muted">No rule hits.</div>
              ) : (
                <div
                  style={{
                    maxHeight: 140,
                    overflow: "auto",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                  }}
                >
                  {summaryRuleList.map(([rid, n]) => (
                    <div
                      key={rid}
                      className="mono"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        fontSize: 12,
                      }}
                    >
                      <span>{rid}</span>
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main grid: list + inspector */}
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
              <div className="circuitHeader">
                <div style={{ fontWeight: 700, fontSize: 12 }}>Role List</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  sort:
                  <button
                    onClick={() => toggleSort("depthN")}
                    style={{ marginLeft: 6 }}
                    className="maze-btn"
                    title="Sort by depthN"
                  >
                    depthN
                  </button>
                  <button
                    onClick={() => toggleSort("topoDepth")}
                    style={{ marginLeft: 6 }}
                    className="maze-btn"
                    title="Sort by topoDepth"
                  >
                    topo
                  </button>
                  <button
                    onClick={() => toggleSort("signalDepCount")}
                    style={{ marginLeft: 6 }}
                    className="maze-btn"
                    title="Sort by SIGNAL deps"
                  >
                    sig
                  </button>
                  <button
                    onClick={() => toggleSort("circuitIndex")}
                    style={{ marginLeft: 6 }}
                    className="maze-btn"
                    title="Sort by circuit index"
                  >
                    idx
                  </button>
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
                {visibleRows.length === 0 ? (
                  <div style={{ padding: 10 }} className="muted">
                    No circuits match filters.
                  </div>
                ) : null}

                {visibleRows.map((r) => {
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
                      <span style={{ display: "inline-block", width: 26 }}>
                        {glyphFlags(r)}
                      </span>
                      <span style={{ display: "inline-block", width: 92 }}>
                        {roleLabel(r.role)}
                      </span>
                      <span style={{ display: "inline-block", width: 70 }}>
                        dN:{fmtDepthN(r.depthN)}
                      </span>
                      <span style={{ display: "inline-block", width: 66 }}>
                        topo:{r.topoDepth}
                      </span>
                      <span style={{ display: "inline-block", width: 56 }}>
                        sig:{r.signalDepCount}
                      </span>
                      <span style={{ display: "inline-block", width: 50 }}>
                        hits:{pad2(r.ruleHitCount)}
                      </span>
                      <span>idx:{r.circuitIndex}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inspector */}
            <div className="circuitCard">
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                Role Inspector
              </div>

              {!selectedRow ? (
                <div className="muted">Select a circuit to inspect.</div>
              ) : (
                <>
                  <div className="circuitRow">
                    <div className="circuitLabel">Circuit</div>
                    <div className="circuitItems mono">
                      idx:{selectedRow.circuitIndex} role:
                      {roleLabel(selectedRow.role)}
                    </div>
                  </div>

                  <div className="circuitRow">
                    <div className="circuitLabel">Depth</div>
                    <div className="circuitItems mono">
                      roomDepth:{selectedRow.roomDepth ?? "—"} depthN:
                      {fmtDepthN(selectedRow.depthN)} onMain:
                      {fmtBool(selectedRow.onMainPath)}
                    </div>
                  </div>

                  <div className="circuitRow">
                    <div className="circuitLabel">Topology</div>
                    <div className="circuitItems mono">
                      topoDepth:{selectedRow.topoDepth} sigDeps:
                      {selectedRow.signalDepCount} flags:
                      {glyphFlags(selectedRow)}
                    </div>
                  </div>

                  <div className="circuitRow">
                    <div className="circuitLabel">Anchor</div>
                    <div className="circuitItems mono">
                      anchorRoomId:{selectedRow.anchorRoomId ?? "—"}
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div
                    style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}
                  >
                    Rule hits ({selectedHits.length})
                  </div>

                  {selectedHits.length === 0 ? (
                    <div className="muted">No rule hits for this circuit.</div>
                  ) : (
                    <div
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8,
                        overflow: "auto",
                        maxHeight: 160,
                      }}
                    >
                      {selectedHits.map((h: any, i: any) => (
                        <div
                          key={`${h.ruleId}:${h.code}:${i}`}
                          className="mono"
                          style={{
                            padding: "6px 10px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            fontSize: 12,
                            lineHeight: 1.35,
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700 }}>{h.ruleId}</span>{" "}
                            <span className="muted">({h.code})</span>
                          </div>
                          {h.detail ? (
                            <div className="muted" style={{ marginTop: 2 }}>
                              {h.detail}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ height: 10 }} />

                  <div
                    style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}
                  >
                    Circuit definition (read-only)
                  </div>

                  {!selectedCircuitDef ? (
                    <div className="muted">
                      No circuit def found at this index.
                    </div>
                  ) : (
                    <div
                      className="mono"
                      style={{ fontSize: 12, lineHeight: 1.4 }}
                    >
                      <div className="circuitRow">
                        <div className="circuitLabel">Triggers</div>
                        <div className="circuitItems mono">
                          {selectedCircuitDef.triggers?.length ? (
                            selectedCircuitDef.triggers.map((t, i) => (
                              <span key={i}>
                                {t.kind}:{t.refId}
                                {i < selectedCircuitDef.triggers.length - 1
                                  ? ", "
                                  : ""}
                              </span>
                            ))
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </div>
                      </div>

                      <div className="circuitRow">
                        <div className="circuitLabel">Targets</div>
                        <div className="circuitItems mono">
                          {selectedCircuitDef.targets?.length ? (
                            selectedCircuitDef.targets.map((t, i) => (
                              <span key={i}>
                                {t.kind}:{t.refId}→{t.effect}
                                {i < selectedCircuitDef.targets.length - 1
                                  ? ", "
                                  : ""}
                              </span>
                            ))
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {showRawJson ? (
                    <details style={{ marginTop: 10 }}>
                      <summary className="muted">
                        Raw role diagnostics JSON
                      </summary>
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
          </div>
        </>
      )}
    </div>
  );
}
