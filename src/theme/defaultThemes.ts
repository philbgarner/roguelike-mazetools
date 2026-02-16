/**
 * Default dungeon themes — starter set for Session 3.
 *
 * Spawn tables are empty stubs until Session 5 resolver pipeline.
 * Room themes are minimal stubs until Session 4 room tagging.
 */

import type { DungeonTheme } from "./themeTypes";

const EMPTY_SPAWN_TABLES: DungeonTheme["spawnTables"] = {
  monsters: [],
  loot: [],
  props: [],
  npcs: [],
  bosses: [],
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

  spawnTables: EMPTY_SPAWN_TABLES,
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

  spawnTables: EMPTY_SPAWN_TABLES,
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

  spawnTables: EMPTY_SPAWN_TABLES,
};

export const DEFAULT_THEMES: DungeonTheme[] = [
  THEME_MEDIEVAL_KEEP,
  THEME_BABYLON_ZIGGURAT,
  THEME_SURGICAL_SUITE,
];
