// src/turn/playerAutoWalk.ts
//
// Manages "player is following a route to a clicked destination" state.
//
// Owns the active path and produces exactly one TurnAction per call to
// consumeNextAutoWalkStep (called when it is the player's turn).
// Path is recomputed each step so dynamic obstacles (moving monsters, door
// state changes) are handled correctly.

import type { GridPos } from "../pathfinding/aStar8";
import { aStar8 } from "../pathfinding/aStar8";
import type { TurnSystemState } from "./turnSystem";
import type { TurnAction } from "./turnTypes";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import type { DungeonRuntimeState } from "../dungeonState";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type AutoWalkState =
  | { kind: "idle" }
  | {
      kind: "active";
      target: GridPos;
      /** Last computed path from player to target (start-inclusive). Used by overlay. */
      path: GridPos[];
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvers(runtime: DungeonRuntimeState) {
  return {
    isDoorOpen: (doorId: number) => !!runtime?.doors?.[doorId]?.isOpen,
    isSecretRevealed: (secretId: number) => !!runtime?.secrets?.[secretId]?.revealed,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a new auto-walk from `from` to `target`.
 * Returns idle if target is unreachable.
 */
export function startAutoWalk(args: {
  from: GridPos;
  target: GridPos;
  dungeon: BspDungeonOutputs;
  content: ContentOutputs;
  runtime: DungeonRuntimeState;
}): AutoWalkState {
  const { from, target, dungeon, content, runtime } = args;
  const pathResult = aStar8(dungeon, content, from, target, resolvers(runtime));
  if (!pathResult || pathResult.path.length < 2) return { kind: "idle" };
  return { kind: "active", target, path: pathResult.path };
}

/** Cancel any active auto-walk and return the idle state. */
export function cancelAutoWalk(): AutoWalkState {
  return { kind: "idle" };
}

export function isAutoWalkActive(
  s: AutoWalkState,
): s is Extract<AutoWalkState, { kind: "active" }> {
  return s.kind === "active";
}

/**
 * Called only when it is the player's turn.
 *
 * Recomputes the path from the player's *current* position (important: monsters
 * may have moved, doors may have changed since last step).
 *
 * Returns:
 *  - { nextAutoWalk, action, pathForOverlay } when a step is available.
 *  - { nextAutoWalk: idle, action: null, pathForOverlay: null } when done or blocked.
 */
export function consumeNextAutoWalkStep(args: {
  autoWalk: AutoWalkState;
  turnState: TurnSystemState;
  dungeon: BspDungeonOutputs;
  content: ContentOutputs;
  runtime: DungeonRuntimeState;
}): {
  nextAutoWalk: AutoWalkState;
  action: TurnAction | null;
  pathForOverlay: GridPos[] | null;
} {
  const { autoWalk, turnState, dungeon, content, runtime } = args;

  const idle = { nextAutoWalk: { kind: "idle" } as AutoWalkState, action: null, pathForOverlay: null };

  if (autoWalk.kind !== "active") return idle;

  const playerActor = turnState.actors[turnState.playerId];
  if (!playerActor) return idle;

  const from: GridPos = { x: playerActor.x, y: playerActor.y };
  const { target } = autoWalk;

  // Already at target.
  if (from.x === target.x && from.y === target.y) return idle;

  // Recompute path from current position each step.
  const pathResult = aStar8(dungeon, content, from, target, resolvers(runtime));
  if (!pathResult || pathResult.path.length < 2) return idle;

  const nextStep = pathResult.path[1];
  const dx = nextStep.x - from.x;
  const dy = nextStep.y - from.y;

  return {
    nextAutoWalk: { kind: "active", target, path: pathResult.path },
    action: { kind: "move", dx, dy },
    pathForOverlay: pathResult.path,
  };
}
