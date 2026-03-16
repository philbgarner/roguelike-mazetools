// src/turn/turnEvents.ts
//
// Typed game events emitted by the turn system and consumed by React components.
//
// Flow: applyAction → deps.onEvent(evt) → pendingEventsRef → useEffect flush

import type { ActorId } from "./turnTypes";

/** Damage dealt to any actor. */
export type DamageEvent = {
  kind: "damage";
  actorId: ActorId;
  amount: number;
  x: number;
  y: number;
};

/** An attack that failed to land. */
export type MissEvent = {
  kind: "miss";
  actorId: ActorId;
  x: number;
  y: number;
};

/** An actor died. */
export type DeathEvent = {
  kind: "death";
  actorId: ActorId;
  sourceId?: ActorId;
  x: number;
  y: number;
};

/** Player gains XP after a kill. */
export type XpGainEvent = {
  kind: "xpGain";
  amount: number;
  x: number;
  y: number;
};

/** Any actor recovers HP. */
export type HealEvent = {
  kind: "heal";
  actorId: ActorId;
  amount: number;
  x: number;
  y: number;
};

export type TurnEvent =
  | DamageEvent
  | MissEvent
  | DeathEvent
  | XpGainEvent
  | HealEvent;
