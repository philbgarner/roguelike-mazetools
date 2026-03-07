/**
 * Merchant shop inventory generation.
 *
 * Each shop guarantees at least one weapon and one armor item, then fills the
 * remaining slots mostly with potions.  All items are seeded by the player's
 * level + an NPC-specific seed so each wagon has a stable but distinct
 * inventory that scales with player level.
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
  /** True if item is consumed on use (not equipped). */
  isConsumable: boolean;
  /** Healing potions: HP restored when used. */
  healAmount?: number;
  /** TTL buff potions: number of player move steps the effect lasts. */
  buffDuration?: number;
  /** TTL buff: speed bonus. */
  bonusSpeed?: number;
};

/** Deterministic LCG — returns values in [0, 1). */
function seededRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return (): number => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

const WEAPON_IDS = ["sword", "axe", "dagger", "spear", "bow", "crossbow", "javelin", "sling"];
const ARMOR_IDS  = ["shield", "mail", "helm"];

/** Which heal potion tier to stock based on player level. */
function healPotionTier(playerLevel: number): string[] {
  if (playerLevel >= 5) return ["heal_potion", "heal_potion_2", "heal_potion_3"];
  if (playerLevel >= 3) return ["heal_potion", "heal_potion_2"];
  return ["heal_potion"];
}

const TTL_POTION_IDS = [
  "power_potion",
  "guard_potion",
  "speed_potion",
  "vitality_potion",
];

/**
 * Generate stats for a heal potion by template id and player level.
 * Higher tiers heal more and cost more.
 */
function healPotionStats(
  templateId: string,
  lvl: number,
  rng: () => number,
): { healAmount: number; price: number } {
  let base: number;
  let scale: number;
  if (templateId === "heal_potion_3") {
    base = 40; scale = 8;
  } else if (templateId === "heal_potion_2") {
    base = 20; scale = 6;
  } else {
    base = 8; scale = 4;
  }
  const healAmount = base + lvl * scale + Math.floor(rng() * lvl * 2);
  const price = Math.max(5, Math.round(healAmount * (0.7 + rng() * 0.3)));
  return { healAmount, price };
}

/**
 * Generate stats for a timed-buff potion by template id and player level.
 */
function ttlPotionStats(
  templateId: string,
  lvl: number,
  rng: () => number,
): {
  bonusAttack: number;
  bonusDefense: number;
  bonusMaxHp: number;
  bonusSpeed: number;
  buffDuration: number;
  price: number;
} {
  let bonusAttack = 0;
  let bonusDefense = 0;
  let bonusMaxHp = 0;
  let bonusSpeed = 0;
  let buffDuration = 0;

  if (templateId === "power_potion") {
    bonusAttack = Math.max(1, Math.floor(lvl * 1.5) + Math.floor(rng() * lvl));
    buffDuration = 15;
  } else if (templateId === "guard_potion") {
    bonusDefense = Math.max(1, lvl + Math.floor(rng() * lvl));
    buffDuration = 15;
  } else if (templateId === "speed_potion") {
    bonusSpeed = 2 + Math.floor(lvl / 3);
    buffDuration = 20;
  } else {
    // vitality_potion
    bonusMaxHp = Math.max(3, lvl * 4 + Math.floor(rng() * lvl * 2));
    buffDuration = 20;
  }

  const statValue = bonusAttack * 10 + bonusDefense * 8 + bonusMaxHp + bonusSpeed * 12;
  const price = Math.max(8, Math.round((statValue * buffDuration) / 15 * (0.8 + rng() * 0.3)));
  return { bonusAttack, bonusDefense, bonusMaxHp, bonusSpeed, buffDuration, price };
}

/**
 * Generate a shop inventory for a merchant wagon.
 *
 * Always includes 1 weapon + 1 armor.  Remaining slots are mostly potions.
 *
 * @param playerLevel  Player's current level (1+).
 * @param npcSeed      Stable per-NPC seed (hash of position or NPC id).
 * @param itemCount    Total items to offer (default 6).
 */
