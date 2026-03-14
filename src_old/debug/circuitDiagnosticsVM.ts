// src/debug/circuitDiagnosticsVM.ts
//
// Milestone 4 — Phase 1 (observability only):
// Pure selectors / view-model builders for CircuitEvalDiagnostics.
// No gameplay logic. No thresholds. No "difficulty" coloring.
// The UI should be able to render entirely from these VMs.

import type { CircuitDef } from "../mazeGen";
import type {
  CircuitEvalDiagnostics,
  CircuitChainingDiag,
  CycleGroupDiag,
  SignalRef,
} from "../evaluateCircuits";

// -----------------------------
// Public VM Types
// -----------------------------

export type CircuitListRowVM = {
  circuitIndex: number;
  circuitId: number;

  evalOrderIndex: number; // 0..N-1 (order within evalOrder)
  topoDepth: number;

  signalDepCount: number;
  signalDeps: SignalRef[];

  participatesInCycle: boolean;
  blockedByCycle: boolean;
};

export type CircuitGlobalMetricsVM = {
  circuitCount: number;
  signalEdgeCount: number;

  maxTopoDepth: number;
  avgTopoDepth: number;

  circuitsWithSignalDeps: number;
  pctWithSignalDeps: number; // 0..1

  cycleGroupCount: number;
  cycleCircuitCount: number;

  blockedByCycleCount: number;

  largestCycleSize: number;
};

export type CircuitInspectorVM = {
  circuitIndex: number;
  circuitId: number;

  // From diagnostics
  evalOrderIndex: number;
  topoDepth: number;
  signalDepCount: number;
  signalDeps: SignalRef[];
  participatesInCycle: boolean;
  blockedByCycle: boolean;

  // From definition (still observational)
  def: CircuitDef;

  // Cycle info (if any)
  cycle: CycleGroupDiag | null;

  // Helpful for “jump to dep” UI
  signalDepCircuitIndexes: number[];
};

export type CircuitDiagFilters = {
  search?: string; // matches `idx:` or `id:` (substring)
  onlySignal?: boolean;
  onlyCycles?: boolean;
  hideDepth0?: boolean;
};

export type CircuitDiagSort =
  | { kind: "evalOrder"; dir?: "asc" | "desc" }
  | { kind: "topoDepth"; dir?: "asc" | "desc" }
  | { kind: "signalDepCount"; dir?: "asc" | "desc" }
  | { kind: "circuitIndex"; dir?: "asc" | "desc" }
  | { kind: "circuitId"; dir?: "asc" | "desc" };

// -----------------------------
// Helpers
// -----------------------------

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function dirMul(dir: "asc" | "desc" | undefined) {
  return dir === "desc" ? -1 : 1;
}

