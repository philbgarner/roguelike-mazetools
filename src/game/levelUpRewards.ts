/**
 * Level-up reward generation.
 *
 * When the player crosses a level threshold, they are presented with 3 random
 * choices from a pool: stat boosts, damage-type resistances, and a level-scaled
 * item reward.
 */

import type { DamageType } from "./data/itemData";
import { ITEM_TEMPLATES } from "./data/itemData";
import { createInventoryItem } from "./inventory";
import type { InventoryItem } from "./inventory";

// ---------------------------------------------------------------------------
// Reward types
// ---------------------------------------------------------------------------

export type StatReward = {
  kind: "stat";
  label: string;
  hpBonus: number;
  attackBonus: number;
  defenseBonus: number;
};

export type ResistanceReward = {
  kind: "resistance";
  resistance: DamageType;
};

export type ItemReward = {
  kind: "item";
  item: InventoryItem;
};

export type LevelUpReward = StatReward | ResistanceReward | ItemReward;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  slash: "Slash",
  blunt: "Blunt",
  pierce: "Pierce",
};

/** Generate a level-appropriate item reward. */
function generateRewardItem(newLevel: number, rng: () => number): InventoryItem {
  const templates = ITEM_TEMPLATES;
  const template = templates[Math.floor(rng() * templates.length)];

  let attackBonus = 0;
  let defenseBonus = 0;
  let hpBonus = 0;

  if (template.type === "weapon") {
    attackBonus = Math.max(1, Math.floor(newLevel * 0.7 + rng() * newLevel * 0.6));
  } else if (template.type === "armor") {
    defenseBonus = Math.max(1, Math.floor(newLevel * 0.4 + rng() * newLevel * 0.3));
    hpBonus = Math.max(2, Math.floor(newLevel * 1.2 + rng() * newLevel * 0.8));
  } else {
    // trinket — small bonuses to several stats
    attackBonus = Math.floor(newLevel * 0.2 + rng() * newLevel * 0.2);
    defenseBonus = Math.floor(newLevel * 0.2 + rng() * newLevel * 0.2);
    hpBonus = Math.max(1, Math.floor(newLevel * 0.4 + rng() * newLevel * 0.4));
  }

  const value = Math.floor(newLevel * 25 + rng() * newLevel * 15);

  let nameOverride: string | undefined;
  if (attackBonus > 0) nameOverride = `${template.name} +${attackBonus}`;
  else if (defenseBonus > 0) nameOverride = `${template.name} +${defenseBonus}`;

  return createInventoryItem(
    `levelup_${Date.now()}_${Math.floor(rng() * 99999)}`,
    template,
    attackBonus,
    defenseBonus,
    hpBonus,
    value,
    nameOverride,
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate exactly 3 level-up reward choices for the player.
 *
 * The pool contains stat boosts, resistance options (for types the player
 * doesn't already have), and one item reward.  Three are selected at random.
 */
export function generateLevelUpRewards(
  newLevel: number,
  existingResistances: DamageType[],
  rng: () => number,
): LevelUpReward[] {
  const pool: LevelUpReward[] = [
    { kind: "stat", label: `+${6 + newLevel} Max HP`,   hpBonus: 6 + newLevel, attackBonus: 0, defenseBonus: 0 },
    { kind: "stat", label: "+2 Attack",                  hpBonus: 0, attackBonus: 2, defenseBonus: 0 },
    { kind: "stat", label: "+2 Defense",                 hpBonus: 0, attackBonus: 0, defenseBonus: 2 },
    { kind: "stat", label: `+${3 + Math.floor(newLevel / 2)} HP & +1 Attack`, hpBonus: 3 + Math.floor(newLevel / 2), attackBonus: 1, defenseBonus: 0 },
    { kind: "stat", label: `+${3 + Math.floor(newLevel / 2)} HP & +1 Defense`, hpBonus: 3 + Math.floor(newLevel / 2), attackBonus: 0, defenseBonus: 1 },
  ];

  // Offer resistances the player doesn't already have.
  const allTypes: DamageType[] = ["slash", "blunt", "pierce"];
  for (const dt of allTypes) {
    if (!existingResistances.includes(dt)) {
      pool.push({ kind: "resistance", resistance: dt });
    }
  }

  // Always include an item option.
  pool.push({ kind: "item", item: generateRewardItem(newLevel, rng) });

  // Fisher-Yates shuffle then take first 3.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, 3);
}

/** Human-readable label for a damage type resistance. */
export function resistanceLabel(dt: DamageType): string {
  return `${DAMAGE_TYPE_LABELS[dt]} Resistance`;
}
