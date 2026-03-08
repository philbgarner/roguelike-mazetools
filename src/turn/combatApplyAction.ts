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
 * Bresenham line-of-sight check. Returns true if the path from (x0,y0) to
 * (x1,y1) passes through no unwalkable intermediate cells.
 */
function hasLineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  isWalkable: (x: number, y: number) => boolean,
): boolean {
  const absDx = Math.abs(x1 - x0);
  const absDy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = absDx - absDy;
  let x = x0;
  let y = y0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -absDy) { err -= absDy; x += sx; }
    if (e2 < absDx) { err += absDx; y += sy; }
    // Intermediate cell — must be walkable for the projectile to pass
    if (x !== x1 || y !== y1) {
      if (!isWalkable(x, y)) return false;
    }
  }
}

/**
 * Resolve a ranged attack: validate weapon, range, and line of sight,
 * then delegate to resolveCombat.
 */
function resolveRangedAttack(
  state: TurnSystemState,
  attackerId: ActorId,
  targetId: ActorId,
  deps: TurnSystemDeps,
): TurnSystemState {
  const attacker = state.actors[attackerId];
  const target = state.actors[targetId];
  if (!attacker || !target || !target.alive) return state;
  if (attacker.kind !== "player" || target.kind !== "monster") return state;

  const equippedWeapon = getEquipped((attacker as PlayerActor).inventory, "weapon");
  if (!equippedWeapon) return state;
  const template = getItemTemplate(equippedWeapon.templateId);
  if (!template?.isRanged || !template.range) return state;

  // Chebyshev distance check
  const dist = Math.max(
    Math.abs(target.x - attacker.x),
    Math.abs(target.y - attacker.y),
  );
  if (dist > template.range) return state;

  if (!hasLineOfSight(attacker.x, attacker.y, target.x, target.y, deps.isWalkable)) {
    return state;
  }

  return resolveCombat(state, attackerId, targetId, deps);
}

/**
 * Drop-in replacement for defaultApplyAction that resolves melee combat on bump
 * and ranged combat via explicit attack actions.
 *
 * For move actions:
 *   - If the target cell contains a hostile actor → resolve combat (no movement).
 *   - If the target cell is walkable and empty → move as normal.
 *   - Otherwise → no-op (blocked wall / same-faction actor).
 *
 * For attack actions with targetId:
 *   - If the player has a ranged weapon equipped and the target is in range with
 *     clear line of sight → resolve ranged combat.
 */
export function combatApplyAction(
  state: TurnSystemState,
  actorId: ActorId,
  action: TurnAction,
  deps: TurnSystemDeps,
): TurnSystemState {
  if (action.kind === "attack" && action.targetId) {
    return resolveRangedAttack(state, actorId, action.targetId, deps);
  }

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
      sourceId: attacker.id,
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

  // When the player hits a monster, immediately alert it so it starts chasing.
  if (attacker.kind === "player" && target.kind === "monster") {
    return {
      ...state,
      actors: {
        ...state.actors,
        [targetId]: {
          ...target,
          hp: newHp,
          alive: !died,
          alertState: "chasing" as const,
          lastKnownPlayerPos: { x: attacker.x, y: attacker.y },
          searchTurnsLeft: 0,
        },
      },
    };
  }

  return {
    ...state,
    actors: {
      ...state.actors,
      [targetId]: { ...target, hp: newHp, alive: !died },
    },
  };
}
