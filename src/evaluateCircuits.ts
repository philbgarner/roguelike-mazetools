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

export type CircuitEvalResult = {
  next: DungeonRuntimeState;
  debug: CircuitEvalDebug;
};

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
function topoSortCircuitsWithMeta(circuits: CircuitDef[]): {
  order: CircuitDef[];
  topoDepthById: Record<number, number>;
  depsById: Record<number, number>;
  inCycleById: Record<number, boolean>;
} {
  const byId = new Map<number, CircuitDef>();
  for (const c of circuits) byId.set(c.id, c);

  const indeg = new Map<number, number>();
  const out = new Map<number, Set<number>>();
  const depsById: Record<number, number> = {};
  const topoDepthById: Record<number, number> = {};
  const inCycleById: Record<number, boolean> = {};

  for (const c of circuits) {
    indeg.set(c.id, 0);
    out.set(c.id, new Set());
    depsById[c.id] = 0;
    topoDepthById[c.id] = 0;
    inCycleById[c.id] = false;
  }

  // Build graph + deps count
  for (const c of circuits) {
    for (const t of c.triggers) {
      if (t.kind !== "SIGNAL") continue;
      const upstreamId = t.refId | 0;
      if (!byId.has(upstreamId)) continue;

      depsById[c.id]++;

      const s = out.get(upstreamId)!;
      if (!s.has(c.id)) {
        s.add(c.id);
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
        let i = 0;
        while (i < q.length && q[i] < v) i++;
        q.splice(i, 0, v);
      }
    }
  }

  // Detect cycles: nodes not output by Kahn are in (or downstream of) cycles.
  if (orderIds.length !== circuits.length) {
    const seen = new Set(orderIds);
    const remaining = circuits
      .map((c) => c.id)
      .filter((id) => !seen.has(id))
      .sort((a, b) => a - b);

    for (const id of remaining) inCycleById[id] = true;

    // best-effort append
    orderIds.push(...remaining);
  }

  const order: CircuitDef[] = [];
  for (const id of orderIds) {
    const c = byId.get(id);
    if (c) order.push(c);
  }

  return { order, topoDepthById, depsById, inCycleById };
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

  // Determine evaluation order based on SIGNAL deps (same-tick chaining).
  const { order, topoDepthById, depsById, inCycleById } =
    topoSortCircuitsWithMeta(list);

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
      evalOrder: orderIndex++,
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

  return { next, debug };
}
