// src/turn/monsterAI.ts
//
// Phase-2 monster AI: chase the player using A* with a visibility-gated
// alert state machine.
//
// Alert states:
//   idle      — monster is unaware; does nothing until the player enters
//               its detection radius.
//   chasing   — monster is actively pursuing the player.
//   searching — monster lost sight of the player; keeps heading to the
//               last known position for `giveUpTurns` turns before going
//               back to idle.
//
// Config is derived from danger level so that more dangerous monsters
// detect the player from farther away and give up less easily.

import { aStar8 } from "../pathfinding/aStar8";
import type { GridPos } from "../pathfinding/aStar8";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import type { DungeonRuntimeState } from "../dungeonState";
import { getBlockIdAt } from "../dungeonState";
import type { TurnAction, ActorId, MonsterActor, MonsterAlertState } from "./turnTypes";
import type { TurnSystemState } from "./turnSystem";

// ---------------------------------------------------------------------------
// Alert config
// ---------------------------------------------------------------------------

export type MonsterAlertConfig = {
  /** How many cells away the monster can spot the player (must be within
   *  the player's own FOV radius to count as "visible").  Higher danger
   *  monsters have a larger detection range. */
  detectionRadius: number;
  /** Turns of searching before the monster gives up and goes idle.
   *  Higher danger monsters are more persistent. */
  giveUpTurns: number;
};

/**
 * Derive alert config from a monster's danger level.
 *
 * danger 0  → detectionRadius 4,  giveUpTurns 3
 * danger 5  → detectionRadius 7,  giveUpTurns 8
 * danger 10 → detectionRadius 10, giveUpTurns 12
 */
export function monsterAlertConfig(danger: number): MonsterAlertConfig {
  return {
    detectionRadius: Math.min(10, 4 + danger),
    giveUpTurns: Math.min(12, 3 + danger),
  };
}

// ---------------------------------------------------------------------------
// Visibility helpers
// ---------------------------------------------------------------------------

/**
 * True if the monster can "see" the player — i.e. the monster is inside
 * the player's FOV circle.  We mirror the renderer's simple radial check
 * (no wall occlusion) so that the AI and the visual fog-of-war agree.
 *
 * @param playerVisRadius  The `radius` value used by the visibility renderer
 *                         (default 6 in DungeonRenderView).
 */
