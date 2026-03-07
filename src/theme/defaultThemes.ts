/**
 * Default dungeon themes — one per portal type.
 *
 * Theme IDs must exactly match the DungeonTheme union in mazeGen.ts:
 *   "cave" | "ruins" | "crypt" | "temple" | "lair"
 *
 * Difficulty progression: cave (lvl 1-2) → ruins (3-4) → crypt (5-6)
 *                         → temple (7-8) → lair (9-10)
 */

import type { DungeonTheme } from "./themeTypes";

// ---------------------------------------------------------------------------
// Spawn tables
// ---------------------------------------------------------------------------

const CAVE_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "cave_bat",     weight: 4 },
    { value: "spider",       weight: 3 },
    { value: "rat",          weight: 3 },
    { value: "giant_spider", weight: 2 },
  ],
  loot: [
    { value: "ore_pouch",     weight: 4 },
    { value: "crystal_shard", weight: 2 },
    { value: "cave_pearl",    weight: 1 },
  ],
  props: [
    { value: "stalactite",              weight: 3 },
    { value: "bioluminescent_fungus",   weight: 3 },
    { value: "crude_torch",             weight: 2 },
  ],
  npcs: [
    { value: "lost_prospector", weight: 3 },
    { value: "cave_hermit",     weight: 2 },
  ],
  bosses: [
    { value: "cave_troll",  weight: 3 },
    { value: "nest_mother", weight: 2 },
  ],
};

const RUINS_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "scavenging_dog", weight: 4 },
    { value: "tomb_rat",       weight: 3 },
    { value: "venerator",      weight: 3 },
    { value: "stone_sentinel", weight: 2 },
  ],
  loot: [
    { value: "clay_tablet",   weight: 4 },
    { value: "corroded_coin", weight: 3 },
    { value: "carved_idol",   weight: 1 },
  ],
  props: [
    { value: "crumbled_column", weight: 3 },
    { value: "ancient_frieze",  weight: 2 },
    { value: "worn_mosaic",     weight: 2 },
  ],
  npcs: [
    { value: "wandering_antiquarian", weight: 3 },
    { value: "desperate_scavenger",   weight: 2 },
  ],
  bosses: [
    { value: "ruined_golem",   weight: 2 },
    { value: "ruin_guardian",  weight: 2 },
  ],
};

const CRYPT_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "zombie",   weight: 4 },
    { value: "skeleton", weight: 3 },
    { value: "shade",    weight: 2 },
    { value: "wight",    weight: 2 },
  ],
  loot: [
    { value: "burial_token",  weight: 4 },
    { value: "grave_goods",   weight: 2 },
    { value: "funerary_mask", weight: 1 },
  ],
  props: [
    { value: "sarcophagus", weight: 2 },
    { value: "candle_rack",  weight: 3 },
    { value: "headstone",    weight: 3 },
  ],
  npcs: [
    { value: "spirit_guide",  weight: 3 },
    { value: "cursed_noble",  weight: 2 },
  ],
  bosses: [
    { value: "crypt_keeper", weight: 2 },
    { value: "death_knight", weight: 2 },
  ],
};

const TEMPLE_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "temple_zealot",   weight: 4 },
    { value: "altar_cleric",    weight: 3 },
    { value: "divine_construct",weight: 2 },
    { value: "stone_idol",      weight: 2 },
  ],
  loot: [
    { value: "ritual_vessel", weight: 4 },
    { value: "sacred_text",   weight: 2 },
    { value: "blessed_icon",  weight: 1 },
  ],
  props: [
    { value: "ritual_altar",  weight: 2 },
    { value: "brazier",       weight: 3 },
    { value: "prayer_column", weight: 3 },
  ],
  npcs: [
    { value: "penitent_monk",  weight: 3 },
    { value: "exiled_devotee", weight: 2 },
  ],
  bosses: [
    { value: "high_oracle", weight: 2 },
    { value: "the_chosen",  weight: 2 },
  ],
};

