/**
 * Fantasy world name generator.
 *
 * Lexical field: forested geographic area with a fel, cruel slant —
 * a dystopia where the last bastions of humanity are cults clustered
 * around monuments and the dungeons beneath.
 *
 * All generation is deterministic given a seed.
 */

import { hashSeed, seededFloat } from "../../resolve/seededPicker";

// ─── Word lists ───────────────────────────────────────────────────────────────

const DARK_PREFIXES = [
  "Ash",    "Bane",   "Blight", "Bone",   "Briar",  "Canker",
  "Cinder", "Crook",  "Dread",  "Dusk",   "Fallow", "Fell",
  "Fester", "Gall",   "Gaunt",  "Gnarl",  "Grim",   "Hex",
  "Hollow", "Knell",  "Lament", "Mire",   "Murk",   "Pale",
  "Rot",    "Seep",   "Shade",  "Snarl",  "Sorrow", "Spite",
  "Thorn",  "Vex",    "Vile",   "Wane",   "Wrath",
] as const;

const NATURE_SUFFIXES = [
  "barrow", "coomb",  "dell",   "drift",  "fell",
  "fen",    "ford",   "glade",  "grove",  "heath",
  "hollow", "holm",   "holt",   "mere",   "mire",
  "moor",   "reach",  "slack",  "thicket","vale",
  "weald",  "wood",
] as const;

const DARK_ADJECTIVES = [
  "Ancient",    "Ashen",      "Blighted",   "Crooked",
  "Drowned",    "Festering",  "Forsaken",   "Gaunt",
  "Hollow",     "Hungering",  "Mouldering", "Nameless",
  "Pale",       "Seeping",    "Shrouded",   "Silent",
  "Starving",   "Sunken",     "Sunless",    "Weeping",
  "Withered",   "Wretched",
] as const;

const MONUMENTS = [
  "Altar",    "Arch",     "Cairn",    "Hollow",
  "Marker",   "Mound",    "Obelisk",  "Pillar",
  "Pit",      "Pyre",     "Rune",     "Seal",
  "Shard",    "Spire",    "Stone",    "Stump",
  "Throne",   "Totem",    "Vault",    "Ward",
] as const;

// Harsh consonants, plausible as cult names in a dying world.
const CULT_NAMES = [
  "Berthen",  "Cendris",  "Drauth",   "Dulveth",
  "Elshan",   "Ethrak",   "Gelveth",  "Greth",
  "Korrn",    "Kulvan",   "Malgrath", "Morren",
  "Narek",    "Orrath",   "Seld",     "Siv",
  "Thyss",    "Torath",   "Ulvar",    "Valdris",
  "Veshan",   "Vorek",
] as const;

const SETTLEMENT_WORDS = [
  "Break",    "Cradle",   "End",      "Fall",
  "Grave",    "Hold",     "Hollow",   "Keep",
  "Knell",    "March",    "Mark",     "Rest",
  "Sink",     "Wake",     "Watch",
] as const;

// ─── Seeded pick ──────────────────────────────────────────────────────────────

function pickFrom<T extends readonly unknown[]>(
  arr: T,
  baseSeed: number,
  slot: string,
): T[number] {
  const s = hashSeed(baseSeed, slot);
  const idx = Math.floor(seededFloat(s) * arr.length);
  return arr[Math.min(idx, arr.length - 1)];
}

function toUint32(seed: number | string): number {
  if (typeof seed === "number") return seed >>> 0;
  // FNV-1a on string (same as hashSeed with one part)
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type WorldName = {
  /** Display-ready name string. */
  name: string;
  kind: "compound" | "descriptive" | "cult" | "twoword";
};

/**
 * Generate a deterministic fantasy place name for the overworld.
 *
 * @param seed  The overworld seed (string or uint32).
 */
export function generateWorldName(seed: number | string): WorldName {
  const base = toUint32(seed);
  const template = Math.floor(seededFloat(hashSeed(base, "template")) * 4);

  switch (template) {
    case 0: {
      // "Thornmere", "Blightweald"
      const prefix = pickFrom(DARK_PREFIXES, base, "prefix") as string;
      const suffix = pickFrom(NATURE_SUFFIXES, base, "suffix") as string;
      return { name: prefix + suffix, kind: "compound" };
    }
    case 1: {
      // "The Ashen Cairn", "The Weeping Spire"
      const adj = pickFrom(DARK_ADJECTIVES, base, "adj");
      const monument = pickFrom(MONUMENTS, base, "monument");
      return { name: `The ${adj} ${monument}`, kind: "descriptive" };
    }
    case 2: {
      // "Morren's Watch", "Seld's Cradle"
      const cultName = pickFrom(CULT_NAMES, base, "cultName");
      const word = pickFrom(SETTLEMENT_WORDS, base, "settlement");
      return { name: `${cultName}'s ${word}`, kind: "cult" };
    }
    default: {
      // "Blight Hollow", "Dread Vale"
      const prefix = pickFrom(DARK_PREFIXES, base, "prefix") as string;
      const suffix = pickFrom(NATURE_SUFFIXES, base, "suffix") as string;
      const cap = (suffix[0].toUpperCase() + suffix.slice(1)) as string;
      return { name: `${prefix} ${cap}`, kind: "twoword" };
    }
  }
}

/**
 * Generate a deterministic fantasy name for a dungeon portal.
 * Uses a three-template subset (no two-word form) for shorter names.
 *
 * @param seed  The portal's own numeric seed.
 */
export function generatePortalName(seed: number): string {
  const base = seed >>> 0;
  const template = Math.floor(seededFloat(hashSeed(base, "ptemplate")) * 3);

  switch (template) {
    case 0: {
      const prefix = pickFrom(DARK_PREFIXES, base, "pprefix") as string;
      const suffix = pickFrom(NATURE_SUFFIXES, base, "psuffix") as string;
      return prefix + suffix;
    }
    case 1: {
      const adj = pickFrom(DARK_ADJECTIVES, base, "padj");
      const monument = pickFrom(MONUMENTS, base, "pmonument");
      return `The ${adj} ${monument}`;
    }
    default: {
      const cultName = pickFrom(CULT_NAMES, base, "pcultName");
      const word = pickFrom(SETTLEMENT_WORDS, base, "psettlement");
      return `${cultName}'s ${word}`;
    }
  }
}
