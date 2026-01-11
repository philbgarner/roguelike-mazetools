// src/evaluateCircuits.ts
//
// Milestone 3 — Phase 2
// Data-driven circuit evaluation pass.
//
// The evaluator is pure: it takes the current runtime state + content metadata
// and returns the next runtime state after computing circuit activeness and
// applying targets.

import type {
  CircuitDef,
  CircuitLogicType,
  CircuitBehaviorMode,
  CircuitTargetEffect,
  DoorKind,
  HazardType,
} from "./mazeGen";
import type { DungeonRuntimeState } from "./dungeonState";
import { ensureDoor, ensureHazard, ensureSecret } from "./dungeonState";

export type CircuitEvalDebug = Record<
  number,
  {
    satisfied: boolean;
    satisfiedCount: number;
    active: boolean;
  }
>;

export type CircuitEvalResult = {
  next: DungeonRuntimeState;
  debug: CircuitEvalDebug;
};

function cloneState<S>(s: S): S {
  return JSON.parse(JSON.stringify(s)) as S;
}

function isTriggerSatisfied(
  state: DungeonRuntimeState,
  t: CircuitDef["triggers"][number],
): boolean {
  switch (t.kind) {
    case "KEY": {
      return !!state.keys[t.refId]?.collected;
    }
    case "LEVER": {
      return !!state.levers[t.refId]?.toggled;
    }
    case "PLATE": {
      // not implemented yet: treat as false
      return false;
    }
    case "COMBAT_CLEAR": {
      // not implemented yet: treat as false
      return false;
    }
    case "INTERACT": {
      // not implemented yet: treat as false
      return false;
    }
    default:
      return false;
  }
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
      // We don’t know DoorKind here unless you decide to embed it on targets;
      // best-effort keep existing, otherwise assume Locked.
      const existing = state.doors[doorId];
      const kind: DoorKind = existing?.kind ?? "Locked";
      ensureDoor(state, doorId, kind);

      if (effect === "OPEN") state.doors[doorId].isOpen = true;
      if (effect === "CLOSE") state.doors[doorId].isOpen = false;
      if (effect === "TOGGLE")
        state.doors[doorId].isOpen = !state.doors[doorId].isOpen;
      break;
    }

    case "HAZARD": {
      const hzId = target.refId;
      const existing = state.hazards[hzId];
      const hzType: HazardType = existing?.hazardType ?? 1; // default lava
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

  // 1) compute satisfied + active for each circuit
  for (const c of list) {
    const prev = current.circuits[c.id] ?? {
      active: false,
      lastSatisfied: false,
      lastSatisfiedCount: 0,
    };

    const total = c.triggers.length;
    let satisfiedCount = 0;
    for (const t of c.triggers) {
      if (isTriggerSatisfied(current, t)) satisfiedCount++;
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

    debug[c.id] = { satisfied, satisfiedCount, active };
  }

  // 2) apply targets
  for (const c of circuits) {
    const prev = current.circuits[c.id] ?? {
      active: false,
      lastSatisfied: false,
      lastSatisfiedCount: 0,
    };
    const now = next.circuits[c.id];

    const satisfiedRisingEdge = !prev.lastSatisfied && now.lastSatisfied;

    // Apply effects:
    // - If circuit is active: apply OPEN/CLOSE/ENABLE/DISABLE/REVEAL/HIDE.
    // - If effect is TOGGLE: apply only on rising edge of satisfied.
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
