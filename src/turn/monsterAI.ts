// src/turn/monsterAI.ts
//
// Monster AI: chase the player using A* with a visibility-gated alert state machine.
//
// Alert states:
//   idle      — unaware; waits until player enters detection radius
//   chasing   — actively pursuing the player
//   searching — lost sight; heads to last known position for giveUpTurns then idles

import { aStar8 } from "../astar";
import type { GridPos } from "../astar";
import type { DungeonOutputs } from "../bsp";
import type { TurnAction, ActorId, MonsterActor, MonsterAlertState } from "./turnTypes";
import type { TurnSystemState } from "./turnSystem";

// ---------------------------------------------------------------------------
// Alert config
// ---------------------------------------------------------------------------

export type MonsterAlertConfig = {
  detectionRadius: number;
  giveUpTurns: number;
};

/**
 * Derive alert config from danger level.
 * danger 0  → detectionRadius 4,  giveUpTurns 3
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

function isMonsterInPlayerFov(
  monsterX: number, monsterY: number,
  playerX: number, playerY: number,
  playerVisRadius: number,
): boolean {
  return Math.hypot(monsterX - playerX, monsterY - playerY) <= playerVisRadius;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function _pathTo(
  sx: number, sy: number,
  gx: number, gy: number,
  dungeon: DungeonOutputs,
  isWalkable: (x: number, y: number) => boolean,
  maxSteps?: number,
  fourDir?: boolean,
): GridPos[] | null {
  const result = aStar8(dungeon, isWalkable, { x: sx, y: sy }, { x: gx, y: gy }, { fourDir });
  if (!result || result.path.length < 2) return null;
  return maxSteps != null ? result.path.slice(0, maxSteps) : result.path;
}

export function computeChasePathToPlayer(
  state: TurnSystemState,
  monsterId: ActorId,
  dungeon: DungeonOutputs,
  isWalkable: (x: number, y: number) => boolean,
  opts?: { maxSteps?: number },
): GridPos[] | null {
  const monster = state.actors[monsterId];
  const player = state.actors[state.playerId];
  if (!monster || !player || !monster.alive || !player.alive) return null;
  return _pathTo(monster.x, monster.y, player.x, player.y, dungeon, isWalkable, opts?.maxSteps);
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
  playerX: number, playerY: number,
  playerVisRadius: number,
  config: MonsterAlertConfig,
): AlertTransition {
  const canSeePlayer = isMonsterInPlayerFov(monster.x, monster.y, playerX, playerY, playerVisRadius);
  const withinDetection = Math.hypot(monster.x - playerX, monster.y - playerY) <= config.detectionRadius;

  switch (monster.alertState) {
    case "idle": {
      if (canSeePlayer && withinDetection) {
        return { newAlertState: "chasing", newSearchTurnsLeft: 0, newLastKnownPlayerPos: { x: playerX, y: playerY } };
      }
      return { newAlertState: "idle", newSearchTurnsLeft: 0, newLastKnownPlayerPos: null };
    }
    case "chasing": {
      if (canSeePlayer) {
        return { newAlertState: "chasing", newSearchTurnsLeft: 0, newLastKnownPlayerPos: { x: playerX, y: playerY } };
      }
      return { newAlertState: "searching", newSearchTurnsLeft: config.giveUpTurns, newLastKnownPlayerPos: monster.lastKnownPlayerPos };
    }
    case "searching": {
      if (canSeePlayer) {
        return { newAlertState: "chasing", newSearchTurnsLeft: 0, newLastKnownPlayerPos: { x: playerX, y: playerY } };
      }
      const turnsLeft = monster.searchTurnsLeft - 1;
      if (turnsLeft <= 0) {
        return { newAlertState: "idle", newSearchTurnsLeft: 0, newLastKnownPlayerPos: null };
      }
      return { newAlertState: "searching", newSearchTurnsLeft: turnsLeft, newLastKnownPlayerPos: monster.lastKnownPlayerPos };
    }
  }
}

// ---------------------------------------------------------------------------
// Main AI entry point
// ---------------------------------------------------------------------------

export type DecideResult = {
  action: TurnAction;
  monsterPatch: Partial<Pick<MonsterActor, "alertState" | "searchTurnsLeft" | "lastKnownPlayerPos">>;
};

/**
 * Decide what a monster does this turn.
 *
 * @param playerVisRadius  FOV radius used by the renderer (default 8).
 */
export function decideChasePlayer(
  state: TurnSystemState,
  monsterId: ActorId,
  dungeon: DungeonOutputs,
  isWalkable: (x: number, y: number) => boolean,
  playerVisRadius = 8,
  fourDir = false,
): DecideResult {
  const monster = state.actors[monsterId] as MonsterActor | undefined;
  const player = state.actors[state.playerId];

  if (!monster || !player || !monster.alive || !player.alive) {
    return { action: { kind: "wait" }, monsterPatch: {} };
  }

  const config = monsterAlertConfig(monster.danger);
  const transition = transitionAlertState(monster, player.x, player.y, playerVisRadius, config);

  const patch: DecideResult["monsterPatch"] = {
    alertState: transition.newAlertState,
    searchTurnsLeft: transition.newSearchTurnsLeft,
    lastKnownPlayerPos: transition.newLastKnownPlayerPos,
  };

  if (transition.newAlertState === "idle") {
    return { action: { kind: "wait" }, monsterPatch: patch };
  }

  if (transition.newAlertState === "chasing") {
    const path = _pathTo(monster.x, monster.y, player.x, player.y, dungeon, isWalkable, undefined, fourDir);
    if (!path) return { action: { kind: "wait" }, monsterPatch: patch };
    const next = path[1];
    return {
      action: { kind: "move", dx: next.x - monster.x, dy: next.y - monster.y },
      monsterPatch: patch,
    };
  }

  // Searching
  const target = transition.newLastKnownPlayerPos;
  if (!target) return { action: { kind: "wait" }, monsterPatch: patch };
  if (monster.x === target.x && monster.y === target.y) return { action: { kind: "wait" }, monsterPatch: patch };

  const path = _pathTo(monster.x, monster.y, target.x, target.y, dungeon, isWalkable, undefined, fourDir);
  if (!path) return { action: { kind: "wait" }, monsterPatch: patch };
  const next = path[1];
  return {
    action: { kind: "move", dx: next.x - monster.x, dy: next.y - monster.y },
    monsterPatch: patch,
  };
}
