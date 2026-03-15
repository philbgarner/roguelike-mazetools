# Status Effects — `src/effects.ts`

Active buff and debuff system. Pure functions with no engine or dungeon dependencies. The consuming game holds `ActiveEffect[]` on each actor and calls `tickEffects` from the turn scheduler's time-advance hook.

---

## Types

### `EffectId`

```ts
type EffectId = string;
```

### `EffectDelta`

Arbitrary key-value payload applied to an actor when an effect ticks or expires.

```ts
type EffectDelta = Record<string, number>;
```

### `EffectTick`

```ts
type EffectTick = {
  /**
   * Called at the start of each affected actor's turn (or each world tick).
   * Return a delta to apply, or undefined for no change.
   * The engine does not interpret the delta — the game applies it.
   */
  onTick?: (effect: ActiveEffect, stepIndex: number) => EffectDelta | undefined;

  /** Called when stepsRemaining reaches 0. */
  onExpire?: (effect: ActiveEffect) => EffectDelta | undefined;
};
```

### `ActiveEffect`

```ts
type ActiveEffect = {
  id: EffectId;
  name: string;           // display name
  stepsRemaining: number;
  /** Arbitrary payload: damage per tick, stat bonuses, etc. */
  data: Record<string, number>;
  ticks: EffectTick;
};
```

### `StackMode`

Controls how `applyEffect` merges an incoming effect with an existing one of the same `id`.

```ts
type StackMode = "refresh" | "extend" | "ignore" | "stack";
```

| Mode | Behaviour |
|------|-----------|
| `"refresh"` | Resets `stepsRemaining` to the incoming value (default) |
| `"extend"` | Adds incoming `stepsRemaining` to the existing value |
| `"ignore"` | Keeps the existing effect unchanged |
| `"stack"` | Adds as an independent instance regardless of existing entries |

---

## Functions

### `tickEffects(effects, stepIndex)`

```ts
function tickEffects(
  effects: ActiveEffect[],
  stepIndex: number,
): {
  updatedEffects: ActiveEffect[];
  deltas: EffectDelta[];
}
```

Advance all effects by one step. Returns:
- `updatedEffects` — effects with `stepsRemaining > 0` after decrement (pure, does not mutate input)
- `deltas` — all `onTick` and `onExpire` deltas collected in order

### `applyEffect(effects, incoming, stackMode?)`

```ts
function applyEffect(
  effects: ActiveEffect[],
  incoming: ActiveEffect,
  stackMode?: StackMode, // default: "refresh"
): ActiveEffect[]
```

Apply a new effect to a list, merging stacks when an effect with the same `id` already exists. Pure — returns a new array.

---

## Examples

### Poison that deals damage every turn

```ts
import { applyEffect, tickEffects } from "./src/effects";
import type { ActiveEffect } from "./src/effects";

const POISON: ActiveEffect = {
  id: "poison",
  name: "Poison",
  stepsRemaining: 6,
  data: { damagePerTick: 3 },
  ticks: {
    onTick: (effect) => ({ hp: -effect.data.damagePerTick }),
  },
};

// Apply poison (refresh if already poisoned)
actor.effects = applyEffect(actor.effects, POISON, "refresh");

// Each turn:
const { updatedEffects, deltas } = tickEffects(actor.effects, stepIndex);
actor.effects = updatedEffects;
for (const delta of deltas) {
  actor.hp = (actor.hp ?? 0) + (delta.hp ?? 0); // apply damage
}
```

### Speed buff that cleans up on expiry

```ts
const HASTE: ActiveEffect = {
  id: "haste",
  name: "Haste",
  stepsRemaining: 10,
  data: { bonusSpeed: 3 },
  ticks: {
    onExpire: (effect) => ({ speed: -effect.data.bonusSpeed }),
  },
};

// Apply and immediately grant bonus
actor.speed += HASTE.data.bonusSpeed;
actor.effects = applyEffect(actor.effects, HASTE);

// On expiry the delta removes the bonus automatically
```

### Stacking bleed (multiple independent instances)

```ts
const BLEED: ActiveEffect = {
  id: "bleed",
  name: "Bleed",
  stepsRemaining: 3,
  data: { damagePerTick: 2 },
  ticks: {
    onTick: (e) => ({ hp: -e.data.damagePerTick }),
  },
};

actor.effects = applyEffect(actor.effects, BLEED, "stack"); // adds a new instance each hit
```

---

## Notes

- `tickEffects` is pure — it never mutates the input array. Always reassign `actor.effects = updatedEffects`.
- `deltas` from `onTick` run **before** `onExpire` in the output array. The game applies them in order.
- The engine never interprets `EffectDelta` values — the game maps key names to actor fields.
- Recommended integration: call `tickEffects` from the turn scheduler's `onTimeAdvanced` hook (before AI/action logic runs for that actor's turn).
