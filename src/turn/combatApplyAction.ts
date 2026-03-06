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
import type { ActorId, MonsterActor, PlayerActor } from "./turnTypes";
import type { TurnAction } from "./turnTypes";
import { getItemTemplate } from "../game/data/itemData";
import { getEquipped } from "../game/inventory";

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
  const attacker = state.actors[attackerId] as PlayerActor | MonsterActor;
  const target = state.actors[targetId] as PlayerActor | MonsterActor;
  if (!attacker || !target) return state;

  const attack = attacker.attack;
  const defense = target.defense;
  const baseDamage = Math.max(1, attack - defense);

  // Determine attacker's weapon damage type (player only — monsters deal typed damage via attackDamageType).
  let damageType = undefined;
  let modifier: "weak" | "resist" | undefined = undefined;
  let damage = baseDamage;

  if (attacker.kind === "player" && target.kind === "monster") {
    const equippedWeapon = getEquipped(attacker.inventory, "weapon");
    if (equippedWeapon) {
      const template = getItemTemplate(equippedWeapon.templateId);
      damageType = template?.damageType;
    }
    if (damageType) {
      if (target.weaknesses.includes(damageType)) {
        damage = Math.floor(baseDamage * 1.5);
        modifier = "weak";
      } else if (target.resistances.includes(damageType)) {
        damage = Math.max(1, Math.floor(baseDamage * 0.5));
        modifier = "resist";
      }
    }
  } else if (attacker.kind === "monster" && target.kind === "player") {
    // Shield block: ~1 in 20 chance to completely negate the attack.
    const shield = getEquipped((target as PlayerActor).inventory, "offhand");
    if (shield && Math.random() < 1 / 20) {
      deps.onEvent?.({
        kind: "block",
        actorId: targetId,
        x: target.x,
        y: target.y,
      });
      return state;
    }

    // Check if the player has resistance against this monster's attack type.
    const attackType = (attacker as MonsterActor).attackDamageType;
    if (attackType && (target as PlayerActor).resistances.includes(attackType)) {
      damage = Math.max(1, Math.floor(baseDamage * 0.75));
      modifier = "resist";
    }
  }

  const newHp = target.hp - damage;
  const died = newHp <= 0;

  deps.onEvent?.({
    kind: "damage",
    actorId: targetId,
    amount: damage,
    x: target.x,
    y: target.y,
    damageType,
    modifier,
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
      const xpAmount = (target as MonsterActor).xp;
      deps.onEvent?.({
        kind: "xpGain",
        amount: xpAmount,
        x: target.x,
        y: target.y,
      });
      // Update player's cumulative XP in state so level-up detection can read it.
      const player = attacker as PlayerActor;
      return {
        ...state,
        actors: {
          ...state.actors,
          [targetId]: { ...target, hp: newHp, alive: false },
          [attackerId]: { ...player, xp: player.xp + xpAmount },
        },
      };
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
