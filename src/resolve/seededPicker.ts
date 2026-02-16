/**
 * Seeded picker utilities — Session 5.
 *
 * Provides deterministic hashing and weighted random selection
 * for the resolver pipeline.
 */

import type { SpawnTable } from "../theme/themeTypes";

// ---------------------------------------------------------------------------
// hashSeed — deterministic composite key → uint32
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash of an arbitrary string key.
 *
 * Used to derive a per-entity seed from a composite key like
 * `"${seed}:${themeId}:${kind}:${stableId}"`.
 */
export function hashSeed(...parts: Array<string | number>): number {
  const key = parts.join(":");
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// seededFloat — derive a deterministic [0, 1) from a uint32 seed
// ---------------------------------------------------------------------------

/**
 * Single-step Mulberry32 to get a float in [0, 1).
 */
export function seededFloat(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
}

// ---------------------------------------------------------------------------
// pickWeighted — deterministic weighted random selection
// ---------------------------------------------------------------------------

/**
 * Pick a value from a weighted spawn table using a deterministic seed.
 *
 * Returns `null` if the table is empty (caller should handle gracefully).
 *
 * @param table  Weighted entries `{ value, weight }`
 * @param seed   A uint32 seed (typically from `hashSeed(...)`)
 */
export function pickWeighted<T>(table: SpawnTable<T>, seed: number): T | null {
  if (table.length === 0) return null;
  if (table.length === 1) return table[0].value;

  let totalWeight = 0;
  for (const entry of table) {
    totalWeight += entry.weight;
  }

  if (totalWeight <= 0) return table[0].value;

  const roll = seededFloat(seed) * totalWeight;
  let acc = 0;
  for (const entry of table) {
    acc += entry.weight;
    if (roll < acc) return entry.value;
  }

  // Floating-point edge case — return last entry
  return table[table.length - 1].value;
}