function isMonsterInPlayerFov(
  monsterX: number,
  monsterY: number,
  playerX: number,
  playerY: number,
  playerVisRadius: number,
): boolean {
  return Math.hypot(monsterX - playerX, monsterY - playerY) <= playerVisRadius;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Compute the A* path from a monster to the player.
 *
 * Returns the path (from monster's cell to player's cell), optionally clamped
 * to maxSteps cells. Returns null if the player is unreachable or the monster
 * is already at the player's cell.
 */
export function computeChasePathToPlayer(
  state: TurnSystemState,
  monsterId: ActorId,
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  runtime: DungeonRuntimeState,
  opts?: { maxSteps?: number },
): GridPos[] | null {
  const monster = state.actors[monsterId];
  const player = state.actors[state.playerId];

  if (!monster || !player || !monster.alive || !player.alive) {
    return null;
  }

  return _pathTo(
    monster.x, monster.y,
    player.x, player.y,
    dungeon, content, runtime, opts?.maxSteps,
  );
}

/** Internal: run A* from (sx,sy) to (gx,gy). */
function _pathTo(
  sx: number, sy: number,
  gx: number, gy: number,
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  runtime: DungeonRuntimeState,
  maxSteps?: number,
): GridPos[] | null {
  const resolvers = {
    isDoorOpen: (doorId: number) => !!runtime.doors?.[doorId]?.isOpen,
    isSecretRevealed: (secretId: number) =>
      !!runtime.secrets?.[secretId]?.revealed,
  };

  const result = aStar8(dungeon, content, { x: sx, y: sy }, { x: gx, y: gy }, resolvers, {
    isBlocked: (x, y) => getBlockIdAt(runtime, x, y) !== null,
  });

  if (!result || result.path.length < 2) return null;

  return maxSteps != null ? result.path.slice(0, maxSteps) : result.path;
}

// ---------------------------------------------------------------------------
// Alert state transition
// ---------------------------------------------------------------------------

type AlertTransition = {
  newAlertState: MonsterAlertState;
  newSearchTurnsLeft: number;
  newLastKnownPlayerPos: { x: number; y: number } | null;
};

function transitionAlertState(
  monster: MonsterActor,
  playerX: number,
  playerY: number,
  playerVisRadius: number,
  config: MonsterAlertConfig,
): AlertTransition {
  const canSeePlayer = isMonsterInPlayerFov(
    monster.x, monster.y, playerX, playerY, playerVisRadius,
  );
  const withinDetection = Math.hypot(monster.x - playerX, monster.y - playerY)
    <= config.detectionRadius;

  switch (monster.alertState) {
    case "idle": {
      if (canSeePlayer && withinDetection) {
        // Player entered detection radius while visible → start chasing.
        return {
          newAlertState: "chasing",
          newSearchTurnsLeft: 0,
          newLastKnownPlayerPos: { x: playerX, y: playerY },
        };
      }
      return {
        newAlertState: "idle",
        newSearchTurnsLeft: 0,
        newLastKnownPlayerPos: null,
      };
    }

    case "chasing": {
      if (canSeePlayer) {
        // Still has line-of-sight — keep chasing, update last known pos.
        return {
          newAlertState: "chasing",
          newSearchTurnsLeft: 0,
          newLastKnownPlayerPos: { x: playerX, y: playerY },
        };
      }
      // Lost sight — start searching.
      return {
        newAlertState: "searching",
        newSearchTurnsLeft: config.giveUpTurns,
        newLastKnownPlayerPos: monster.lastKnownPlayerPos,
      };
    }

    case "searching": {
      if (canSeePlayer) {
        // Re-acquired — resume chasing.
        return {
          newAlertState: "chasing",
          newSearchTurnsLeft: 0,
          newLastKnownPlayerPos: { x: playerX, y: playerY },
        };
      }
      const turnsLeft = monster.searchTurnsLeft - 1;
      if (turnsLeft <= 0) {
        // Gave up.
        return {
          newAlertState: "idle",
          newSearchTurnsLeft: 0,
          newLastKnownPlayerPos: null,
        };
      }
      return {
        newAlertState: "searching",
        newSearchTurnsLeft: turnsLeft,
        newLastKnownPlayerPos: monster.lastKnownPlayerPos,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Main AI entry point
// ---------------------------------------------------------------------------

export type DecideResult = {
  action: TurnAction;
  /** Updated monster fields to apply alongside the action. */
  monsterPatch: Partial<Pick<
    MonsterActor,
    "alertState" | "searchTurnsLeft" | "lastKnownPlayerPos"
  >>;
};

/**
 * Decide what a monster does this turn, also returning the alert-state
 * patch to apply.
 *
 * @param playerVisRadius  The FOV radius used by the renderer (default 6).
 */
export function decideChasePlayer(
  state: TurnSystemState,
  monsterId: ActorId,
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  runtime: DungeonRuntimeState,
  playerVisRadius = 6,
): DecideResult {
  const monster = state.actors[monsterId] as MonsterActor | undefined;
  const player = state.actors[state.playerId];

  if (!monster || !player || !monster.alive || !player.alive) {
    return { action: { kind: "wait" }, monsterPatch: {} };
  }

  const config = monsterAlertConfig(monster.danger);

  const transition = transitionAlertState(
    monster, player.x, player.y, playerVisRadius, config,
  );

  const patch: DecideResult["monsterPatch"] = {
    alertState: transition.newAlertState,
    searchTurnsLeft: transition.newSearchTurnsLeft,
    lastKnownPlayerPos: transition.newLastKnownPlayerPos,
  };

  // --- Idle: do nothing ---
  if (transition.newAlertState === "idle") {
    return { action: { kind: "wait" }, monsterPatch: patch };
  }

  // --- Chasing: path to current player position ---
  if (transition.newAlertState === "chasing") {
    const path = _pathTo(
      monster.x, monster.y,
      player.x, player.y,
      dungeon, content, runtime,
    );
    if (!path) {
      return { action: { kind: "wait" }, monsterPatch: patch };
    }
    const next = path[1];
    return {
      action: { kind: "move", dx: next.x - monster.x, dy: next.y - monster.y },
      monsterPatch: patch,
    };
  }

  // --- Searching: path to last known player position ---
  const target = transition.newLastKnownPlayerPos;
  if (!target) {
    return { action: { kind: "wait" }, monsterPatch: patch };
  }

  // If we've reached the last known position, just wait (and count down).
  if (monster.x === target.x && monster.y === target.y) {
    return { action: { kind: "wait" }, monsterPatch: patch };
  }

  const path = _pathTo(
    monster.x, monster.y,
    target.x, target.y,
    dungeon, content, runtime,
  );
  if (!path) {
    return { action: { kind: "wait" }, monsterPatch: patch };
  }
  const next = path[1];
  return {
    action: { kind: "move", dx: next.x - monster.x, dy: next.y - monster.y },
    monsterPatch: patch,
  };
}

// ---------------------------------------------------------------------------
// Planned-path helper (used by rendering overlay, not turn loop)
// ---------------------------------------------------------------------------

/**
 * Compute the A* path from a monster toward its current target.
 * Respects alert state: idle monsters return null (no planned path).
 */
export function computeChasePathForOverlay(
  state: TurnSystemState,
  monsterId: ActorId,
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  runtime: DungeonRuntimeState,
  opts?: { maxSteps?: number },
): GridPos[] | null {
  const monster = state.actors[monsterId] as MonsterActor | undefined;
  const player = state.actors[state.playerId];

  if (!monster || !player || !monster.alive || !player.alive) return null;
  if (monster.alertState === "idle") return null;

  const target = monster.alertState === "chasing"
    ? { x: player.x, y: player.y }
    : monster.lastKnownPlayerPos;

  if (!target) return null;

  return _pathTo(
    monster.x, monster.y,
    target.x, target.y,
    dungeon, content, runtime,
    opts?.maxSteps,
  );
}
