// src/dungeonState.ts
//
// Milestone 3 — Phase 2
// Runtime puzzle state model + action helpers.
//
// This layer is intentionally independent from generation.
// It is initialized from ContentOutputs.meta and then mutated by runtime actions.

import type {
  BspDungeonOutputs,
  ContentOutputs,
  DoorKind,
  HazardType,
  CircuitDef,
} from "./mazeGen";
import { isTileWalkable } from "./walkability";

export type DoorRuntimeState = {
  kind: DoorKind;
  isOpen: boolean;
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

export type BlockRuntimeState = {
  x: number;
  y: number;
  weightClass: number; // 0..3
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
  blocks: Record<number, BlockRuntimeState>;
  hazards: Record<number, HazardRuntimeState>;
  secrets: Record<number, SecretRuntimeState>;
  circuits: Record<number, CircuitRuntimeState>;
};

function cloneState<S>(s: S): S {
  // runtime state is shallow objects + maps, so structuredClone is ideal if available
  // but we keep it simple and explicit.
  return JSON.parse(JSON.stringify(s)) as S;
}

function idxOf(W: number, x: number, y: number) {
  return y * W + x;
}

export function initDungeonRuntimeState(
  content: ContentOutputs,
): DungeonRuntimeState {
  const doors: Record<number, DoorRuntimeState> = {};
  const keys: Record<number, KeyRuntimeState> = {};
  const levers: Record<number, LeverRuntimeState> = {};
  const plates: Record<number, PlateRuntimeState> = {};
  const blocks: Record<number, BlockRuntimeState> = {};
  const hazards: Record<number, HazardRuntimeState> = {};
  const secrets: Record<number, SecretRuntimeState> = {};
  const circuits: Record<number, CircuitRuntimeState> = {};

  // Doors
  for (const d of content.meta.doors) {
    doors[d.id] = { kind: d.kind, isOpen: false };
  }

  // Keys
  for (const k of content.meta.keys) {
    keys[k.id] = { collected: false };
  }

  // Levers
  for (const l of content.meta.levers) {
    levers[l.id] = { toggled: false };
  }

  // Plates
  for (const p of content.meta.plates) {
    plates[p.id] = { pressed: false };
  }

  // Blocks
  for (const b of content.meta.blocks) {
    blocks[b.id] = { x: b.x, y: b.y, weightClass: b.weightClass ?? 0 };
  }

  // Hazards
  for (const h of content.meta.hazards) {
    hazards[h.id] = { hazardType: h.hazardType, enabled: h.activeInitial };
  }

  // Secrets
  for (const s of content.meta.secrets) {
    secrets[s.id] = { revealed: false };
  }

  // Circuits (runtime debug state only)
  for (const c of content.meta.circuits) {
    circuits[c.id] = {
      active: false,
      lastSatisfied: false,
      lastSatisfiedCount: 0,
    };
  }

  return {
    doors,
    keys,
    levers,
    plates,
    blocks,
    hazards,
    secrets,
    circuits,
  };
}

// ----------------- Basic actions -----------------

export function collectKey(
  state: DungeonRuntimeState,
  keyCircuitId: number,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.keys[keyCircuitId]) next.keys[keyCircuitId] = { collected: false };
  next.keys[keyCircuitId].collected = true;
  return next;
}

export function toggleLever(
  state: DungeonRuntimeState,
  leverCircuitId: number,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.levers[leverCircuitId])
    next.levers[leverCircuitId] = { toggled: false };
  next.levers[leverCircuitId].toggled = !next.levers[leverCircuitId].toggled;
  return next;
}

// Plates are now DERIVED — keep these for compatibility/testing, but App.tsx no longer calls them.
export function setPlatePressed(
  state: DungeonRuntimeState,
  plateCircuitId: number,
  pressed: boolean,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.plates[plateCircuitId])
    next.plates[plateCircuitId] = { pressed: false };
  next.plates[plateCircuitId].pressed = pressed;
  return next;
}

export function togglePlate(
  state: DungeonRuntimeState,
  plateCircuitId: number,
): DungeonRuntimeState {
  const next = cloneState(state);
  if (!next.plates[plateCircuitId])
    next.plates[plateCircuitId] = { pressed: false };
  next.plates[plateCircuitId].pressed = !next.plates[plateCircuitId].pressed;
  return next;
}

export function resetRuntimeState(
  _state: DungeonRuntimeState,
  content: ContentOutputs,
): DungeonRuntimeState {
  // Re-init from current content meta
  return initDungeonRuntimeState(content);
}

// ----------------- Derived state -----------------

/**
 * DERIVED PLATES:
 * Plate.pressed is computed from block occupancy (and plate config), not directly mutated.
 *
 * This should be called any time blocks move (and once after init).
 */
export function derivePlatesFromBlocks(
  state: DungeonRuntimeState,
  content: ContentOutputs,
): DungeonRuntimeState {
  const next = cloneState(state);

  // Precompute a quick occupancy set for blocks
  const occupied = new Set<number>();
  for (const b of Object.values(next.blocks)) {
    occupied.add(idxOf(content.width, b.x, b.y));
  }

  for (const p of content.meta.plates) {
    if (!next.plates[p.id]) next.plates[p.id] = { pressed: false };

    const onBlock = occupied.has(idxOf(content.width, p.x, p.y));
    let pressed = false;

    // For now we only have blocks in the prototype, but we respect the plate flags:
    if (p.activatedByBlock && onBlock) pressed = true;

    // (Player activation can be added later)
    if (p.inverted) pressed = !pressed;

    next.plates[p.id].pressed = pressed;
  }

  return next;
}

// ----------------- Block push (prototype) -----------------

export type PushResult =
  | { ok: true; next: DungeonRuntimeState }
  | { ok: false; next: DungeonRuntimeState; error: string };

function hasBlockAt(
  state: DungeonRuntimeState,
  x: number,
  y: number,
  ignoreBlockId?: number,
): boolean {
  for (const [idStr, b] of Object.entries(state.blocks)) {
    const id = Number(idStr);
    if (ignoreBlockId != null && id === ignoreBlockId) continue;
    if (b.x === x && b.y === y) return true;
  }
  return false;
}

/**
 * Attempt to push a specific block by (dx,dy).
 * - checks bounds/walls
 * - blocks cannot overlap
 * - doors block movement unless currently open
 */
export function tryPushBlock(
  state: DungeonRuntimeState,
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  blockId: number,
  dx: number,
  dy: number,
): PushResult {
  const b = state.blocks[blockId];
  if (!b) return { ok: false, next: state, error: `Unknown block ${blockId}` };
  if ((dx | 0) === 0 && (dy | 0) === 0)
    return { ok: false, next: state, error: "No movement" };
  if (Math.abs(dx) + Math.abs(dy) !== 1)
    return {
      ok: false,
      next: state,
      error: "Only cardinal pushes are supported",
    };

  const nx = b.x + dx;
  const ny = b.y + dy;

  const okWalk = isTileWalkable(dungeon, content, nx, ny, {
    isDoorOpen: (doorId) => {
      const door = state.doors?.[doorId];
      return !!(door?.isOpen || (door as any)?.forcedOpen);
    },
    isSecretRevealed: (secretId) => !!state.secrets?.[secretId]?.revealed,
  });

  if (!okWalk) {
    return { ok: false, next: state, error: "Blocked" };
  }

  if (hasBlockAt(state, nx, ny, blockId)) {
    return { ok: false, next: state, error: "Another block is in the way" };
  }

  const next = cloneState(state);
  next.blocks[blockId] = { ...next.blocks[blockId], x: nx, y: ny };
  return { ok: true, next };
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
