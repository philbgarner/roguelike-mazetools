/**
 * Stat blocks for all spawnable entities across the five dungeon themes.
 *
 * Themes: cave (lvl 1-2) | ruins (lvl 3-4) | crypt (lvl 5-6) |
 *         temple (lvl 7-8) | lair (lvl 9-10)
 *
 * Creature speed reference (player = 10).
 * HP / attack / defense are abstract units for the combat resolver.
 * xp is awarded to the player on kill; 0 for friendly NPCs.
 */

import type { DamageType } from "../../game/data/itemData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatureStatBlock = {
  /** Single ASCII/Unicode glyph for rendering. */
  glyph: string;
  /** Display name. */
  name: string;
  /** Acts per BASE_TIME ticks; player = 10. */
  speed: number;
  /** Maximum hit points. */
  hp: number;
  /** Base damage per attack. */
  attack: number;
  /** Flat damage reduction per hit. */
  defense: number;
  /** Experience awarded on kill (0 = friendly / neutral). */
  xp: number;
  /** Damage types that deal 1.5× damage to this creature. */
  weaknesses?: DamageType[];
  /** Damage types that deal 0.5× damage to this creature. */
  resistances?: DamageType[];
  /** Damage type this creature deals when attacking (for player resistance checks). */
  attackDamageType?: DamageType;
};

export type PropStatBlock = {
  glyph: string;
  name: string;
  /** Blocks tile movement when true. */
  solid: boolean;
  /** Player can interact (examine, pull lever, etc.). */
  interactable: boolean;
};

export type LootStatBlock = {
  glyph: string;
  name: string;
  /** Base gold value. */
  value: number;
};

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

