// src/turn/turnTypes.ts
//
// Shared types for the priority-queue turn system.
// Generator-independent; works with both API result and direct generator output.

export type ActorId = string;

export type ActorKind = "player" | "monster";

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
  /** Single ASCII/Unicode glyph from the stat block, used for rendering. */
  glyph: string;
  danger: number;
  roomId: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
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
