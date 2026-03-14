// src/turn/turnDebug.ts
//
// Optional diagnostics for the turn system.
// Validates that "speed ratios produce turn ratios" as described in RogueBasin.
//
// Reference: https://roguebasin.com/index.php/A_priority_queue_based_turn_scheduling_system

import { TurnScheduler } from "./turnScheduler";
import { actionDelay } from "./actionCosts";
import type { TurnAction, ActorId } from "./turnTypes";

// ---------------------------------------------------------------------------
// Log entry type (stored in TurnSystemState.log)
// ---------------------------------------------------------------------------

export type TurnLogEntry = {
  /** Absolute scheduler time when the action occurred. */
  t: number;
  actorId: ActorId;
  action: TurnAction;
  /** Delay charged for this action. */
  cost: number;
};

// ---------------------------------------------------------------------------
// Console demo / verification function
// ---------------------------------------------------------------------------

/**
 * Run a standalone simulation of N turns with two actors at different speeds
 * and print the turn ratio to the console.
 *
 * Expected: a speed-10 actor should get ~10x as many turns as a speed-1 actor
 * over a long enough run.
 *
 * Usage (from browser console or a dev entrypoint):
 *   import { verifySpeedRatios } from "./turn/turnDebug";
 *   verifySpeedRatios();
 */
export function verifySpeedRatios(turns = 1000): void {
  const scheduler = new TurnScheduler();

  const speedFast = 10;
  const speedSlow = 1;
  const action: TurnAction = { kind: "move" };

  scheduler.add("fast", actionDelay(speedFast, action));
  scheduler.add("slow", actionDelay(speedSlow, action));

  const counts: Record<string, number> = { fast: 0, slow: 0 };

  for (let i = 0; i < turns; i++) {
    const evt = scheduler.next();
    if (!evt) break;
    counts[evt.actorId] = (counts[evt.actorId] ?? 0) + 1;
    const speed = evt.actorId === "fast" ? speedFast : speedSlow;
    scheduler.reschedule(evt.actorId, actionDelay(speed, action));
  }

  const ratio = counts.fast / (counts.slow || 1);
  console.log(
    `[turnDebug] After ${turns} turns: fast=${counts.fast}, slow=${counts.slow}`,
    `ratio=${ratio.toFixed(2)} (expected ~${speedFast / speedSlow})`,
  );
}

// ---------------------------------------------------------------------------
// Summary helper (for UI display)
// ---------------------------------------------------------------------------

/**
 * Summarize turn log entries per actor.
 */
export function summarizeLog(
  log: TurnLogEntry[],
): Record<ActorId, { turns: number; totalCost: number }> {
  const result: Record<ActorId, { turns: number; totalCost: number }> = {};
  for (const entry of log) {
    if (!result[entry.actorId]) result[entry.actorId] = { turns: 0, totalCost: 0 };
    result[entry.actorId].turns++;
    result[entry.actorId].totalCost += entry.cost;
  }
  return result;
}
