/**
 * Default stat blocks for all spawnable entities across the three starter themes.
 *
 * Creature speed reference (player = 10)
 *
 * HP / attack / defense are abstract units for the combat resolver.
 * xp is awarded to the player on kill; 0 for friendly NPCs.
 */

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
  // ── Medieval Keep ────────────────────────────────────────────────────────
  skeleton_warrior: {
    glyph: "s",
    name: "Skeleton Warrior",
    speed: 10,
    hp: 14,
    attack: 4,
    defense: 2,
    xp: 15,
  },
  armored_guard: {
    glyph: "G",
    name: "Armored Guard",
    speed: 10,
    hp: 22,
    attack: 5,
    defense: 5,
    xp: 22,
  },
  giant_rat: {
    glyph: "r",
    name: "Giant Rat",
    speed: 10,
    hp: 5,
    attack: 2,
    defense: 0,
    xp: 8,
  },
  ghost_knight: {
    glyph: "k",
    name: "Ghost Knight",
    speed: 10,
    hp: 10,
    attack: 7,
    defense: 1,
    xp: 35,
  },

  // ── Babylon Ziggurat ─────────────────────────────────────────────────────
  clay_golem: {
    glyph: "g",
    name: "Clay Golem",
    speed: 10,
    hp: 30,
    attack: 8,
    defense: 7,
    xp: 30,
  },
  sand_wraith: {
    glyph: "W",
    name: "Sand Wraith",
    speed: 12,
    hp: 8,
    attack: 6,
    defense: 0,
    xp: 25,
  },
  temple_guardian: {
    glyph: "T",
    name: "Temple Guardian",
    speed: 10,
    hp: 24,
    attack: 6,
    defense: 4,
    xp: 28,
  },
  scorpion_swarm: {
    glyph: "S",
    name: "Scorpion Swarm",
    speed: 14,
    hp: 10,
    attack: 3,
    defense: 0,
    xp: 20,
  },

  // ── Surgical Suite ───────────────────────────────────────────────────────
  animated_cadaver: {
    glyph: "z",
    name: "Animated Cadaver",
    speed: 10,
    hp: 16,
    attack: 4,
    defense: 1,
    xp: 18,
  },
  rogue_orderly: {
    glyph: "o",
    name: "Rogue Orderly",
    speed: 10,
    hp: 14,
    attack: 5,
    defense: 2,
    xp: 22,
  },
  surgical_drone: {
    glyph: "d",
    name: "Surgical Drone",
    speed: 10,
    hp: 22,
    attack: 6,
    defense: 5,
    xp: 30,
  },
  escaped_subject: {
    glyph: "e",
    name: "Escaped Subject",
    speed: 14,
    hp: 8,
    attack: 3,
    defense: 0,
    xp: 15,
  },
};

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

export const BOSS_STATS: Record<string, CreatureStatBlock> = {
  // ── Medieval Keep ────────────────────────────────────────────────────────
  black_knight: {
    glyph: "K",
    name: "Black Knight",
    speed: 10,
    hp: 60,
    attack: 10,
    defense: 8,
    xp: 200,
  },
  lich_king: {
    glyph: "L",
    name: "Lich King",
    speed: 10,
    hp: 80,
    attack: 13,
    defense: 5,
    xp: 500,
  },

  // ── Babylon Ziggurat ─────────────────────────────────────────────────────
  bull_of_heaven: {
    glyph: "B",
    name: "Bull of Heaven",
    speed: 10,
    hp: 80,
    attack: 14,
    defense: 8,
    xp: 350,
  },
  lamassu: {
    glyph: "M",
    name: "Lamassu",
    speed: 10,
    hp: 75,
    attack: 12,
    defense: 10,
    xp: 400,
  },

  // ── Surgical Suite ───────────────────────────────────────────────────────
  chief_surgeon: {
    glyph: "C",
    name: "Chief Surgeon",
    speed: 10,
    hp: 70,
    attack: 10,
    defense: 6,
    xp: 300,
  },
  the_experiment: {
    glyph: "X",
    name: "The Experiment",
    speed: 12,
    hp: 100,
    attack: 15,
    defense: 4,
    xp: 500,
  },
};

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