function normalizeSearch(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function matchesSearch(row: CircuitListRowVM, q: string): boolean {
  if (!q) return true;
  // Simple substring match over a stable token set
  const hay = `idx:${row.circuitIndex} id:${row.circuitId}`.toLowerCase();
  return hay.includes(q);
}

export function buildCycleIndexByCircuitIndex(
  diagnostics: CircuitEvalDiagnostics | null | undefined,
): Map<number, CycleGroupDiag> {
  const map = new Map<number, CycleGroupDiag>();
  const cycles = diagnostics?.cycles ?? [];
  for (const c of cycles) {
    for (const idx of c.members) {
      map.set(idx, c);
    }
  }
  return map;
}

export function buildDiagByCircuitIndex(
  diagnostics: CircuitEvalDiagnostics | null | undefined,
): Map<number, CircuitChainingDiag> {
  const map = new Map<number, CircuitChainingDiag>();
  const per = diagnostics?.perCircuit ?? [];
  for (const d of per) map.set(d.circuitIndex, d);
  return map;
}

export function getGlyphFlags(
  row: Pick<CircuitListRowVM, "participatesInCycle" | "blockedByCycle">,
): string {
  const a = row.participatesInCycle ? "⟳" : "";
  const b = row.blockedByCycle ? "⊘" : "";
  return a + b || "◉";
}

// -----------------------------
// List Rows
// -----------------------------

export function buildCircuitListRows(
  circuits: CircuitDef[],
  diagnostics: CircuitEvalDiagnostics | null | undefined,
): CircuitListRowVM[] {
  if (!diagnostics) return [];

  // diagnostics.perCircuit is authoritative for order & metadata
  const rows: CircuitListRowVM[] = diagnostics.perCircuit.map((d) => {
    const def = circuits[d.circuitIndex];
    return {
      circuitIndex: d.circuitIndex,
      circuitId: def?.id ?? d.circuitIndex,

      evalOrderIndex: d.evalOrderIndex,
      topoDepth: d.topoDepth,

      signalDepCount: d.signalDepCount,
      signalDeps: d.signalDeps ?? [],

      participatesInCycle: d.participatesInCycle,
      blockedByCycle: d.blockedByCycle,
    };
  });

  // Default stable order: engine truth (evaluation order)
  rows.sort((a, b) => a.evalOrderIndex - b.evalOrderIndex);
  return rows;
}

export function filterCircuitRows(
  rows: CircuitListRowVM[],
  filters: CircuitDiagFilters | null | undefined,
): CircuitListRowVM[] {
  if (!filters) return rows;

  const q = normalizeSearch(filters.search);
  const onlySignal = !!filters.onlySignal;
  const onlyCycles = !!filters.onlyCycles;
  const hideDepth0 = !!filters.hideDepth0;

  return rows.filter((r) => {
    if (onlySignal && r.signalDepCount <= 0) return false;
    if (onlyCycles && !r.participatesInCycle && !r.blockedByCycle) return false;
    if (hideDepth0 && r.topoDepth === 0) return false;
    if (q && !matchesSearch(r, q)) return false;
    return true;
  });
}

export function sortCircuitRows(
  rows: CircuitListRowVM[],
  sort: CircuitDiagSort | null | undefined,
): CircuitListRowVM[] {
  const s = sort ?? { kind: "evalOrder", dir: "asc" as const };
  const mul = dirMul(s.dir);

  const copy = rows.slice();
  copy.sort((a, b) => {
    switch (s.kind) {
      case "evalOrder":
        return (a.evalOrderIndex - b.evalOrderIndex) * mul;
      case "topoDepth":
        return (
          (a.topoDepth - b.topoDepth) * mul ||
          a.evalOrderIndex - b.evalOrderIndex
        );
      case "signalDepCount":
        return (
          (a.signalDepCount - b.signalDepCount) * mul ||
          a.evalOrderIndex - b.evalOrderIndex
        );
      case "circuitIndex":
        return (a.circuitIndex - b.circuitIndex) * mul;
      case "circuitId":
        return (a.circuitId - b.circuitId) * mul;
      default:
        return (a.evalOrderIndex - b.evalOrderIndex) * mul;
    }
  });

  return copy;
}

export function buildVisibleCircuitRows(
  circuits: CircuitDef[],
  diagnostics: CircuitEvalDiagnostics | null | undefined,
  filters?: CircuitDiagFilters | null,
  sort?: CircuitDiagSort | null,
): CircuitListRowVM[] {
  const rows = buildCircuitListRows(circuits, diagnostics);
  const filtered = filterCircuitRows(rows, filters);
  return sortCircuitRows(filtered, sort);
}

// -----------------------------
// Global Metrics
// -----------------------------

export function computeGlobalCircuitMetrics(
  diagnostics: CircuitEvalDiagnostics | null | undefined,
): CircuitGlobalMetricsVM | null {
  if (!diagnostics) return null;

  const circuitCount =
    diagnostics.circuitCount ?? diagnostics.perCircuit.length;
  const signalEdgeCount = diagnostics.signalEdgeCount ?? 0;

  const sum = diagnostics.summary;

  const cycleGroupCount = diagnostics.cycles?.length ?? 0;

  let largestCycleSize = 0;
  for (const c of diagnostics.cycles ?? []) {
    if (c.members.length > largestCycleSize)
      largestCycleSize = c.members.length;
  }

  const circuitsWithSignalDeps = sum?.circuitsWithSignalDeps ?? 0;
  const pctWithSignalDeps =
    circuitCount > 0 ? clamp01(circuitsWithSignalDeps / circuitCount) : 0;

  return {
    circuitCount,
    signalEdgeCount,

    maxTopoDepth: sum?.maxTopoDepth ?? 0,
    avgTopoDepth: sum?.avgTopoDepth ?? 0,

    circuitsWithSignalDeps,
    pctWithSignalDeps,

    cycleGroupCount,
    cycleCircuitCount: sum?.cycleCircuitCount ?? 0,

    blockedByCycleCount: sum?.blockedByCycleCount ?? 0,

    largestCycleSize,
  };
}

// -----------------------------
// Inspector
// -----------------------------

export function buildCircuitInspectorVM(
  circuits: CircuitDef[],
  diagnostics: CircuitEvalDiagnostics | null | undefined,
  circuitIndex: number | null | undefined,
): CircuitInspectorVM | null {
  if (!diagnostics) return null;
  if (circuitIndex == null) return null;

  const def = circuits[circuitIndex];
  if (!def) return null;

  const diagByIdx = buildDiagByCircuitIndex(diagnostics);
  const d = diagByIdx.get(circuitIndex);
  if (!d) return null;

  const cycleByIdx = buildCycleIndexByCircuitIndex(diagnostics);
  const cycle = cycleByIdx.get(circuitIndex) ?? null;

  const signalDepCircuitIndexes = (d.signalDeps ?? []).map(
    (s) => s.fromCircuitIndex,
  );

  return {
    circuitIndex,
    circuitId: def.id,

    evalOrderIndex: d.evalOrderIndex,
    topoDepth: d.topoDepth,
    signalDepCount: d.signalDepCount,
    signalDeps: d.signalDeps ?? [],
    participatesInCycle: d.participatesInCycle,
    blockedByCycle: d.blockedByCycle,

    def,
    cycle,

    signalDepCircuitIndexes,
  };
}
