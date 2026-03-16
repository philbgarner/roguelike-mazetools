// src/turn/actionCosts.ts
//
// Timing constants and cost computation.
// Reference: https://roguebasin.com/index.php/A_priority_queue_based_turn_scheduling_system

import type { TurnAction } from "./turnTypes";

/** Base time unit. A speed-1 actor costs BASE_TIME per turn; speed-10 costs BASE_TIME/10. */
export const BASE_TIME = 100;

const ACTION_MULTIPLIER: Record<TurnAction["kind"], number> = {
  wait: 1.0,
  move: 1.0,
  attack: 2.0,
  interact: 1.5,
};

/**
 * Compute the scheduler delay for an actor with the given speed performing the given action.
 * Faster actors (higher speed) get smaller delays.
 */
export function actionDelay(speed: number, action: TurnAction): number {
  const mult = ACTION_MULTIPLIER[action.kind] ?? 1.0;
  return (BASE_TIME / speed) * mult;
}

export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}
