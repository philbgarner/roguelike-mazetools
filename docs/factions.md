# Factions & Allegiance — `src/factions.ts`

Configurable stance registry for turn-based combat. Pure data layer — no engine or dungeon dependencies. The consuming game passes `factionRegistry.isHostile(a.faction, b.faction)` as a guard inside its action validation or AI decision code.

---

## Types

### `FactionId`

```ts
type FactionId = string;
```

### `FactionStance`

```ts
type FactionStance = "hostile" | "neutral" | "friendly";
```

### `FactionRegistry`

```ts
type FactionRegistry = {
  /**
   * Register a directional relationship.
   * setStance("orc", "player", "hostile") does NOT automatically set player→orc.
   * Call symmetrically for mutual hostility.
   */
  setStance(from: FactionId, to: FactionId, stance: FactionStance): void;

  /** Returns the stance of `from` toward `to`. Unregistered pairs default to "neutral". */
  getStance(from: FactionId, to: FactionId): FactionStance;

  /** Returns true if `from` treats `to` as hostile. */
  isHostile(from: FactionId, to: FactionId): boolean;
};
```

---

## Functions

### `createFactionRegistry()`

```ts
function createFactionRegistry(): FactionRegistry
```

Create a new empty faction registry. All `getStance` calls return `"neutral"` until stances are registered.

### `createFactionRegistryFromTable(table)`

```ts
function createFactionRegistryFromTable(
  table: Array<[FactionId, FactionId, FactionStance]>,
): FactionRegistry
```

Convenience factory: build a registry from a flat stance table.

---

## Examples

### Basic setup

```ts
import { createFactionRegistryFromTable } from "./src/factions";

const factions = createFactionRegistryFromTable([
  ["player",   "monster",  "hostile"],
  ["monster",  "player",   "hostile"],
  ["monster",  "monster",  "neutral"],  // monsters don't fight each other
  ["merchant", "player",   "neutral"],
  ["merchant", "monster",  "hostile"],  // merchants run from monsters
  ["monster",  "merchant", "hostile"],
]);

factions.isHostile("monster", "player");   // true
factions.isHostile("merchant", "player");  // false
factions.getStance("player", "merchant"); // "neutral"
```

### Dynamic stance changes

```ts
const factions = createFactionRegistry();

factions.setStance("player", "bandits", "neutral"); // start neutral

// Player attacks bandits unprovoked
factions.setStance("bandits", "player", "hostile");
factions.setStance("player", "bandits", "hostile");
```

### Guard in AI decision

```ts
function canAttack(attacker: Actor, target: Actor): boolean {
  return factions.isHostile(attacker.faction, target.faction);
}
```

### Guard in action middleware (with `src/actions.ts`)

```ts
pipeline.use((ctx, next) => {
  if (ctx.action.kind === "attack") {
    const target = state.actors[ctx.action.targetId];
    if (!factions.isHostile(ctx.actor.faction, target.faction)) {
      return { pass: false, reason: "cannot attack a non-hostile faction" };
    }
  }
  return next();
});
```

---

## Notes

- Relationships are **directional**: `setStance("A", "B", "hostile")` only affects A's attitude toward B. Set both directions explicitly for mutual hostility.
- Unregistered pairs return `"neutral"` from `getStance` and `false` from `isHostile`.
- The registry is a plain object with no ties to dungeon or engine state — safe to create once at game startup and share globally.
