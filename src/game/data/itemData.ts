/**
 * Item template definitions.
 *
 * Templates define the identity (name, glyph, type) of an item.
 * Stat bonuses (bonusAttack, bonusDefense, bonusMaxHp) are NOT stored here —
 * they are computed at dungeon generation time based on dungeon level and the
 * XP budget available after placing monsters.
 */

export type ItemType = "weapon" | "armor" | "trinket" | "consumable";

/**
 * Physical damage category for weapons.
 * Monsters may have weaknesses or resistances to specific damage types.
 */
export type DamageType = "slash" | "blunt" | "pierce";

/**
 * The equipment slot an item occupies when worn.
 * Each actor has at most one item per slot equipped at a time.
 */
export type EquipSlot =
  | "weapon"   // swords, axes, daggers, spears
  | "offhand"  // shields
  | "body"     // chain mail
  | "head"     // helms
  | "ring"
  | "amulet"
  | "charm";

export type ItemTemplate = {
  id: string;
  name: string;
  glyph: string;
  type: ItemType;
  /**
   * The equipment slot this item occupies when worn.
   * Undefined for consumables — they cannot be equipped.
   */
  slot?: EquipSlot;
  /** Damage type dealt by this weapon (weapons only). */
  damageType?: DamageType;
};

export const ITEM_TEMPLATES: ItemTemplate[] = [
  // Weapons — grant bonusAttack
  { id: "sword",  name: "Sword",      glyph: "/",  type: "weapon",  slot: "weapon",  damageType: "slash"  },
  { id: "axe",    name: "Axe",        glyph: "\\", type: "weapon",  slot: "weapon",  damageType: "blunt"  },
  { id: "dagger", name: "Dagger",     glyph: "-",  type: "weapon",  slot: "weapon",  damageType: "pierce" },
  { id: "spear",  name: "Spear",      glyph: "|",  type: "weapon",  slot: "weapon",  damageType: "pierce" },

  // Armor — grant bonusDefense + bonusMaxHp
  { id: "shield", name: "Shield",     glyph: ")",  type: "armor",   slot: "offhand" },
  { id: "mail",   name: "Chain Mail", glyph: "[",  type: "armor",   slot: "body"    },
  { id: "helm",   name: "Helm",       glyph: "^",  type: "armor",   slot: "head"    },

  // Trinkets — grant small bonuses to all stats
  { id: "ring",   name: "Ring",       glyph: "=",  type: "trinket", slot: "ring"    },
  { id: "amulet", name: "Amulet",     glyph: "\"", type: "trinket", slot: "amulet"  },
  { id: "charm",  name: "Charm",      glyph: "*",  type: "trinket", slot: "charm"   },

  // Healing potions — tier scales with player level (1: lvl 1+, 2: lvl 3+, 3: lvl 5+)
  { id: "heal_potion",   name: "Healing Potion",    glyph: "!", type: "consumable" },
  { id: "heal_potion_2", name: "Healing Potion II",  glyph: "!", type: "consumable" },
  { id: "heal_potion_3", name: "Healing Potion III", glyph: "!", type: "consumable" },

  // Timed buff potions — effects last a fixed number of player move steps
  { id: "power_potion",    name: "Power Potion",    glyph: "!", type: "consumable" },
  { id: "guard_potion",    name: "Guard Potion",    glyph: "!", type: "consumable" },
  { id: "speed_potion",    name: "Speed Elixir",    glyph: "!", type: "consumable" },
  { id: "vitality_potion", name: "Vitality Potion", glyph: "!", type: "consumable" },
];

/** Look up a template by id. Returns undefined if not found. */
export function getItemTemplate(id: string): ItemTemplate | undefined {
  return ITEM_TEMPLATES.find((t) => t.id === id);
}
