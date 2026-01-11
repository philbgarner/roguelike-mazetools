// src/dungeonState.ts
//
// Milestone 3 — Phase 2
// Runtime puzzle state model + action helpers.
//
// This layer is intentionally independent from generation.
// It is initialized from ContentOutputs.meta and then mutated by runtime actions.

import type {
  ContentOutputs,
  DoorKind,
  HazardType,
  CircuitDef,
} from "./mazeGen";

export type DoorRuntimeState = {
  kind: DoorKind;
  isOpen: boolean;
  // Optional: if you later want to support “opened forever”
  // (but circuit behavior already handles this)
  forcedOpen?: boolean;
};

export type KeyRuntimeState = {
  collected: boolean;
};

export type LeverRuntimeState = {
  toggled: boolean;
};

export type PlateRuntimeState = {
  pressed: boolean;
};

export type HazardRuntimeState = {
  hazardType: HazardType;
  enabled: boolean;
};

export type SecretRuntimeState = {
  revealed: boolean;
};

export type CircuitRuntimeState = {
  // “Active” is the output of behavior mode after evaluation.
  active: boolean;
  // For edge detection on satisfiable (raw) signal:
  // used by TOGGLE mode and for “toggle target” effects.
  lastSatisfied: boolean;
  // Debug info: helpful to show in UI.
  lastSatisfiedCount: number;
};

export type DungeonRuntimeState = {
  doors: Record<number, DoorRuntimeState>;
  keys: Record<number, KeyRuntimeState>;
  levers: Record<number, LeverRuntimeState>;
  plates: Record<number, PlateRuntimeState>;
  hazards: Record<number, HazardRuntimeState>;
  secrets: Record<number, SecretRuntimeState>;
  circuits: Record<number, CircuitRuntimeState>;
};

function cloneState<S>(s: S): S {
  // runtime state is shallow objects + maps, so structuredClone is ideal if available
  // but we keep it simple and explicit.
  return JSON.parse(JSON.stringify(s)) as S;
}

export function initDungeonRuntimeState(
  content: ContentOutputs,
): DungeonRuntimeState {
  const doors: Record<number, DoorRuntimeState> = {};
  const keys: Record<number, KeyRuntimeState> = {};
  const levers: Record<number, LeverRuntimeState> = {};
  const plates: Record<number, PlateRuntimeState> = {};
  const hazards: Record<number, HazardRuntimeState> = {};
  const secrets: Record<number, SecretRuntimeState> = {};
  const circuits: Record<number, CircuitRuntimeState> = {};

  // Initialize circuits to inert
  for (const c of content.meta.circuits) {
    circuits[c.id] = {
      active: false,
      lastSatisfied: false,
      lastSatisfiedCount: 0,
    };
  }

  // Doors: start closed by default
  for (const d of content.meta.doors) {
    doors[d.id] = {
      kind: d.kind,
      isOpen: false,
    };
  }

  // Keys/levers exist as triggers; runtime starts uncollected/untoggled
  for (const k of content.meta.keys) {
    keys[k.id] = { collected: false };
  }

  for (const l of content.meta.levers) {
    levers[l.id] = { toggled: false };
  }

  // Plates exist as triggers; runtime starts unpressed
  // (Placement is currently scaffolding, but this keeps the model complete.)
  for (const p of content.meta.plates) {
    plates[p.id] = { pressed: false };
  }

  // Hazards and secrets may exist as targets, but the content meta
  // may not list them explicitly yet — keep resilient.
  // If you later add content.meta.hazards/meta.secrets, you can initialize here.
  // For now, we build lazily by circuit targets in evaluator.

  return { doors, keys, levers, plates, hazards, secrets, circuits };
}

// ----------------- Runtime actions -----------------

export function toggleLever(
  state: DungeonRuntimeState,
  leverCircuitId: number,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.levers[leverCircuitId]) {
    next.levers[leverCircuitId] = { toggled: false };
  }
  next.levers[leverCircuitId].toggled = !next.levers[leverCircuitId].toggled;
  return next;
}

export function collectKey(
  state: DungeonRuntimeState,
  keyCircuitId: number,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.keys[keyCircuitId]) {
    next.keys[keyCircuitId] = { collected: false };
  }
  next.keys[keyCircuitId].collected = true;
  return next;
}

export function setPlatePressed(
  state: DungeonRuntimeState,
  plateCircuitId: number,
  pressed: boolean,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.plates[plateCircuitId]) {
    next.plates[plateCircuitId] = { pressed: false };
  }
  next.plates[plateCircuitId].pressed = pressed;
  return next;
}

export function togglePlate(
  state: DungeonRuntimeState,
  plateCircuitId: number,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.plates[plateCircuitId]) {
    next.plates[plateCircuitId] = { pressed: false };
  }
  next.plates[plateCircuitId].pressed = !next.plates[plateCircuitId].pressed;
  return next;
}

export function resetRuntimeState(
  state: DungeonRuntimeState,
  content: ContentOutputs,
): DungeonRuntimeState {
  // Re-init from current content meta
  return initDungeonRuntimeState(content);
}

// ----------------- Target application helpers -----------------

export function ensureDoor(
  state: DungeonRuntimeState,
  id: number,
  kind: DoorKind,
): void {
  if (!state.doors[id]) state.doors[id] = { kind, isOpen: false };
}

export function ensureHazard(
  state: DungeonRuntimeState,
  id: number,
  hazardType: HazardType,
): void {
  if (!state.hazards[id]) state.hazards[id] = { hazardType, enabled: false };
}

export function ensureSecret(state: DungeonRuntimeState, id: number): void {
  if (!state.secrets[id]) state.secrets[id] = { revealed: false };
}

export function ensurePlate(state: DungeonRuntimeState, id: number): void {
  if (!state.plates[id]) state.plates[id] = { pressed: false };
}
