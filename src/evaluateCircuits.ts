// src/evaluateCircuits.ts
//
// Milestone 3 — Phase 2
// Data-driven circuit evaluation pass.
//
// The evaluator is pure: it takes the current runtime state + content metadata
// and returns the next runtime state after computing circuit activeness and
// applying targets.
//
// Milestone 4 — Circuit Chaining v1 (patch):
// - Add SIGNAL triggers that can reference other circuits.
// - Evaluate circuits in a deterministic dependency order (topo sort).
// - If cycles exist, fall back to stable id order for the remaining circuits
//   (best-effort; never abort).

import type {
  CircuitDef,
  CircuitLogicType,
  CircuitBehaviorMode,
  CircuitTargetEffect,
  DoorKind,
  HazardType,
} from "./mazeGen";
import type { DungeonRuntimeState } from "./dungeonState";
import {
  ensureDoor,
  ensureHazard,
  ensureSecret,
  ensurePlate,
} from "./dungeonState";

export type CircuitEvalDebug = Record<
  number,
  {
    satisfied: boolean;
    satisfiedCount: number;
    active: boolean;

    // Milestone 4: chaining diagnostics
    deps: number; // number of SIGNAL triggers
    topoDepth: number; // prerequisite chain depth
    inCycle: boolean; // true if part of a cycle
    evalOrder: number; // evaluation order index
  }
>;

export type CircuitEvalDiagnostics = {
  // Echo stable inputs for traceability (optional)
  seedUsed?: number;
  width?: number;
  height?: number;

  // How the evaluator saw the dependency graph
  circuitCount: number;
  signalEdgeCount: number;

  // Order + per-circuit detail
  evalOrder: number[]; // list of circuitIndex in evaluation sequence
  perCircuit: CircuitChainingDiag[];

  // Cycle reporting (SCC groups)
  cycles: CycleGroupDiag[];

  // Summary stats (batch-friendly)
  summary: {
    maxTopoDepth: number;
    avgTopoDepth: number;
    circuitsWithSignalDeps: number;
    cycleCircuitCount: number;
    blockedByCycleCount: number;
  };
};

export type CircuitChainingDiag = {
  // Stable identity (match meta.circuits index order)
  circuitIndex: number;

  // Topological evaluation order position (only among evaluated circuits)
  evalOrderIndex: number;

  // SIGNAL prerequisites (count + list for UI / batch)
  signalDepCount: number;
  signalDeps: SignalRef[]; // incoming deps (what must be computed before me)

  // "Difficulty scalar" for Phase 2/3: longest prerequisite chain length
  // 0 means "no prerequisites"
  topoDepth: number;

  // Graph hygiene / debugging
  participatesInCycle: boolean; // true if in a detected cycle SCC
  blockedByCycle: boolean; // true if not in cycle but depends on it

  // Optional: for richer debugging/visualization
  signalsProduced?: SignalRef[]; // signals this circuit can emit (declared)
  signalsConsumed?: SignalRef[]; // signals this circuit actually read this tick (if you track it)
};

export type SignalRef = {
  // Your existing SIGNAL trigger uses a name and a mode.
  // Make the ref explicit + stable for display and aggregation.
  key: string; // canonical string key (see below)
  fromCircuitIndex: number; // who produces the signal
  name: "ACTIVE" | "SATISFIED" | "SATISFIED_RISE";
};

export type CycleGroupDiag = {
  cycleIndex: number;
  members: number[]; // circuitIndex list
  // Optional: how many outbound edges this cycle has (useful in debugging)
  outboundTo: number[];
};

export type CircuitEvalResult = {
  next: DungeonRuntimeState;
  debug: CircuitEvalDebug;
  diagnostics?: CircuitEvalDiagnostics; // NEW (optional for backwards compat)
};

// Example: "sig:12:SATISFIED"
export function makeSignalKey(
  fromCircuitIndex: number,
  name: SignalRef["name"],
) {
  return `sig:${fromCircuitIndex}:${name}`;
}

function cloneState<S>(s: S): S {
  return JSON.parse(JSON.stringify(s)) as S;
}

/**
 * Deterministic topo sort of circuits by SIGNAL dependencies.
 *
 * Edge: A -> B if B has trigger { kind:"SIGNAL", refId:A }
 *
 * Returns best-effort order; if cycles exist, remaining nodes are appended
 * in stable id order. (Never abort.)
 */