export const MONSTER_STATS: Record<string, CreatureStatBlock> = {
  // ── Cave (levels 1-2) ────────────────────────────────────────────────────
  cave_bat: {
    glyph: "b",
    name: "Cave Bat",
    speed: 14,
    hp: 5,
    attack: 2,
    defense: 0,
    xp: 8,
    weaknesses: ["blunt"],
    resistances: ["pierce"],
    attackDamageType: "slash",
  },
  giant_spider: {
    glyph: "s",
    name: "Giant Spider",
    speed: 10,
    hp: 10,
    attack: 3,
    defense: 1,
    xp: 14,
    weaknesses: ["slash"],
    resistances: ["blunt"],
    attackDamageType: "pierce",
  },
  blind_crawler: {
    glyph: "c",
    name: "Blind Crawler",
    speed: 7,
    hp: 16,
    attack: 4,
    defense: 2,
    xp: 18,
    weaknesses: ["pierce"],
    resistances: ["blunt"],
    attackDamageType: "blunt",
  },
  rock_sprite: {
    glyph: "r",
    name: "Rock Sprite",
    speed: 10,
    hp: 8,
    attack: 3,
    defense: 1,
    xp: 12,
    weaknesses: ["blunt"],
    resistances: ["slash", "pierce"],
    attackDamageType: "blunt",
  },

  // ── Ruins (levels 3-4) ───────────────────────────────────────────────────
  feral_dog: {
    glyph: "d",
    name: "Feral Dog",
    speed: 13,
    hp: 8,
    attack: 4,
    defense: 0,
    xp: 16,
    weaknesses: ["blunt"],
    resistances: ["pierce"],
    attackDamageType: "slash",
  },
  stone_sentinel: {
    glyph: "S",
    name: "Stone Sentinel",
    speed: 8,
    hp: 22,
    attack: 5,
    defense: 5,
    xp: 28,
    weaknesses: ["blunt"],
    resistances: ["slash", "pierce"],
    attackDamageType: "blunt",
  },
  vine_stalker: {
    glyph: "v",
    name: "Vine Stalker",
    speed: 10,
    hp: 14,
    attack: 5,
    defense: 1,
    xp: 22,
    weaknesses: ["slash"],
    resistances: ["pierce"],
    attackDamageType: "slash",
  },
  tomb_rat: {
    glyph: "R",
    name: "Tomb Rat",
    speed: 12,
    hp: 6,
    attack: 3,
    defense: 0,
    xp: 10,
    weaknesses: ["blunt"],
    resistances: ["pierce"],
    attackDamageType: "pierce",
  },

  // ── Crypt (levels 5-6) ───────────────────────────────────────────────────
  skeleton: {
    glyph: "s",
    name: "Skeleton",
    speed: 10,
    hp: 14,
    attack: 4,
    defense: 2,
    xp: 22,
    weaknesses: ["blunt"],
    resistances: ["slash", "pierce"],
    attackDamageType: "slash",
  },
  zombie: {
    glyph: "z",
    name: "Zombie",
    speed: 7,
    hp: 20,
    attack: 5,
    defense: 2,
    xp: 24,
    weaknesses: ["slash"],
    resistances: ["blunt"],
    attackDamageType: "blunt",
  },
  wight: {
    glyph: "w",
    name: "Wight",
    speed: 10,
    hp: 12,
    attack: 7,
    defense: 1,
    xp: 32,
    weaknesses: ["slash"],
    resistances: ["pierce"],
    attackDamageType: "slash",
  },
  shadow: {
    glyph: "h",
    name: "Shadow",
    speed: 12,
    hp: 8,
    attack: 6,
    defense: 0,
    xp: 28,
    weaknesses: ["pierce"],
    resistances: ["blunt", "slash"],
    attackDamageType: "pierce",
  },

  // ── Temple (levels 7-8) ──────────────────────────────────────────────────
  temple_zealot: {
    glyph: "Z",
    name: "Temple Zealot",
    speed: 10,
    hp: 18,
    attack: 6,
    defense: 3,
    xp: 35,
    weaknesses: ["blunt"],
    resistances: ["slash"],
    attackDamageType: "blunt",
  },
  stone_idol: {
    glyph: "I",
    name: "Stone Idol",
    speed: 8,
    hp: 28,
    attack: 7,
    defense: 6,
    xp: 40,
    weaknesses: ["blunt"],
    resistances: ["slash", "pierce"],
    attackDamageType: "blunt",
  },
  flame_cleric: {
    glyph: "f",
    name: "Flame Cleric",
    speed: 10,
    hp: 16,
    attack: 8,
    defense: 2,
    xp: 38,
    weaknesses: ["pierce"],
    resistances: ["blunt"],
    attackDamageType: "pierce",
  },
  divine_construct: {
    glyph: "D",
    name: "Divine Construct",
    speed: 10,
    hp: 24,
    attack: 7,
    defense: 5,
    xp: 42,
    weaknesses: ["pierce"],
    resistances: ["slash"],
    attackDamageType: "blunt",
  },

  // ── Lair (levels 9-10) ───────────────────────────────────────────────────
  pit_fiend: {
    glyph: "F",
    name: "Pit Fiend",
    speed: 10,
    hp: 22,
    attack: 8,
    defense: 3,
    xp: 50,
    weaknesses: ["pierce"],
    resistances: ["blunt"],
    attackDamageType: "slash",
  },
  chaos_brute: {
    glyph: "B",
    name: "Chaos Brute",
    speed: 8,
    hp: 32,
    attack: 9,
    defense: 5,
    xp: 55,
    weaknesses: ["pierce"],
    resistances: ["slash"],
    attackDamageType: "blunt",
  },
  warlord_grunt: {
    glyph: "g",
    name: "Warlord Grunt",
    speed: 12,
    hp: 18,
    attack: 9,
    defense: 2,
    xp: 48,
    weaknesses: ["slash"],
    resistances: ["blunt"],
    attackDamageType: "slash",
  },
  abomination: {
    glyph: "A",
    name: "Abomination",
    speed: 8,
    hp: 36,
    attack: 10,
    defense: 6,
    xp: 60,
    weaknesses: ["blunt"],
    resistances: ["slash", "pierce"],
    attackDamageType: "blunt",
  },
};

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

