/**
 * Default dungeon themes — starter set for Session 3.
 *
 * Spawn tables are empty stubs until Session 5 resolver pipeline.
 * Room themes are minimal stubs until Session 4 room tagging.
 */

import type { DungeonTheme } from "./themeTypes";

// ---------------------------------------------------------------------------
// Spawn tables per theme
// ---------------------------------------------------------------------------

const MEDIEVAL_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "skeleton_warrior", weight: 4 },
    { value: "armored_guard", weight: 3 },
    { value: "giant_rat", weight: 2 },
    { value: "ghost_knight", weight: 1 },
  ],
  loot: [
    { value: "iron_chest", weight: 4 },
    { value: "gold_coffer", weight: 2 },
    { value: "royal_cache", weight: 1 },
  ],
  props: [
    { value: "weapon_rack", weight: 3 },
    { value: "torch_sconce", weight: 3 },
    { value: "tattered_banner", weight: 2 },
  ],
  npcs: [
    { value: "wandering_merchant", weight: 3 },
    { value: "imprisoned_knight", weight: 2 },
  ],
  bosses: [
    { value: "black_knight", weight: 3 },
    { value: "lich_king", weight: 1 },
  ],
};

const BABYLON_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "clay_golem", weight: 3 },
    { value: "sand_wraith", weight: 3 },
    { value: "temple_guardian", weight: 2 },
    { value: "scorpion_swarm", weight: 2 },
  ],
  loot: [
    { value: "clay_urn", weight: 4 },
    { value: "jeweled_idol", weight: 2 },
    { value: "golden_tablet", weight: 1 },
  ],
  props: [
    { value: "stone_pillar", weight: 3 },
    { value: "cuneiform_tablet", weight: 2 },
    { value: "offering_bowl", weight: 3 },
  ],
  npcs: [
    { value: "temple_scribe", weight: 3 },
    { value: "blind_oracle", weight: 1 },
  ],
  bosses: [
    { value: "bull_of_heaven", weight: 2 },
    { value: "lamassu", weight: 2 },
  ],
};

const SURGICAL_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [
    { value: "animated_cadaver", weight: 3 },
    { value: "rogue_orderly", weight: 3 },
    { value: "surgical_drone", weight: 2 },
    { value: "escaped_subject", weight: 2 },
  ],
  loot: [
    { value: "medical_kit", weight: 4 },
    { value: "specimen_jar", weight: 2 },
    { value: "experimental_serum", weight: 1 },
  ],
  props: [
    { value: "operating_table", weight: 3 },
    { value: "iv_stand", weight: 3 },
    { value: "biohazard_container", weight: 2 },
  ],
  npcs: [
    { value: "surviving_patient", weight: 3 },
    { value: "renegade_doctor", weight: 1 },
  ],
  bosses: [
    { value: "chief_surgeon", weight: 2 },
    { value: "the_experiment", weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// Medieval Keep — classic swords-and-shields fantasy
// ---------------------------------------------------------------------------

export const THEME_MEDIEVAL_KEEP: DungeonTheme = {
  id: "medieval_keep",
  label: "Medieval Keep",

  render: {
    colors: {
      floor: "#8B7D6B",
      wallEdge: "#4A4A4A",
      player: "#3A7DFF",
      interactable: "#E5C07B",
      hazard: "#E06C75",
      enemy: "#FF5C5C",
    },
    strength: {
      floor: 1.0,
      wallEdge: 1.0,
      player: 1.0,
      interactable: 1.0,
      hazard: 1.0,
      enemy: 1.0,
    },
  },

  roomThemes: [
    { id: "armory", label: "Armory" },
    { id: "library", label: "Library" },
    { id: "throne_room", label: "Throne Room" },
    { id: "dungeon_cell", label: "Dungeon Cell" },
  ],

  spawnTables: MEDIEVAL_SPAWN_TABLES,
};

// ---------------------------------------------------------------------------
// Babylon Ziggurat — ancient Mesopotamian temple
// ---------------------------------------------------------------------------

export const THEME_BABYLON_ZIGGURAT: DungeonTheme = {
  id: "babylon_ziggurat",
  label: "Babylon Ziggurat",

  render: {
    colors: {
      floor: "#C2A24D",
      wallEdge: "#5C4A1E",
      player: "#1E90FF",
      interactable: "#FFD700",
      hazard: "#CD3333",
      enemy: "#8B0000",
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
    { id: "offering_hall", label: "Offering Hall" },
    { id: "scribe_chamber", label: "Scribe Chamber" },
    { id: "sacred_pool", label: "Sacred Pool" },
  ],

  spawnTables: BABYLON_SPAWN_TABLES,
};

// ---------------------------------------------------------------------------
// Surgical Suite — cold clinical horror
// ---------------------------------------------------------------------------

export const THEME_SURGICAL_SUITE: DungeonTheme = {
  id: "surgical_suite",
  label: "Surgical Suite",

  render: {
    colors: {
      floor: "#D8DEE4",
      wallEdge: "#7A8B99",
      player: "#00B7FF",
      interactable: "#00CC88",
      hazard: "#FF2244",
      enemy: "#BB0033",
    },
    strength: {
      floor: 0.7,
      wallEdge: 0.9,
      player: 1.15,
      interactable: 1.0,
      hazard: 1.35,
      enemy: 1.2,
    },
  },

  roomThemes: [
    { id: "operating_room", label: "Operating Room" },
    { id: "storage", label: "Storage" },
    { id: "observation", label: "Observation" },
    { id: "recovery_ward", label: "Recovery Ward" },
  ],

  spawnTables: SURGICAL_SPAWN_TABLES,
};

export const DEFAULT_THEMES: DungeonTheme[] = [
  THEME_MEDIEVAL_KEEP,
  THEME_BABYLON_ZIGGURAT,
  THEME_SURGICAL_SUITE,
];
