// src/turn/turnEvents.ts
//
// Typed game events emitted by the turn system and consumed by React components.
//
// Flow:
//   applyAction / AI callbacks → deps.onEvent(evt) → pendingEventsRef → useEffect flush
//
// Extend this union as new gameplay interactions are added (status effects, picks, etc.).

import type { ActorId } from "./turnTypes";
import type { DamageType } from "../game/data/itemData";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** Damage dealt to any actor (player or monster). */
export type DamageEvent = {
  kind: "damage";
  /** Recipient. */
  actorId: ActorId;
  /** Positive amount of HP lost. */
  amount: number;
  /** Grid position of the recipient at the time of the hit. */
  x: number;
  y: number;
  /** Damage type of the attacker's weapon, if any. */
  damageType?: DamageType;
  /** Whether a weakness or resistance was applied. */
  modifier?: "weak" | "resist";
};

/** An attack that failed to land (dodge / miss). */
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
  x: number;
  y: number;
};

/** Player gains XP (e.g. after a kill). */
export type XpGainEvent = {
  kind: "xpGain";
  amount: number;
  x: number;
  y: number;
};

/** Any actor recovers HP (potion, regen, etc.). */
export type HealEvent = {
  kind: "heal";
  actorId: ActorId;
  amount: number;
  x: number;
  y: number;
};

/** Player blocked an incoming attack with a shield. */
export type BlockEvent = {
  kind: "block";
  actorId: ActorId;
  x: number;
  y: number;
};

export type TurnEvent =
  | DamageEvent
  | MissEvent
  | DeathEvent
  | XpGainEvent
  | HealEvent
  | BlockEvent;