const LAIR_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "goblin_skirmisher", weight: 4 },
    { value: "pit_fiend",         weight: 3 },
    { value: "ogre_brute",        weight: 2 },
    { value: "abomination",   weight: 2 },
  ],
  loot: [
    { value: "war_trophy",        weight: 4 },
    { value: "infernal_gem",      weight: 2 },
    { value: "champion_standard", weight: 1 },
  ],
  props: [
    { value: "bone_pile",    weight: 3 },
    { value: "kill_trophy",  weight: 3 },
    { value: "brutal_throne",weight: 1 },
  ],
  npcs: [
    { value: "enslaved_prisoner", weight: 3 },
    { value: "broken_warrior",    weight: 2 },
  ],
  bosses: [
    { value: "warlord_chief", weight: 2 },
    { value: "the_devourer",  weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Cave — dark underground cavern, levels 1-2
// ---------------------------------------------------------------------------

export const THEME_CAVE: DungeonTheme = {
  id: "cave",
  label: "Cave",

  render: {
    colors: {
      floor: "#4A3728",
      wallEdge: "#2A1F18",
      player: "#3A7DFF",
      interactable: "#C8A050",
      hazard: "#DD3333",
      enemy: "#CC4444",
    },
    strength: {
      floor: 0.8,
      wallEdge: 1.0,
      player: 1.0,
      interactable: 1.0,
      hazard: 1.1,
      enemy: 1.0,
    },
  },

  roomThemes: [
    { id: "mushroom_grove",  label: "Mushroom Grove"  },
    { id: "flooded_passage", label: "Flooded Passage" },
    { id: "crystal_pocket",  label: "Crystal Pocket"  },
    { id: "spider_den",      label: "Spider Den"      },
  ],

  spawnTables: CAVE_SPAWN_TABLES,
};

// ---------------------------------------------------------------------------
// Ruins — overgrown ancient debris, levels 3-4
// ---------------------------------------------------------------------------

export const THEME_RUINS: DungeonTheme = {
  id: "ruins",
  label: "Ruins",

  render: {
    colors: {
      floor: "#5A6B4A",
      wallEdge: "#3A4A2A",
      player: "#3A7DFF",
      interactable: "#C8B870",
      hazard: "#DD4422",
      enemy: "#AA5533",
    },
    strength: {
      floor: 0.9,
      wallEdge: 1.0,
      player: 1.0,
      interactable: 1.0,
      hazard: 1.1,
      enemy: 1.0,
    },
  },

  roomThemes: [
    { id: "collapsed_hall",  label: "Collapsed Hall"  },
    { id: "overgrown_court", label: "Overgrown Court" },
    { id: "flooded_vault",   label: "Flooded Vault"   },
    { id: "tomb_antechamber",label: "Tomb Antechamber"},
  ],

  spawnTables: RUINS_SPAWN_TABLES,
};

// ---------------------------------------------------------------------------
// Crypt — undead-haunted burial complex, levels 5-6
// ---------------------------------------------------------------------------

export const THEME_CRYPT: DungeonTheme = {
  id: "crypt",
  label: "Crypt",

  render: {
    colors: {
      floor: "#7A6B8B",
      wallEdge: "#3A2A4A",
      player: "#3A7DFF",
      interactable: "#C0A0E0",
      hazard: "#CC2288",
      enemy: "#9955BB",
    },
    strength: {
      floor: 0.85,
      wallEdge: 1.0,
      player: 1.0,
      interactable: 1.0,
      hazard: 1.2,
      enemy: 1.1,
    },
  },

  roomThemes: [
    { id: "burial_chamber",   label: "Burial Chamber"   },
    { id: "ossuary",          label: "Ossuary"          },
    { id: "mausoleum",        label: "Mausoleum"        },
    { id: "ceremonial_vault", label: "Ceremonial Vault" },
  ],

  spawnTables: CRYPT_SPAWN_TABLES,
};

// ---------------------------------------------------------------------------
// Temple — active sanctum of a dangerous faith, levels 7-8
// ---------------------------------------------------------------------------

export const THEME_TEMPLE: DungeonTheme = {
  id: "temple",
  label: "Temple",

  render: {
    colors: {
      floor: "#C2A24D",
      wallEdge: "#5C4A1E",
      player: "#1E90FF",
      interactable: "#FFD700",
      hazard: "#FF4400",
      enemy: "#CC3322",
    },
    strength: {
      floor: 0.9,
      wallEdge: 1.1,
      player: 1.0,
      interactable: 1.1,
      hazard: 1.2,
      enemy: 1.1,
    },
  },

  roomThemes: [
    { id: "offering_hall",   label: "Offering Hall"   },
    { id: "inner_sanctum",   label: "Inner Sanctum"   },
    { id: "ritual_chamber",  label: "Ritual Chamber"  },
    { id: "priests_quarter", label: "Priest's Quarter" },
  ],

  spawnTables: TEMPLE_SPAWN_TABLES,
};

// ---------------------------------------------------------------------------
// Lair — apex predator den, levels 9-10
// ---------------------------------------------------------------------------

export const THEME_LAIR: DungeonTheme = {
  id: "lair",
  label: "Lair",

  render: {
    colors: {
      floor: "#5A1A1A",
      wallEdge: "#2A0808",
      player: "#3A7DFF",
      interactable: "#FF8800",
      hazard: "#FF0000",
      enemy: "#FF2222",
    },
    strength: {
      floor: 0.7,
      wallEdge: 1.0,
      player: 1.0,
      interactable: 1.0,
      hazard: 1.3,
      enemy: 1.3,
    },
  },

  roomThemes: [
    { id: "feasting_hall",  label: "Feasting Hall"  },
    { id: "war_camp",       label: "War Camp"       },
    { id: "trophy_room",    label: "Trophy Room"    },
    { id: "chieftain_hall", label: "Chieftain Hall" },
  ],

  spawnTables: LAIR_SPAWN_TABLES,
};

// ---------------------------------------------------------------------------
// Registry export
// ---------------------------------------------------------------------------

export const DEFAULT_THEMES: DungeonTheme[] = [
  THEME_CAVE,
  THEME_RUINS,
  THEME_CRYPT,
  THEME_TEMPLE,
  THEME_LAIR,
];
