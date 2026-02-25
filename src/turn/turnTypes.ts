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

export type PlayerActor = ActorBase & { kind: "player" };

export type MonsterActor = ActorBase & {
  kind: "monster";
  spawnId: string;
  danger: number;
  roomId: number;
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