type SignalName = "ACTIVE" | "SATISFIED" | "SATISFIED_RISE";

function topoSortCircuitsWithMeta(circuits: CircuitDef[]): {
  order: CircuitDef[];
  orderIds: number[];
  evalOrderIndexById: Record<number, number>;

  topoDepthById: Record<number, number>;

  // NOTE: keep your existing meaning: number of SIGNAL triggers (may include duplicates)
  depsById: Record<number, number>;

  // NEW: unique SIGNAL dependencies, for diagnostics/UI
  signalDepsById: Record<number, SignalRef[]>;
  signalEdgeCount: number;

  // NEW: accurate cycle membership vs downstream-blocked
  inCycleById: Record<number, boolean>;
  blockedByCycleById: Record<number, boolean>;

  cycleGroups: { members: number[]; outboundTo: number[] }[];
} {
  const byId = new Map<number, CircuitDef>();
  for (const c of circuits) byId.set(c.id, c);

  const indeg = new Map<number, number>();
  const out = new Map<number, Set<number>>();

  const depsById: Record<number, number> = {};
  const topoDepthById: Record<number, number> = {};
  const inCycleById: Record<number, boolean> = {};
  const blockedByCycleById: Record<number, boolean> = {};

  const signalDepsById: Record<number, SignalRef[]> = {};
  let signalEdgeCount = 0;

  function pushCycleGroup(membersRaw: number[]) {
    const members = membersRaw.slice().sort((a, b) => a - b);
    const memberSet = new Set(members);

    const outboundSet = new Set<number>();
    for (const u of members) {
      const nbrs = out.get(u);
      if (!nbrs) continue;
      for (const v of nbrs) {
        if (!memberSet.has(v)) outboundSet.add(v);
      }
    }

    const outboundTo = Array.from(outboundSet).sort((a, b) => a - b);
    cycleGroups.push({ members, outboundTo });

    for (const id of members) {
      inCycleById[id] = true;
      blockedByCycleById[id] = false;
    }
  }

  for (const c of circuits) {
    indeg.set(c.id, 0);
    out.set(c.id, new Set());

    depsById[c.id] = 0;
    topoDepthById[c.id] = 0;
    inCycleById[c.id] = false;
    blockedByCycleById[c.id] = false;

    signalDepsById[c.id] = [];
  }

  // Build graph + deps count
  for (const c of circuits) {
    for (const t of c.triggers) {
      if (t.kind !== "SIGNAL") continue;
      const upstreamId = t.refId | 0;
      if (!byId.has(upstreamId)) continue;

      // Old behavior preserved: counts raw SIGNAL triggers
      depsById[c.id]++;

      // Track signal name for diagnostics
      const name = (t.signal?.name ?? "ACTIVE") as SignalName;
      signalDepsById[c.id].push({
        key: makeSignalKey(upstreamId, name),
        fromCircuitIndex: upstreamId,
        name,
      });

      // Unique edge for topo ordering
      const s = out.get(upstreamId)!;
      if (!s.has(c.id)) {
        s.add(c.id);
        signalEdgeCount++;
        indeg.set(c.id, (indeg.get(c.id) || 0) + 1);
      }
    }
  }

  // Kahn queue (stable by id)
  const q: number[] = [];
  for (const [id, d] of indeg.entries()) {
    if (d === 0) q.push(id);
  }
  q.sort((a, b) => a - b);

  const orderIds: number[] = [];

  while (q.length) {
    const id = q.shift()!;
    orderIds.push(id);

    const nbrs = Array.from(out.get(id)!.values()).sort((a, b) => a - b);
    for (const v of nbrs) {
      // Depth propagation: depth[v] = max(depth[v], depth[id] + 1)
      topoDepthById[v] = Math.max(
        topoDepthById[v] || 0,
        (topoDepthById[id] || 0) + 1,
      );

      const nd = (indeg.get(v) || 0) - 1;
      indeg.set(v, nd);
      if (nd === 0) {
        // stable insertion into sorted queue
        let i = 0;
        while (i < q.length && q[i] < v) i++;
        q.splice(i, 0, v);
      }
    }
  }

  // --- Cycle handling: compute SCCs among leftover nodes only ---
  const allIds = circuits.map((c) => c.id).sort((a, b) => a - b);
  const seen = new Set(orderIds);
  const leftover = allIds.filter((id) => !seen.has(id)); // deterministic order
  const leftoverSet = new Set(leftover);

  // Default: any leftover is blocked by cycle until proven to be actual cycle member.
  for (const id of leftover) blockedByCycleById[id] = true;

  const cycleGroups: { members: number[]; outboundTo: number[] }[] = [];

  if (leftover.length) {
    // Tarjan SCC on induced subgraph (leftover nodes)
    const sccs = tarjanScc(leftover, (u) => {
      const nbrs = out.get(u);
      if (!nbrs) return [];
      // induced subgraph edges only
      return Array.from(nbrs).filter((v) => leftoverSet.has(v));
    });

    for (const group of sccs) {
      if (group.length > 1) {
        pushCycleGroup(group);
      } else {
        const id = group[0];
        const hasSelfLoop = out.get(id)?.has(id) ?? false;
        if (hasSelfLoop) pushCycleGroup([id]);
      }
    }

    // best-effort append leftovers (stable)
    orderIds.push(...leftover);
  }

  const evalOrderIndexById: Record<number, number> = {};
  for (let i = 0; i < orderIds.length; i++) evalOrderIndexById[orderIds[i]] = i;

  const order: CircuitDef[] = [];
  for (const id of orderIds) {
    const c = byId.get(id);
    if (c) order.push(c);
  }

  // Optional: stabilize signalDepsById ordering (nice for UI/batch)
  for (const id of allIds) {
    signalDepsById[id].sort((a, b) => {
      if (a.fromCircuitIndex !== b.fromCircuitIndex)
        return a.fromCircuitIndex - b.fromCircuitIndex;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  return {
    order,
    orderIds,
    evalOrderIndexById,

    topoDepthById,
    depsById,

    signalDepsById,
    signalEdgeCount,

    inCycleById,
    blockedByCycleById,

    cycleGroups,
  };
}

// Tarjan SCC (deterministic given deterministic successor ordering)
function tarjanScc(
  nodes: number[],
  successors: (u: number) => number[],
): number[][] {
  let index = 0;
  const stack: number[] = [];
  const onStack = new Set<number>();
  const idx = new Map<number, number>();
  const low = new Map<number, number>();
  const result: number[][] = [];

  // Deterministic node iteration
  const nodesSorted = nodes.slice().sort((a, b) => a - b);

  function strongconnect(v: number) {
    idx.set(v, index);
    low.set(v, index);
    index++;

    stack.push(v);
    onStack.add(v);

    const succs = successors(v)
      .slice()
      .sort((a, b) => a - b);
    for (const w of succs) {
      if (!idx.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }

    if (low.get(v) === idx.get(v)) {
      const scc: number[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      // Keep SCC members deterministic
      scc.sort((a, b) => a - b);
      result.push(scc);
    }
  }

  for (const v of nodesSorted) {
    if (!idx.has(v)) strongconnect(v);
  }

  // Deterministic SCC list ordering (by smallest member)
  result.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  return result;
}

function computeSatisfied(
  logicType: CircuitLogicType,
  threshold: number,
  totalTriggers: number,
  satisfiedCount: number,
): boolean {
  switch (logicType) {
    case "OR":
      return satisfiedCount >= 1;
    case "AND":
      return totalTriggers > 0 ? satisfiedCount === totalTriggers : false;
    case "THRESHOLD":
      return satisfiedCount >= Math.max(1, threshold | 0);
    default:
      return false;
  }
}

function nextActiveFromBehavior(
  mode: CircuitBehaviorMode,
  prevActive: boolean,
  prevSatisfied: boolean,
  nowSatisfied: boolean,
): boolean {
  switch (mode) {
    case "MOMENTARY":
      return nowSatisfied;
    case "PERSISTENT":
      return prevActive || nowSatisfied;
    case "TOGGLE": {
      const risingEdge = !prevSatisfied && nowSatisfied;
      return risingEdge ? !prevActive : prevActive;
    }
    default:
      return nowSatisfied;
  }
}

/**
 * SIGNAL trigger semantics (v1):
 * - Default: upstream circuit's ACTIVE (level)
 *
 * Optional (future-proof) extension:
 * If you extend CircuitTriggerRef to include `signal?: { name?: string }`,
 * we honor:
 * - "ACTIVE"         => upstream.active
 * - "SATISFIED"      => upstream.lastSatisfied
 * - "SATISFIED_RISE" => rising edge of upstream.lastSatisfied
 */
function isSignalSatisfied(
  current: DungeonRuntimeState,
  next: DungeonRuntimeState,
  t: CircuitDef["triggers"][number],
): boolean {
  const upstreamId = t.refId | 0;

  const prevUp = current.circuits?.[upstreamId] ?? {
    active: false,
    lastSatisfied: false,
    lastSatisfiedCount: 0,
  };

  const nowUp = next.circuits?.[upstreamId] ?? prevUp;

  const name: string = t.signal?.name || "ACTIVE";

  switch (name) {
    case "SATISFIED":
      return !!nowUp.lastSatisfied;
    case "SATISFIED_RISE":
      return !prevUp.lastSatisfied && !!nowUp.lastSatisfied;
    case "ACTIVE":
    default:
      return !!nowUp.active;
  }
}

function isTriggerSatisfied(
  current: DungeonRuntimeState,
  next: DungeonRuntimeState,
  t: CircuitDef["triggers"][number],
): boolean {
  switch (t.kind) {
    case "KEY": {
      return !!current.keys[t.refId]?.collected;
    }
    case "LEVER": {
      return !!current.levers[t.refId]?.toggled;
    }
    case "PLATE": {
      // Plates are runtime state; ensure resilience if missing.
      if (!current.plates?.[t.refId]) ensurePlate(current, t.refId);
      return !!current.plates[t.refId]?.pressed;
    }
    case "COMBAT_CLEAR": {
      // not implemented yet: treat as false
      return false;
    }
    case "INTERACT": {
      // not implemented yet: treat as false
      return false;
    }
    case "SIGNAL": {
      return isSignalSatisfied(current, next, t);
    }
    default:
      return false;
  }
}

function applyTarget(
  state: DungeonRuntimeState,
  target: CircuitDef["targets"][number],
  effect: CircuitTargetEffect,
): void {
  // Target kind determines which state bucket it lives in.
  // Effects:
  // - OPEN/CLOSE for DOOR
  // - ENABLE/DISABLE for HAZARD
  // - REVEAL/HIDE for HIDDEN (HIDE not used yet)
  // - TOGGLE is applied using edge logic outside

  switch (target.kind) {
    case "DOOR": {
      const doorId = target.refId;

      // If missing (should be rare), best-effort default to Locked (1).
      const existing = state.doors?.[doorId];
      const kind: DoorKind = existing?.kind ?? (1 as DoorKind);
      ensureDoor(state, doorId, kind);

      if (effect === "OPEN") state.doors[doorId].isOpen = true;
      if (effect === "CLOSE") state.doors[doorId].isOpen = false;
      if (effect === "TOGGLE")
        state.doors[doorId].isOpen = !state.doors[doorId].isOpen;
      break;
    }

    case "HAZARD": {
      const hzId = target.refId;

      // If missing (should be rare), best-effort default to lava (1).
      const existing = state.hazards?.[hzId];
      const hzType: HazardType = existing?.hazardType ?? (1 as HazardType);
      ensureHazard(state, hzId, hzType);

      if (effect === "ENABLE") state.hazards[hzId].enabled = true;
      if (effect === "DISABLE") state.hazards[hzId].enabled = false;
      if (effect === "TOGGLE")
        state.hazards[hzId].enabled = !state.hazards[hzId].enabled;
      break;
    }

    case "HIDDEN": {
      const secId = target.refId;
      ensureSecret(state, secId);

      if (effect === "REVEAL") state.secrets[secId].revealed = true;
      if (effect === "HIDE") state.secrets[secId].revealed = false;
      if (effect === "TOGGLE")
        state.secrets[secId].revealed = !state.secrets[secId].revealed;
      break;
    }

    default:
      break;
  }
}

export function evaluateCircuits(
  current: DungeonRuntimeState,
  circuits: CircuitDef[],
): CircuitEvalResult {
  const list = Array.isArray(circuits) ? circuits : [];

  const next = cloneState(current);
  const debug: CircuitEvalDebug = {};

  // Ensure circuits bucket exists
  if (!next.circuits) next.circuits = {};
  if (!current.circuits) {
    // should not happen in normal flow, but keep best-effort
    (current as any).circuits = {};
  }

  const {
    order,
    orderIds,
    evalOrderIndexById,
    topoDepthById,
    depsById,
    signalDepsById,
    signalEdgeCount,
    inCycleById,
    blockedByCycleById,
    cycleGroups,
  } = topoSortCircuitsWithMeta(list);

  // ---- Build chaining-aware diagnostics (no gameplay impact)
  const circuitIdsStable = list
    .map((c) => c.id)
    .slice()
    .sort((a, b) => a - b);

  let sumDepth = 0;
  let maxTopoDepth = 0;
  let circuitsWithSignalDeps = 0;
  let cycleCircuitCount = 0;
  let blockedByCycleCount = 0;

  const perCircuit: CircuitChainingDiag[] = circuitIdsStable.map((id) => {
    const topoDepth = topoDepthById[id] ?? 0;
    const signalDeps = signalDepsById[id] ?? [];
    const signalDepCount = signalDeps.length;

    const participatesInCycle = !!inCycleById[id];
    const blockedByCycle = !!blockedByCycleById[id] && !participatesInCycle;

    sumDepth += topoDepth;
    if (topoDepth > maxTopoDepth) maxTopoDepth = topoDepth;
    if (signalDepCount > 0) circuitsWithSignalDeps++;
    if (participatesInCycle) cycleCircuitCount++;
    if (blockedByCycle) blockedByCycleCount++;

    return {
      circuitIndex: id,
      evalOrderIndex: evalOrderIndexById[id] ?? -1,
      signalDepCount,
      signalDeps,
      topoDepth,
      participatesInCycle,
      blockedByCycle,
    };
  });

  const avgTopoDepth = perCircuit.length ? sumDepth / perCircuit.length : 0;

  const cycles: CycleGroupDiag[] = cycleGroups.map((g, i) => ({
    cycleIndex: i,
    members: g.members.slice(), // already sorted
    outboundTo: g.outboundTo.slice(), // already sorted
  }));

  const diagnostics: CircuitEvalDiagnostics = {
    circuitCount: list.length,
    signalEdgeCount,
    evalOrder: orderIds.slice(),
    perCircuit,
    cycles,
    summary: {
      maxTopoDepth,
      avgTopoDepth,
      circuitsWithSignalDeps,
      cycleCircuitCount,
      blockedByCycleCount,
    },
  };

  let orderIndex = 0;
  // 1) compute satisfied + active for each circuit (dependency order)
  for (const c of order) {
    const prev = current.circuits[c.id] ?? {
      active: false,
      lastSatisfied: false,
      lastSatisfiedCount: 0,
    };

    const total = c.triggers.length;
    let satisfiedCount = 0;
    for (const t of c.triggers) {
      if (isTriggerSatisfied(current, next, t)) satisfiedCount++;
    }

    let satisfied = computeSatisfied(
      c.logic.type,
      c.logic.type === "THRESHOLD" ? c.logic.threshold || 0 : 1,
      total,
      satisfiedCount,
    );

    // support inversion
    if (c.behavior.invert) satisfied = !satisfied;

    const active = nextActiveFromBehavior(
      c.behavior.mode,
      prev.active,
      prev.lastSatisfied,
      satisfied,
    );

    next.circuits[c.id] = {
      active,
      lastSatisfied: satisfied,
      lastSatisfiedCount: satisfiedCount,
    };

    debug[c.id] = {
      satisfied,
      satisfiedCount,
      active,
      deps: depsById[c.id] || 0,
      topoDepth: topoDepthById[c.id] || 0,
      inCycle: !!inCycleById[c.id],
      evalOrder: evalOrderIndexById[c.id] ?? orderIndex++,
    };
  }

  // 2) apply targets (preserve existing behavior by iterating original list)
  for (const c of list) {
    const prev = current.circuits[c.id] ?? {
      active: false,
      lastSatisfied: false,
      lastSatisfiedCount: 0,
    };
    const now = next.circuits[c.id] ?? {
      active: false,
      lastSatisfied: false,
      lastSatisfiedCount: 0,
    };

    const satisfiedRisingEdge = !prev.lastSatisfied && now.lastSatisfied;

    for (const t of c.targets) {
      if (t.effect === "TOGGLE") {
        if (satisfiedRisingEdge) {
          applyTarget(next, t, "TOGGLE");
        }
      } else {
        if (now.active) {
          applyTarget(next, t, t.effect);
        }
      }
    }
  }

  return { next, debug, diagnostics };
}
