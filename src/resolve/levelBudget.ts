/**
 * XP budget system for dungeon level-gating.
 *
 * Budget formula: K * level^EXPONENT
 *
 * K is autotuned from the creature roster so that:
 *   - level 10 budget == maxCreatureXP (all creatures eligible at max level)
 *   - level 1 budget naturally gates out high-tier creatures
 *
 * EXPONENT = 1.3 produces a gentle curve that opens up mid-tier creatures
 * around levels 4-5 and high-tier creatures near the cap.
 */

export const BUDGET_EXPONENT = 1.3;
export const MAX_BUDGET_LEVEL = 10;

/**
 * Compute the budget constant K from the full set of creature XP values.
 * K = maxXP / MAX_LEVEL^EXPONENT
 */
export function computeBudgetK(allXpValues: number[]): number {
  const maxXp = Math.max(...allXpValues);
  return maxXp / Math.pow(MAX_BUDGET_LEVEL, BUDGET_EXPONENT);
}

/**
 * XP budget available for a dungeon of the given level.
 * Monsters whose base XP exceeds this are filtered out of the spawn table.
 */
export function xpBudgetForLevel(level: number, K: number): number {
  return K * Math.pow(Math.max(1, level), BUDGET_EXPONENT);
}

/**
 * The lowest dungeon level at which a creature with the given XP is eligible.
 * Derived by inverting xpBudgetForLevel.
 */
export function creatureUnlockLevel(creatureXp: number, K: number): number {
  if (K <= 0) return 1;
  return Math.ceil(Math.pow(creatureXp / K, 1 / BUDGET_EXPONENT));
}

/**
 * HP scale factor for a creature placed in a dungeon above its natural level.
 * Capped at 2× to prevent runaway stat inflation.
 */
export function hpScaleFactor(dungeonLevel: number, naturalLevel: number): number {
  if (naturalLevel <= 0) return 1;
  return Math.min(2.0, dungeonLevel / naturalLevel);
}
