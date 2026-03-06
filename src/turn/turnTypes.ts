// src/turn/turnTypes.ts
//
// Shared types for the priority-queue turn system.
// Generator-independent; works with both API result and direct generator output.

import { Inventory } from "../game/inventory";
import type { DamageType } from "../game/data/itemData";
import type { ActiveBuff } from "../game/activeBuffs";

export type ActorId = string;

export type ActorKind = "player" | "monster" | "npc";

export type ActorBase = {
  id: ActorId;
  kind: ActorKind;
  x: number;
  y: number;
  /** >0; used to compute delay. Higher speed = smaller delay = acts more often. */
  speed: number;
  alive: boolean;
  blocksMovement: boolean;
};

export type PlayerActor = ActorBase & {
  kind: "player";
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  attack: number;
  defense: number;
  gold: number;
  inventory: Inventory;
  /** Damage types that deal 25% less damage to the player. */
  resistances: DamageType[];
  /** Currently active timed buff potions. */
  activeBuffs: ActiveBuff[];
};

/**
 * Alert state machine for monster AI:
 *   idle      – not aware of player; waits or patrols
 *   chasing   – has seen the player; actively pursuing
 *   searching – lost sight; counting down before giving up
 */
export type MonsterAlertState = "idle" | "chasing" | "searching";

export type MonsterActor = ActorBase & {
  kind: "monster";
  spawnId: string;
  /** Display name from the stat block. */
  name: string;
  /** Single ASCII/Unicode glyph from the stat block, used for rendering. */
  glyph: string;
  danger: number;
  roomId: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
  /** Items the monster is carrying / has equipped. */
  inventory: Inventory;
  /** Damage types that deal 1.5× damage to this monster. */
  weaknesses: DamageType[];
  /** Damage types that deal 0.5× damage to this monster. */
  resistances: DamageType[];
  /** Damage type this monster deals when attacking the player. */
  attackDamageType?: DamageType;
  /** Current awareness state. */
  alertState: MonsterAlertState;
  /**
   * Turns remaining before an alerted monster gives up and goes idle.
   * Only meaningful when alertState === "searching"; ignored otherwise.
   */
  searchTurnsLeft: number;
  /**
   * Last known player position — used for pathfinding while searching.
   * null when alertState === "idle".
   */
  lastKnownPlayerPos: { x: number; y: number } | null;
};

export type NpcActor = ActorBase & {
  kind: "npc";
  /** Single ASCII/Unicode glyph for rendering. */
  glyph: string;
  npcType: "merchant_wagon";
  /** Index into the portals array for the current travel destination. */
  targetPortalIndex: number;
  /** Index into the portals array for the portal the NPC came from. */
  sourcePortalIndex: number;
};

export type TurnActionKind = "wait" | "move" | "attack" | "interact";

export type TurnAction = {
  kind: TurnActionKind;
  /** For move actions: delta x */
  dx?: number;
  /** For move actions: delta y */
  dy?: number;
  /** For attack actions: target actor id */
  targetId?: ActorId;
  /** Future hooks: door/lever ids, item ids, etc. */
  meta?: Record<string, unknown>;
};

export type ActionCost = {
  /** The delay value used by the scheduler (RogueBasin: faster = smaller delay). */
  time: number;
};