export function generateShopInventory(
  playerLevel: number,
  npcSeed: number,
  itemCount = 6,
): ShopItem[] {
  const rng = seededRng(npcSeed ^ (playerLevel * 7919));
  const lvl = Math.max(1, playerLevel);
  const items: ShopItem[] = [];

  // ---- Guaranteed weapon ----
  const weaponTemplateId = WEAPON_IDS[Math.floor(rng() * WEAPON_IDS.length)];
  const weaponTemplate = ITEM_TEMPLATES.find((t) => t.id === weaponTemplateId)!;
  const wAttack = lvl + Math.floor(rng() * lvl);
  const wStatValue = wAttack * 10;
  items.push({
    instanceId: `shop-weapon-lvl${lvl}-seed${npcSeed}`,
    templateId: weaponTemplate.id,
    name: weaponTemplate.name,
    glyph: weaponTemplate.glyph,
    type: "weapon",
    bonusAttack: wAttack,
    bonusDefense: 0,
    bonusMaxHp: 0,
    price: Math.max(5, Math.round(wStatValue * (0.9 + rng() * 0.3))),
    isConsumable: false,
  });

  // ---- Guaranteed armor ----
  const armorTemplateId = ARMOR_IDS[Math.floor(rng() * ARMOR_IDS.length)];
  const armorTemplate = ITEM_TEMPLATES.find((t) => t.id === armorTemplateId)!;
  const aDef = Math.max(1, Math.floor(lvl / 2) + Math.floor(rng() * 2));
  const aHp  = lvl * 3 + Math.floor(rng() * lvl * 2);
  const aStatValue = aDef * 8 + aHp;
  items.push({
    instanceId: `shop-armor-lvl${lvl}-seed${npcSeed}`,
    templateId: armorTemplate.id,
    name: armorTemplate.name,
    glyph: armorTemplate.glyph,
    type: "armor",
    bonusAttack: 0,
    bonusDefense: aDef,
    bonusMaxHp: aHp,
    price: Math.max(5, Math.round(aStatValue * (0.9 + rng() * 0.3))),
    isConsumable: false,
  });

  // ---- Remaining slots: potions ----
  const availableHealTiers = healPotionTier(lvl);
  const potionSlots = Math.max(0, itemCount - 2);
  const usedPotionIds = new Set<string>();

  for (let i = 0; i < potionSlots; i++) {
    // 60% chance heal potion, 40% TTL potion
    const isHeal = rng() < 0.6;

    if (isHeal) {
      // Pick a heal tier; prefer higher tiers with higher level
      const tierIdx = Math.min(
        Math.floor(rng() * availableHealTiers.length),
        availableHealTiers.length - 1,
      );
      const templateId = availableHealTiers[tierIdx];
      const template = ITEM_TEMPLATES.find((t) => t.id === templateId)!;
      const { healAmount, price } = healPotionStats(templateId, lvl, rng);
      items.push({
        instanceId: `shop-heal-${i}-lvl${lvl}-seed${npcSeed}`,
        templateId,
        name: template.name,
        glyph: template.glyph,
        type: "consumable",
        bonusAttack: 0,
        bonusDefense: 0,
        bonusMaxHp: 0,
        price,
        isConsumable: true,
        healAmount,
      });
    } else {
      // Pick a TTL potion not already in the shop
      let ttlId = TTL_POTION_IDS[Math.floor(rng() * TTL_POTION_IDS.length)];
      let attempts = 0;
      while (usedPotionIds.has(ttlId) && attempts < 10) {
        ttlId = TTL_POTION_IDS[Math.floor(rng() * TTL_POTION_IDS.length)];
        attempts++;
      }
      usedPotionIds.add(ttlId);
      const template = ITEM_TEMPLATES.find((t) => t.id === ttlId)!;
      const stats = ttlPotionStats(ttlId, lvl, rng);
      items.push({
        instanceId: `shop-ttl-${i}-lvl${lvl}-seed${npcSeed}`,
        templateId: ttlId,
        name: template.name,
        glyph: template.glyph,
        type: "consumable",
        bonusAttack: stats.bonusAttack,
        bonusDefense: stats.bonusDefense,
        bonusMaxHp: stats.bonusMaxHp,
        price: stats.price,
        isConsumable: true,
        buffDuration: stats.buffDuration,
        bonusSpeed: stats.bonusSpeed > 0 ? stats.bonusSpeed : undefined,
      });
    }
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
