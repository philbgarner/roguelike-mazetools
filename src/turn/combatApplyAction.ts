// src/turn/combatApplyAction.ts
//
// Combat-aware applyAction for the turn system.
//
// Extends the default move logic with "bump attack": when an actor steps into
// a cell occupied by a hostile (player ↔ monster), the move resolves as melee
// combat instead of being blocked.
//
// Emits TurnEvents via deps.onEvent (damage, death, xpGain).
// Wire in by setting `applyAction: combatApplyAction` in your TurnSystemDeps.

import type { TurnSystemState, TurnSystemDeps } from "./turnSystem";
import type { ActorId, MonsterActor } from "./turnTypes";
import type { TurnAction } from "./turnTypes";

/**
 * Drop-in replacement for defaultApplyAction that resolves melee combat on bump.
 *
 * For move actions:
 *   - If the target cell contains a hostile actor → resolve combat (no movement).
 *   - If the target cell is walkable and empty → move as normal.
 *   - Otherwise → no-op (blocked wall / same-faction actor).
 *
 * All other action kinds (wait, interact, explicit attack) are no-ops for now.
 */
export function combatApplyAction(
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

  // Check for a blocking actor at the target cell.
  for (const other of Object.values(state.actors)) {
    if (other.id === actorId) continue;
    if (!other.alive || !other.blocksMovement) continue;
    if (other.x !== nx || other.y !== ny) continue;

    // Only player ↔ monster interactions are hostile.
    const isHostile =
      (actor.kind === "player" && other.kind === "monster") ||
      (actor.kind === "monster" && other.kind === "player");

    if (!isHostile) return state; // same faction — blocked, no attack

    return resolveCombat(state, actorId, other.id, deps);
  }

  // No blocking actor — attempt tile walkability.
  if (!deps.isWalkable(nx, ny)) return state;

  return {
    ...state,
    actors: { ...state.actors, [actorId]: { ...actor, x: nx, y: ny } },
  };
}

/**
 * Apply one melee exchange: compute damage, update target HP, emit events.
 * The attacker does not move — only the target's state changes.
 */
function resolveCombat(
  state: TurnSystemState,
  attackerId: ActorId,
  targetId: ActorId,
  deps: TurnSystemDeps,
): TurnSystemState {
  const attacker = state.actors[attackerId];
  const target = state.actors[targetId];
  if (!attacker || !target) return state;

  const attack = attacker.attack;
  const defense = target.defense;
  const damage = Math.max(1, attack - defense);

  const newHp = target.hp - damage;
  const died = newHp <= 0;

  deps.onEvent?.({
    kind: "damage",
    actorId: targetId,
    amount: damage,
    x: target.x,
    y: target.y,
  });

  if (died) {
    deps.onEvent?.({
      kind: "death",
      actorId: targetId,
      x: target.x,
      y: target.y,
    });

    // Award XP when the player kills a monster.
    if (attacker.kind === "player" && target.kind === "monster") {
      deps.onEvent?.({
        kind: "xpGain",
        amount: (target as MonsterActor).xp,
        x: target.x,
        y: target.y,
      });
    }
  }

  return {
    ...state,
    actors: {
      ...state.actors,
      [targetId]: { ...target, hp: newHp, alive: !died },
    },
  };
}
