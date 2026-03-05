/**
 * Merchant shop inventory generation.
 *
 * Items are seeded by the player's level + an NPC-specific seed so each wagon
 * has a stable but distinct inventory. Stats scale with player level and items
 * are priced so that a player can afford a few per visit if they've been
 * collecting gold.
 */

import { ITEM_TEMPLATES, ItemType } from "./data/itemData";

export type ShopItem = {
  instanceId: string;
  templateId: string;
  name: string;
  glyph: string;
  type: ItemType;
  bonusAttack: number;
  bonusDefense: number;
  bonusMaxHp: number;
  price: number;
};

/** Deterministic LCG — returns values in [0, 1). */
function seededRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return (): number => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

/**
 * Generate a shop inventory for a merchant wagon.
 *
 * @param playerLevel  Player's current level (1+).
 * @param npcSeed      Stable per-NPC seed (e.g. hash of position or NPC id).
 * @param itemCount    Number of distinct items to offer (default 5).
 */
export function generateShopInventory(
  playerLevel: number,
  npcSeed: number,
  itemCount = 5,
): ShopItem[] {
  const rng = seededRng(npcSeed ^ (playerLevel * 7919));
  const lvl = Math.max(1, playerLevel);
  const items: ShopItem[] = [];
  const usedTemplateIds = new Set<string>();

  for (let i = 0; i < itemCount; i++) {
    // Pick a template not already in the shop
    let templateIdx = 0;
    let attempts = 0;
    do {
      templateIdx = Math.floor(rng() * ITEM_TEMPLATES.length);
      attempts++;
    } while (usedTemplateIds.has(ITEM_TEMPLATES[templateIdx].id) && attempts < 30);

    const template = ITEM_TEMPLATES[templateIdx];
    usedTemplateIds.add(template.id);

    // Scale stats with level
    let bonusAttack = 0;
    let bonusDefense = 0;
    let bonusMaxHp = 0;

    if (template.type === "weapon") {
      bonusAttack = lvl + Math.floor(rng() * lvl);
    } else if (template.type === "armor") {
      bonusDefense = Math.max(1, Math.floor(lvl / 2) + Math.floor(rng() * 2));
      bonusMaxHp = lvl * 3 + Math.floor(rng() * lvl * 2);
    } else {
      // trinket — small bonuses to all stats
      bonusAttack = Math.floor(lvl / 4) + (rng() > 0.6 ? 1 : 0);
      bonusDefense = Math.floor(lvl / 5) + (rng() > 0.6 ? 1 : 0);
      bonusMaxHp = lvl + Math.floor(rng() * lvl);
    }

    // Price based on stat total; weapons cost more per point than hp
    const statValue = bonusAttack * 10 + bonusDefense * 8 + bonusMaxHp;
    const price = Math.max(5, Math.round(statValue * (0.9 + rng() * 0.3)));

    items.push({
      instanceId: `shop-${i}-lvl${lvl}-seed${npcSeed}`,
      templateId: template.id,
      name: template.name,
      glyph: template.glyph,
      type: template.type,
      bonusAttack,
      bonusDefense,
      bonusMaxHp,
      price,
    });
  }

  return items;
}

/** Stable numeric seed from an NPC actor id string. */
export function npcIdToSeed(npcId: string): number {
  let h = 0x12345678;
  for (let i = 0; i < npcId.length; i++) {
    h = Math.imul(h ^ npcId.charCodeAt(i), 0x9e3779b9);
  }
  return h >>> 0;
}
