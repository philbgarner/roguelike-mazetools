// src/factions.ts
//
// Faction registry — configurable stance rules between named factions.
// Pure data, no engine or dungeon dependencies.

export type FactionId = string;

export type FactionStance = "hostile" | "neutral" | "friendly";

export type FactionRegistry = {
  /**
   * Register a relationship. Relationships are directional:
   * setStance("orc", "player", "hostile") does not automatically
   * set player→orc. Call symmetrically if needed.
   */
  setStance(from: FactionId, to: FactionId, stance: FactionStance): void;

  /** Returns the stance of `from` toward `to`. Default: "neutral". */
  getStance(from: FactionId, to: FactionId): FactionStance;

  /** Returns true if `from` treats `to` as hostile. */
  isHostile(from: FactionId, to: FactionId): boolean;
};

/** Create a new empty faction registry. */
export function createFactionRegistry(): FactionRegistry {
  const stances = new Map<string, FactionStance>();

  function key(from: FactionId, to: FactionId): string {
    return `${from}\0${to}`;
  }

  return {
    setStance(from, to, stance) {
      stances.set(key(from, to), stance);
    },
    getStance(from, to) {
      return stances.get(key(from, to)) ?? "neutral";
    },
    isHostile(from, to) {
      return stances.get(key(from, to)) === "hostile";
    },
  };
}

/**
 * Convenience: build a registry from a stance table.
 *
 * Example:
 *   createFactionRegistryFromTable([
 *     ["player", "monster", "hostile"],
 *     ["monster", "player", "hostile"],
 *     ["merchant", "player", "neutral"],
 *   ])
 */
export function createFactionRegistryFromTable(
  table: Array<[FactionId, FactionId, FactionStance]>,
): FactionRegistry {
  const registry = createFactionRegistry();
  for (const [from, to, stance] of table) {
    registry.setStance(from, to, stance);
  }
  return registry;
}
