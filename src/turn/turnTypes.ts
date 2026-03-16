// src/turn/turnTypes.ts
//
// Shared types for the priority-queue turn system.

export type ActorId = string;

export type ActorKind = "player" | "monster";

export type ActorBase = {
  id: ActorId;
  kind: ActorKind;
  x: number;
  y: number;
  /** >0; higher speed = acts more often. */
  speed: number;
  alive: boolean;
  blocksMovement: boolean;
};

export type PlayerActor = ActorBase & {
  kind: "player";
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
};

/**
 * Alert state machine:
 *   idle      – unaware of player
 *   chasing   – actively pursuing
 *   searching – lost sight; counting down before giving up
 */
export type MonsterAlertState = "idle" | "chasing" | "searching";

export type MonsterActor = ActorBase & {
  kind: "monster";
  /** Display name. */
  name: string;
  /** Single ASCII glyph for rendering. */
  glyph: string;
  /** 0–10 scale — influences detection radius and persistence. */
  danger: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
  alertState: MonsterAlertState;
  searchTurnsLeft: number;
  lastKnownPlayerPos: { x: number; y: number } | null;
};

export type TurnActionKind = "wait" | "move" | "attack" | "interact";

export type TurnAction = {
  kind: TurnActionKind;
  dx?: number;
  dy?: number;
  targetId?: ActorId;
  meta?: Record<string, unknown>;
};

export type ActionCost = {
  time: number;
};