export const NPC_STATS: Record<string, CreatureStatBlock> = {
  // ── Medieval Keep ────────────────────────────────────────────────────────
  wandering_merchant: {
    glyph: "@",
    name: "Wandering Merchant",
    speed: 7,
    hp: 12,
    attack: 2,
    defense: 1,
    xp: 0,
  },
  imprisoned_knight: {
    glyph: "@",
    name: "Imprisoned Knight",
    speed: 8,
    hp: 22,
    attack: 7,
    defense: 4,
    xp: 0,
  },

  // ── Babylon Ziggurat ─────────────────────────────────────────────────────
  temple_scribe: {
    glyph: "@",
    name: "Temple Scribe",
    speed: 7,
    hp: 8,
    attack: 1,
    defense: 0,
    xp: 0,
  },
  blind_oracle: {
    glyph: "?",
    name: "Blind Oracle",
    speed: 5,
    hp: 6,
    attack: 0,
    defense: 0,
    xp: 0,
  },

  // ── Surgical Suite ───────────────────────────────────────────────────────
  surviving_patient: {
    glyph: "@",
    name: "Surviving Patient",
    speed: 5,
    hp: 10,
    attack: 1,
    defense: 0,
    xp: 0,
  },
  renegade_doctor: {
    glyph: "@",
    name: "Renegade Doctor",
    speed: 8,
    hp: 15,
    attack: 4,
    defense: 1,
    xp: 0,
  },
};

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

export const LOOT_STATS: Record<string, LootStatBlock> = {
  // ── Medieval Keep ────────────────────────────────────────────────────────
  iron_chest: { glyph: "=", name: "Iron Chest", value: 20 },
  gold_coffer: { glyph: "$", name: "Gold Coffer", value: 50 },
  royal_cache: { glyph: "¤", name: "Royal Cache", value: 100 },

  // ── Babylon Ziggurat ─────────────────────────────────────────────────────
  clay_urn: { glyph: "u", name: "Clay Urn", value: 15 },
  jeweled_idol: { glyph: "*", name: "Jeweled Idol", value: 65 },
  golden_tablet: { glyph: "_", name: "Golden Tablet", value: 80 },

  // ── Surgical Suite ───────────────────────────────────────────────────────
  medical_kit: { glyph: "+", name: "Medical Kit", value: 30 },
  specimen_jar: { glyph: "j", name: "Specimen Jar", value: 25 },
  experimental_serum: { glyph: "!", name: "Experimental Serum", value: 80 },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export const PROP_STATS: Record<string, PropStatBlock> = {
  // ── Medieval Keep ────────────────────────────────────────────────────────
  weapon_rack: {
    glyph: "|",
    name: "Weapon Rack",
    solid: true,
    interactable: false,
  },
  torch_sconce: {
    glyph: "t",
    name: "Torch Sconce",
    solid: false,
    interactable: false,
  },
  tattered_banner: {
    glyph: "\\",
    name: "Tattered Banner",
    solid: false,
    interactable: false,
  },

  // ── Babylon Ziggurat ─────────────────────────────────────────────────────
  stone_pillar: {
    glyph: "O",
    name: "Stone Pillar",
    solid: true,
    interactable: false,
  },
  cuneiform_tablet: {
    glyph: "-",
    name: "Cuneiform Tablet",
    solid: false,
    interactable: true,
  },
  offering_bowl: {
    glyph: "o",
    name: "Offering Bowl",
    solid: false,
    interactable: true,
  },

  // ── Surgical Suite ───────────────────────────────────────────────────────
  operating_table: {
    glyph: "[",
    name: "Operating Table",
    solid: true,
    interactable: false,
  },
  iv_stand: {
    glyph: "I",
    name: "IV Stand",
    solid: false,
    interactable: false,
  },
  biohazard_container: {
    glyph: "H",
    name: "Biohazard Container",
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
