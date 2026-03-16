// src/turn/turnSystem.ts
//
// High-level turn-loop brain.
//
// Owns actors (player + monsters) and a TurnScheduler.
// Pauses when it is the player's turn (UI-driven); auto-advances monsters.
//
// React integration:
//   - hover / inspect → does NOT advance turns
//   - committed click / keypress → commitPlayerAction() → advances until next player turn

import { TurnScheduler } from "./turnScheduler";
import { actionDelay } from "./actionCosts";
import type {
  ActorId,
  PlayerActor,
  MonsterActor,
  TurnAction,
  ActionCost,
} from "./turnTypes";
import type { DecideResult } from "./monsterAI";
import type { TurnEvent } from "./turnEvents";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type TurnSystemState = {
  actors: Record<ActorId, PlayerActor | MonsterActor>;
  playerId: ActorId;
  scheduler: TurnScheduler;
  awaitingPlayerInput: boolean;
  activeActorId: ActorId | null;
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type TurnSystemDeps = {
  isWalkable: (x: number, y: number) => boolean;
  /** AI callback: decide what a monster does this turn. */
  monsterDecide: (state: TurnSystemState, monsterId: ActorId) => DecideResult;
  /** Cost callback: how much time does this action cost? */
  computeCost: (actorId: ActorId, action: TurnAction) => ActionCost;
  /** Apply an action: returns new TurnSystemState. */
  applyAction: (
    state: TurnSystemState,
    actorId: ActorId,
    action: TurnAction,
    deps: TurnSystemDeps,
  ) => TurnSystemState;
  /**
   * Called whenever the scheduler advances to a new time (between actor turns).
   */
  onTimeAdvanced?: (args: {
    prevTime: number;
    nextTime: number;
    activeActorId: ActorId;
    state: TurnSystemState;
  }) => void;
  /**
   * Emit a game event (damage, death, xp gain, etc.) to the React layer.
   * Called synchronously — callers must NOT setState directly from here.
   */
  onEvent?: (event: TurnEvent) => void;
};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Build the initial TurnSystemState from a player + monster list.
 */
export function createTurnSystemState(
  player: PlayerActor,
  monsters: MonsterActor[],
): TurnSystemState {
  const actors: Record<ActorId, PlayerActor | MonsterActor> = {};
  const scheduler = new TurnScheduler();

  actors[player.id] = player;
  scheduler.add(player.id, actionDelay(player.speed, { kind: "move" }));

  for (const m of monsters) {
    actors[m.id] = m;
    scheduler.add(m.id, actionDelay(m.speed, { kind: "move" }));
  }

  return {
    actors,
    playerId: player.id,
    scheduler,
    awaitingPlayerInput: false,
    activeActorId: null,
  };
}

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

const MAX_MONSTER_TICKS_PER_CALL = 500;

/**
 * Advance the schedule until it is the player's turn.
 * Mutates the scheduler in-place; returns new state for actors/flags.
 */
export function tickUntilPlayer(
  state: TurnSystemState,
  deps: TurnSystemDeps,
): TurnSystemState {
  let current: TurnSystemState = { ...state, awaitingPlayerInput: false, activeActorId: null };
  let safetyCounter = 0;

  while (safetyCounter++ < MAX_MONSTER_TICKS_PER_CALL) {
    const prevT = current.scheduler.getNow();
    const evt = current.scheduler.next();
    if (!evt) break;

    const { actorId } = evt;
    const nextT = evt.now;

    if (nextT !== prevT) {
      deps.onTimeAdvanced?.({ prevTime: prevT, nextTime: nextT, activeActorId: actorId, state: current });
    }

    const actor = current.actors[actorId];
    if (!actor || !actor.alive) continue;

    // Player's turn — pause and hand control back to UI.
    if (actorId === current.playerId) {
      return { ...current, awaitingPlayerInput: true, activeActorId: actorId };
    }

    // Monster's turn.
    const { action, monsterPatch } = deps.monsterDecide(current, actorId);
    const cost = deps.computeCost(actorId, action);

    if (Object.keys(monsterPatch).length > 0) {
      current = {
        ...current,
        actors: { ...current.actors, [actorId]: { ...actor, ...monsterPatch } },
      };
    }

    current = deps.applyAction(current, actorId, action, deps);
    current.scheduler.reschedule(actorId, cost.time);
  }

  return current;
}

// ---------------------------------------------------------------------------
// Player commit
// ---------------------------------------------------------------------------

/**
 * Commit the player's chosen action, advance the turn, then run monsters until
 * the player's next turn.
 *
 * Precondition: state.awaitingPlayerInput === true
 */
export function commitPlayerAction(
  state: TurnSystemState,
  deps: TurnSystemDeps,
  action: TurnAction,
): TurnSystemState {
  if (!state.awaitingPlayerInput) return state;

  const cost = deps.computeCost(state.playerId, action);
  let next = deps.applyAction(state, state.playerId, action, deps);
  next = { ...next, awaitingPlayerInput: false, activeActorId: null };
  next.scheduler.reschedule(state.playerId, cost.time);

  return tickUntilPlayer(next, deps);
}

// ---------------------------------------------------------------------------
// Default callbacks
// ---------------------------------------------------------------------------

/**
 * Default computeCost using actionDelay.
 */
export function defaultComputeCost(
  actorId: ActorId,
  action: TurnAction,
  actors: Record<ActorId, PlayerActor | MonsterActor>,
): ActionCost {
  const actor = actors[actorId];
  return { time: actionDelay(actor?.speed ?? 1, action) };
}

/**
 * Default applyAction: moves actor if dx/dy set and target is walkable.
 * No combat (phase 1 usage).
 */
export function defaultApplyAction(
  state: TurnSystemState,
  actorId: ActorId,
  action: TurnAction,
  deps: TurnSystemDeps,
): TurnSystemState {
  if (action.kind !== "move" || action.dx == null || action.dy == null) return state;

  const actor = state.actors[actorId];
  if (!actor) return state;

  const nx = actor.x + action.dx;
  const ny = actor.y + action.dy;

  if (!deps.isWalkable(nx, ny)) return state;

  for (const other of Object.values(state.actors)) {
    if (other.id === actorId) continue;
    if (other.alive && other.blocksMovement && other.x === nx && other.y === ny) return state;
  }

  return { ...state, actors: { ...state.actors, [actorId]: { ...actor, x: nx, y: ny } } };
}

/**
 * Phase-1 monster AI: always waits.
 */
export function waitAI(
  _state: TurnSystemState,
  _monsterId: ActorId,
): DecideResult {
  return { action: { kind: "wait" }, monsterPatch: {} };
}
