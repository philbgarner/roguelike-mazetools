// src/world/worldEffects.ts
//
// Minimal world-effects clock that converts scheduler time into discrete ticks.
//
// As scheduler time advances (via onTimeAdvanced in TurnSystemDeps), call
// advanceWorldEffects to accumulate fractional time and convert it into whole
// "effect ticks". When ticks > 0 you can step water / fire propagation, etc.
//
// The carry ensures no time is lost to integer truncation — sub-tick time
// accumulates across multiple calls and triggers a tick when it overflows.

export type WorldEffectsState = {
  /** Fractional time carried over from the last call (not yet a full tick). */
  carry: number;
};

/** Default time quantum per world-effect tick (same scale as actionDelay units). */
export const DEFAULT_EFFECT_TICK = 10;

export function createWorldEffectsState(): WorldEffectsState {
  return { carry: 0 };
}

/**
 * Advance the world-effects clock by `deltaTime` scheduler units.
 *
 * Returns the updated state and how many full ticks elapsed.
 * The caller is responsible for applying the actual effects `ticks` times.
 */
export function advanceWorldEffects(
  state: WorldEffectsState,
  deltaTime: number,
  tickSize: number = DEFAULT_EFFECT_TICK,
): { next: WorldEffectsState; ticks: number } {
  const total = state.carry + deltaTime;
  const ticks = Math.floor(total / tickSize);
  const carry = total - ticks * tickSize;
  return { next: { ...state, carry }, ticks };
}
