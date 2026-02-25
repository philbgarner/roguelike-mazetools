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

import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import type { DungeonRuntimeState } from "../dungeonState";
import { TurnScheduler } from "./turnScheduler";
import { actionDelay } from "./actionCosts";
import type {
  ActorId,
  PlayerActor,
  MonsterActor,
  TurnAction,
  ActionCost,
} from "./turnTypes";
import type { TurnLogEntry } from "./turnDebug";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type TurnSystemState = {
  actors: Record<ActorId, PlayerActor | MonsterActor>;
  playerId: ActorId;
  scheduler: TurnScheduler;
  awaitingPlayerInput: boolean;
  activeActorId: ActorId | null;
  /** Optional bounded turn log (populated when deps.log is true). */
  log: TurnLogEntry[];
};

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export type TurnSystemDeps = {
  dungeon: BspDungeonOutputs;
  content: ContentOutputs;
  runtime: DungeonRuntimeState;
  isWalkable: (x: number, y: number) => boolean;
  /** AI callback: decide what a monster does this turn. */
  monsterDecide: (
    state: TurnSystemState,
    monsterId: ActorId,
  ) => TurnAction;
  /** Cost callback: how much time does this action cost for this actor? */
  computeCost: (actorId: ActorId, action: TurnAction) => ActionCost;
  /** Apply an action: returns a new TurnSystemState with mutated actors. */
  applyAction: (
    state: TurnSystemState,
    actorId: ActorId,
    action: TurnAction,
    deps: TurnSystemDeps,
  ) => TurnSystemState;
  /** Set to true to record turns into state.log (bounded at 200 entries). */
  log?: boolean;
};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Build the initial TurnSystemState from a player + monster list.
 * Every actor is scheduled with its normal move delay so the initial ordering
 * is consistent (RogueBasin recommendation).
 */
export function createTurnSystemState(
  player: PlayerActor,
  monsters: MonsterActor[],
): TurnSystemState {
  const actors: Record<ActorId, PlayerActor | MonsterActor> = {};
  const scheduler = new TurnScheduler();

  actors[player.id] = player;
  const playerDelay = actionDelay(player.speed, { kind: "move" });
  scheduler.add(player.id, playerDelay);

  for (const m of monsters) {
    actors[m.id] = m;
    const monsterDelay = actionDelay(m.speed, { kind: "move" });
    scheduler.add(m.id, monsterDelay);
  }

  return {
    actors,
    playerId: player.id,
    scheduler,
    awaitingPlayerInput: false,
    activeActorId: null,
    log: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAlive(state: TurnSystemState, actorId: ActorId): boolean {
  const actor = state.actors[actorId];
  return !!actor && actor.alive;
}

function appendLog(
  state: TurnSystemState,
  deps: TurnSystemDeps,
  entry: TurnLogEntry,
): void {
  if (!deps.log) return;
  state.log.push(entry);
  // Bound to last 200 entries.
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

const MAX_MONSTER_TICKS_PER_CALL = 500;

/**
 * Advance the schedule until it is the player's turn (or the schedule is empty).
 * Mutates the scheduler in-place (it is a class), returns new state for actors/flags.
 *
 * Monster ticks are bounded per call to prevent infinite loops in pathological cases.
 */
export function tickUntilPlayer(
  state: TurnSystemState,
  deps: TurnSystemDeps,
): TurnSystemState {
  let current: TurnSystemState = { ...state, awaitingPlayerInput: false, activeActorId: null };
  let safetyCounter = 0;

  while (safetyCounter++ < MAX_MONSTER_TICKS_PER_CALL) {
    const evt = current.scheduler.next();
    if (!evt) {
      // Schedule exhausted — shouldn't happen in a normal game.
      break;
    }

    const { actorId } = evt;

    // Skip dead actors.
    if (!isAlive(current, actorId)) {
      continue;
    }

    // Player's turn — pause and hand control back to UI.
    if (actorId === current.playerId) {
      current = {
        ...current,
        awaitingPlayerInput: true,
        activeActorId: actorId,
      };
      return current;
    }

    // Monster's turn — run AI, apply action, reschedule.
    const action = deps.monsterDecide(current, actorId);
    const cost = deps.computeCost(actorId, action);
    const actor = current.actors[actorId];

    appendLog(current, deps, {
      t: current.scheduler.getNow(),
      actorId,
      action,
      cost: cost.time,
    });

    current = deps.applyAction(current, actorId, action, deps);
    current.scheduler.reschedule(actorId, cost.time);

    // If monster died during its own action, skip reschedule already done above —
    // the scheduler will lazily discard it next time.
    void actor; // suppress unused warning
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
  if (!state.awaitingPlayerInput) {
    // Guard — caller should not commit when it's not the player's turn.
    return state;
  }

  const cost = deps.computeCost(state.playerId, action);

  appendLog(state, deps, {
    t: state.scheduler.getNow(),
    actorId: state.playerId,
    action,
    cost: cost.time,
  });

  let next = deps.applyAction(state, state.playerId, action, deps);
  next = {
    ...next,
    awaitingPlayerInput: false,
    activeActorId: null,
  };
  next.scheduler.reschedule(state.playerId, cost.time);

  return tickUntilPlayer(next, deps);
}

// ---------------------------------------------------------------------------
// Default callbacks (suitable for phase-1 "infrastructure only" usage)
// ---------------------------------------------------------------------------

/**
 * Default computeCost: uses actionDelay from actionCosts.ts.
 */
export function defaultComputeCost(
  actorId: ActorId,
  action: TurnAction,
  actors: Record<ActorId, PlayerActor | MonsterActor>,
): ActionCost {
  const actor = actors[actorId];
  const speed = actor?.speed ?? 1;
  return { time: actionDelay(speed, action) };
}

/**
 * Default applyAction: moves actor if dx/dy are set and target is walkable,
 * skips otherwise. No damage calculations yet (phase 1).
 */
export function defaultApplyAction(
  state: TurnSystemState,
  actorId: ActorId,
  action: TurnAction,
  deps: TurnSystemDeps,
): TurnSystemState {
  if (action.kind !== "move" || action.dx == null || action.dy == null) {
    return state;
  }

  const actor = state.actors[actorId];
  if (!actor) return state;

  const nx = actor.x + action.dx;
  const ny = actor.y + action.dy;

  if (!deps.isWalkable(nx, ny)) return state;

  // Check occupancy by other blocking actors.
  for (const other of Object.values(state.actors)) {
    if (other.id === actorId) continue;
    if (other.alive && other.blocksMovement && other.x === nx && other.y === ny) {
      return state;
    }
  }

  const updatedActor = { ...actor, x: nx, y: ny };
  return {
    ...state,
    actors: { ...state.actors, [actorId]: updatedActor },
  };
}

/**
 * Phase-1 monster AI: always waits.
 * Replace with monsterAI.ts's decideChasePlayer in phase 2.
 */
export function waitAI(
  _state: TurnSystemState,
  _monsterId: ActorId,
): TurnAction {
  return { kind: "wait" };
}
