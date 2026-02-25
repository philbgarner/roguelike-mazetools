// src/turn/actionCosts.ts
//
// Shared timing constants and cost computation.
// All scheduling policy lives here so tuning stays centralized.
//
// Reference: https://roguebasin.com/index.php/A_priority_queue_based_turn_scheduling_system

import type { TurnAction } from "./turnTypes";

/**
 * Base time unit. Mirrors the RogueBasin example constant.
 * A speed-1 actor acting normally costs BASE_TIME per turn.
 * A speed-10 actor costs BASE_TIME / 10 — so it acts 10x as often.
 */
export const BASE_TIME = 100;

/**
 * Multiplier table by action kind.
 * Varying delay by action type is recommended in the RogueBasin article.
 */
const ACTION_MULTIPLIER: Record<TurnAction["kind"], number> = {
  wait: 1.0,
  move: 1.0,
  attack: 2.0,
  interact: 1.5,
};

/**
 * Compute the delay (in abstract time units) for an actor with the given
 * speed performing the given action.
 *
 * Faster actors (higher speed) get smaller delays, so they act more often.
 * The ratio of delays between two actors equals the inverse ratio of speeds.
 */
export function actionDelay(speed: number, action: TurnAction): number {
  const mult = ACTION_MULTIPLIER[action.kind] ?? 1.0;
  return (BASE_TIME / speed) * mult;
}

/**
 * Clamp a value into [min, max].
 */
export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}
