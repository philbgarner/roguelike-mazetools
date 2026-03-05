/**
 * Item template definitions.
 *
 * Templates define the identity (name, glyph, type) of an item.
 * Stat bonuses (bonusAttack, bonusDefense, bonusMaxHp) are NOT stored here —
 * they are computed at dungeon generation time based on dungeon level and the
 * XP budget available after placing monsters.
 */

export type ItemType = "weapon" | "armor" | "trinket";

export type ItemTemplate = {
  id: string;
  name: string;
  glyph: string;
  type: ItemType;
};

export const ITEM_TEMPLATES: ItemTemplate[] = [
  // Weapons — grant bonusAttack
  { id: "sword",   name: "Sword",       glyph: "/",  type: "weapon"  },
  { id: "axe",     name: "Axe",         glyph: "\\", type: "weapon"  },
  { id: "dagger",  name: "Dagger",      glyph: "-",  type: "weapon"  },
  { id: "spear",   name: "Spear",       glyph: "|",  type: "weapon"  },

  // Armor — grant bonusDefense + bonusMaxHp
  { id: "shield",  name: "Shield",      glyph: ")",  type: "armor"   },
  { id: "mail",    name: "Chain Mail",  glyph: "[",  type: "armor"   },
  { id: "helm",    name: "Helm",        glyph: "^",  type: "armor"   },

  // Trinkets — grant small bonuses to all stats
  { id: "ring",    name: "Ring",        glyph: "=",  type: "trinket" },
  { id: "amulet",  name: "Amulet",      glyph: "\"", type: "trinket" },
  { id: "charm",   name: "Charm",       glyph: "*",  type: "trinket" },
];

/** Look up a template by id. Returns undefined if not found. */
export function getItemTemplate(id: string): ItemTemplate | undefined {
  return ITEM_TEMPLATES.find((t) => t.id === id);
}