export const BOSS_STATS: Record<string, CreatureStatBlock> = {
  // ── Cave ─────────────────────────────────────────────────────────────────
  cave_troll: {
    glyph: "T",
    name: "Cave Troll",
    speed: 8,
    hp: 55,
    attack: 9,
    defense: 6,
    xp: 160,
    weaknesses: ["slash"],
    resistances: ["blunt"],
    attackDamageType: "blunt",
  },
  nest_mother: {
    glyph: "M",
    name: "Nest Mother",
    speed: 8,
    hp: 45,
    attack: 7,
    defense: 3,
    xp: 140,
    weaknesses: ["slash"],
    resistances: ["pierce"],
    attackDamageType: "pierce",
  },

  // ── Ruins ─────────────────────────────────────────────────────────────────
  ruined_golem: {
    glyph: "G",
    name: "Ruined Golem",
    speed: 7,
    hp: 70,
    attack: 11,
    defense: 8,
    xp: 250,
    weaknesses: ["blunt"],
    resistances: ["slash", "pierce"],
    attackDamageType: "blunt",
  },
  ruin_guardian: {
    glyph: "U",
    name: "Ruin Guardian",
    speed: 8,
    hp: 60,
    attack: 9,
    defense: 7,
    xp: 210,
    weaknesses: ["blunt"],
    resistances: ["pierce"],
    attackDamageType: "blunt",
  },

  // ── Crypt ─────────────────────────────────────────────────────────────────
  crypt_keeper: {
    glyph: "K",
    name: "Crypt Keeper",
    speed: 10,
    hp: 75,
    attack: 12,
    defense: 5,
    xp: 320,
    weaknesses: ["blunt"],
    resistances: ["slash", "pierce"],
    attackDamageType: "slash",
  },
  death_knight: {
    glyph: "N",
    name: "Death Knight",
    speed: 10,
    hp: 90,
    attack: 14,
    defense: 9,
    xp: 400,
    weaknesses: ["pierce"],
    resistances: ["blunt"],
    attackDamageType: "slash",
  },

  // ── Temple ────────────────────────────────────────────────────────────────
  high_oracle: {
    glyph: "O",
    name: "High Oracle",
    speed: 10,
    hp: 100,
    attack: 14,
    defense: 7,
    xp: 500,
    weaknesses: ["pierce"],
    resistances: ["slash"],
    attackDamageType: "pierce",
  },
  the_chosen: {
    glyph: "C",
    name: "The Chosen",
    speed: 12,
    hp: 85,
    attack: 16,
    defense: 6,
    xp: 480,
    weaknesses: ["blunt"],
    resistances: ["pierce"],
    attackDamageType: "slash",
  },

  // ── Lair ──────────────────────────────────────────────────────────────────
  warlord_chief: {
    glyph: "W",
    name: "Warlord Chief",
    speed: 10,
    hp: 120,
    attack: 18,
    defense: 10,
    xp: 700,
    weaknesses: ["slash"],
    resistances: ["pierce"],
    attackDamageType: "slash",
  },
  the_devourer: {
    glyph: "X",
    name: "The Devourer",
    speed: 8,
    hp: 150,
    attack: 20,
    defense: 8,
    xp: 900,
    resistances: ["slash", "blunt", "pierce"],
    attackDamageType: "blunt",
  },
};

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

export const NPC_STATS: Record<string, CreatureStatBlock> = {
  // ── Cave ─────────────────────────────────────────────────────────────────
  lost_prospector: {
    glyph: "@",
    name: "Lost Prospector",
    speed: 7,
    hp: 10,
    attack: 2,
    defense: 0,
    xp: 0,
  },
  cave_hermit: {
    glyph: "@",
    name: "Cave Hermit",
    speed: 5,
    hp: 8,
    attack: 1,
    defense: 1,
    xp: 0,
  },

  // ── Ruins ─────────────────────────────────────────────────────────────────
  wandering_antiquarian: {
    glyph: "@",
    name: "Wandering Antiquarian",
    speed: 7,
    hp: 10,
    attack: 1,
    defense: 0,
    xp: 0,
  },
  desperate_scavenger: {
    glyph: "@",
    name: "Desperate Scavenger",
    speed: 9,
    hp: 12,
    attack: 3,
    defense: 1,
    xp: 0,
  },

  // ── Crypt ─────────────────────────────────────────────────────────────────
  spirit_guide: {
    glyph: "?",
    name: "Spirit Guide",
    speed: 5,
    hp: 6,
    attack: 0,
    defense: 0,
    xp: 0,
  },
  cursed_noble: {
    glyph: "@",
    name: "Cursed Noble",
    speed: 6,
    hp: 14,
    attack: 2,
    defense: 1,
    xp: 0,
  },

  // ── Temple ────────────────────────────────────────────────────────────────
  penitent_monk: {
    glyph: "@",
    name: "Penitent Monk",
    speed: 7,
    hp: 10,
    attack: 1,
    defense: 0,
    xp: 0,
  },
  exiled_devotee: {
    glyph: "@",
    name: "Exiled Devotee",
    speed: 8,
    hp: 14,
    attack: 3,
    defense: 1,
    xp: 0,
  },

  // ── Lair ──────────────────────────────────────────────────────────────────
  enslaved_prisoner: {
    glyph: "@",
    name: "Enslaved Prisoner",
    speed: 6,
    hp: 10,
    attack: 1,
    defense: 0,
    xp: 0,
  },
  broken_warrior: {
    glyph: "@",
    name: "Broken Warrior",
    speed: 8,
    hp: 18,
    attack: 5,
    defense: 2,
    xp: 0,
  },
};

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

export const LOOT_STATS: Record<string, LootStatBlock> = {
  // ── Cave ─────────────────────────────────────────────────────────────────
  ore_pouch: { glyph: "o", name: "Ore Pouch", value: 12 },
  crystal_shard: { glyph: "*", name: "Crystal Shard", value: 30 },
  cave_pearl: { glyph: ".", name: "Cave Pearl", value: 55 },

  // ── Ruins ─────────────────────────────────────────────────────────────────
  clay_tablet: { glyph: "_", name: "Clay Tablet", value: 15 },
  corroded_coin: { glyph: "$", name: "Corroded Coin", value: 25 },
  carved_idol: { glyph: "&", name: "Carved Idol", value: 60 },

  // ── Crypt ─────────────────────────────────────────────────────────────────
  burial_token: { glyph: "t", name: "Burial Token", value: 20 },
  grave_goods: { glyph: "g", name: "Grave Goods", value: 35 },
  funerary_mask: { glyph: "m", name: "Funerary Mask", value: 80 },

  // ── Temple ────────────────────────────────────────────────────────────────
  ritual_vessel: { glyph: "u", name: "Ritual Vessel", value: 25 },
  sacred_text: { glyph: "?", name: "Sacred Text", value: 50 },
  blessed_icon: { glyph: "i", name: "Blessed Icon", value: 110 },

  // ── Lair ──────────────────────────────────────────────────────────────────
  war_trophy: { glyph: "!", name: "War Trophy", value: 40 },
  infernal_gem: { glyph: "^", name: "Infernal Gem", value: 80 },
  champion_standard: { glyph: "\\", name: "Champion Standard", value: 150 },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export const PROP_STATS: Record<string, PropStatBlock> = {
  // ── Cave ─────────────────────────────────────────────────────────────────
  stalactite: {
    glyph: "v",
    name: "Stalactite",
    solid: true,
    interactable: false,
  },
  bioluminescent_fungus: {
    glyph: "f",
    name: "Bioluminescent Fungus",
    solid: false,
    interactable: false,
  },
  crude_torch: {
    glyph: "t",
    name: "Crude Torch",
    solid: false,
    interactable: false,
  },

  // ── Ruins ─────────────────────────────────────────────────────────────────
  crumbled_column: {
    glyph: "O",
    name: "Crumbled Column",
    solid: true,
    interactable: false,
  },
  ancient_frieze: {
    glyph: "-",
    name: "Ancient Frieze",
    solid: false,
    interactable: true,
  },
  worn_mosaic: {
    glyph: "#",
    name: "Worn Mosaic",
    solid: false,
    interactable: true,
  },

  // ── Crypt ─────────────────────────────────────────────────────────────────
  sarcophagus: {
    glyph: "[",
    name: "Sarcophagus",
    solid: true,
    interactable: true,
  },
  candle_rack: {
    glyph: "|",
    name: "Candle Rack",
    solid: false,
    interactable: false,
  },
  headstone: {
    glyph: "T",
    name: "Headstone",
    solid: false,
    interactable: true,
  },

  // ── Temple ────────────────────────────────────────────────────────────────
  ritual_altar: {
    glyph: "_",
    name: "Ritual Altar",
    solid: true,
    interactable: true,
  },
  brazier: {
    glyph: "Y",
    name: "Brazier",
    solid: false,
    interactable: false,
  },
  prayer_column: {
    glyph: "I",
    name: "Prayer Column",
    solid: true,
    interactable: false,
  },

  // ── Lair ──────────────────────────────────────────────────────────────────
  bone_pile: {
    glyph: "%",
    name: "Bone Pile",
    solid: false,
    interactable: false,
  },
  kill_trophy: {
    glyph: "K",
    name: "Kill Trophy",
    solid: false,
    interactable: false,
  },
  brutal_throne: {
    glyph: "H",
    name: "Brutal Throne",
    solid: true,
    interactable: false,
  },
};

// ---------------------------------------------------------------------------
// Unified lookup helper
// ---------------------------------------------------------------------------

/**
 * Look up any entity's stat block by its spawn-table id.
 * Returns undefined if the id is not registered.
 */
export function lookupStatBlock(
  id: string,
): CreatureStatBlock | PropStatBlock | LootStatBlock | undefined {
  return (
    MONSTER_STATS[id] ??
    BOSS_STATS[id] ??
    NPC_STATS[id] ??
    LOOT_STATS[id] ??
    PROP_STATS[id]
  );
}
