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
  "Ash",
  "Bane",
  "Blight",
  "Bone",
  "Briar",
  "Canker",
  "Cinder",
  "Crook",
  "Dread",
  "Dusk",
  "Fallow",
  "Fell",
  "Fester",
  "Gall",
  "Gaunt",
  "Gnarl",
  "Grim",
  "Hex",
  "Hollow",
  "Knell",
  "Lament",
  "Mire",
  "Murk",
  "Pale",
  "Rot",
  "Seep",
  "Shade",
  "Snarl",
  "Sorrow",
  "Spite",
  "Thorn",
  "Vex",
  "Vile",
  "Wane",
  "Wrath",
] as const;

const NATURE_SUFFIXES = [
  "barrow",
  "coomb",
  "dell",
  "drift",
  "fell",
  "fen",
  "ford",
  "glade",
  "grove",
  "heath",
  "hollow",
  "holm",
  "holt",
  "mere",
  "mire",
  "moor",
  "reach",
  "slack",
  "thicket",
  "vale",
  "weald",
  "wood",
] as const;

const DARK_ADJECTIVES = [
  "Ancient",
  "Ashen",
  "Blighted",
  "Crooked",
  "Drowned",
  "Festering",
  "Forsaken",
  "Gaunt",
  "Hollow",
  "Hungering",
  "Mouldering",
  "Nameless",
  "Pale",
  "Seeping",
  "Shrouded",
  "Silent",
  "Starving",
  "Sunken",
  "Sunless",
  "Weeping",
  "Withered",
  "Wretched",
] as const;

const MONUMENTS = [
  "Altar",
  "Arch",
  "Cairn",
  "Hollow",
  "Marker",
  "Mound",
  "Obelisk",
  "Pillar",
  "Pit",
  "Pyre",
  "Rune",
  "Seal",
  "Shard",
  "Spire",
  "Stone",
  "Stump",
  "Throne",
  "Totem",
  "Vault",
  "Ward",
] as const;

// Harsh consonants, plausible as cult names in a dying world.
const CULT_NAMES = [
  "Berthen",
  "Cendris",
  "Drauth",
  "Dulveth",
  "Elshan",
  "Ethrak",
  "Gelveth",
  "Greth",
  "Korrn",
  "Kulvan",
  "Malgrath",
  "Morren",
  "Narek",
  "Orrath",
  "Seld",
  "Siv",
  "Thyss",
  "Torath",
  "Ulvar",
  "Valdris",
  "Veshan",
  "Vorek",
] as const;

const SETTLEMENT_WORDS = [
  "Break",
  "Cradle",
  "End",
  "Fall",
  "Grave",
  "Hold",
  "Hollow",
  "Keep",
  "Knell",
  "March",
  "Mark",
  "Rest",
  "Sink",
  "Wake",
  "Watch",
] as const;

// ─── Lore tables ─────────────────────────────────────────────────────────────

const PREFIX_LORE: Record<string, string> = {
  Ash: "Pale ash settles on every surface, remnant of a fire that never fully died.",
  Bane: "Something in the soil is inimical to life, gnawing at root and bone alike.",
  Blight:
    "A creeping rot has spread from trunk to trunk, blackening bark and killing sap.",
  Bone: "Bones protrude from the earth here, too numerous and too arranged to be natural.",
  Briar:
    "Thorned vines swallow the undergrowth, drawing blood from anything that passes.",
  Canker:
    "Weeping sores mark every tree, leaking dark resin that stains whatever it touches.",
  Cinder:
    "The vegetation is scorched and grey, though no fire has been seen here for years.",
  Crook:
    "The trees grow twisted and bent, as though recoiling from something unseen.",
  Dread:
    "A formless dread settles over all who enter, heavier with each step inward.",
  Dusk: "A permanent twilight clings here — even at midday the light falls thin and grey.",
  Fallow:
    "Nothing fruitful grows here. The soil repels cultivation without apparent cause.",
  Fell: "The land feels deliberate in its cruelty, shaped by some ancient and sustained malice.",
  Fester:
    "A sickly sweetness hangs in the air, thick enough to taste at the back of the throat.",
  Gall: "A deep bitterness permeates the place, present in the water and carried on the wind.",
  Gaunt: "The trees stand skeletal and pale, stripped of bark and leaf alike.",
  Gnarl:
    "Gnarled roots writhe across the ground, lifting and cracking anything laid on the earth.",
  Grim: "Nothing here invites rest. Even the shadows feel watchful and deliberate.",
  Hex: "Strange symbols are scored into the bark of every tree, old and half-grown-over.",
  Hollow:
    "The ground rings hollow underfoot, as though vast emptiness waits just below.",
  Knell:
    "A distant tolling is carried on the wind here, sourceless and unceasing.",
  Lament:
    "A sound like weeping moves through the trees at night, following no wind.",
  Mire: "Dark standing water fills every low point, still and patient between the tussocks.",
  Murk: "A brown haze diffuses the light into a sourceless, directionless grey.",
  Pale: "The colour has drained from the land, as though something has leeched the life from it.",
  Rot: "Everything here is in slow decay — wood, stone, and soil crumbling together toward slime.",
  Seep: "Black moisture oozes from every rock face, leaving dark trails wherever it runs.",
  Shade: "Deep shadow pools here in the brightest weather, cold and absolute.",
  Snarl:
    "Tangled branches and roots form improvised walls, steering travellers without consent.",
  Sorrow:
    "A heavy grief settles over anyone who lingers, sourceless and difficult to name.",
  Spite:
    "A dark and prickling malice seems woven into the place itself, old and patient.",
  Thorn:
    "Thorns grow everywhere — on every branch, rising even from bare rock.",
  Vex: "The paths shift and contradict, leading nowhere the same way twice.",
  Vile: "A noxious stench rises from the ground, dense with decay and something worse.",
  Wane: "Things fade here without explanation. Even the full moon seems dim above this place.",
  Wrath:
    "The wind carries an anger, snapping branches and tearing at cloaks without warning.",
};

const SUFFIX_LORE: Record<string, string> = {
  barrow:
    "Old burial mounds ridge the earth, their markers long since toppled and overgrown.",
  coomb: "A steep-sided valley cups the darkness, still and nearly airless.",
  dell: "A small hollow collects mist and silence in equal measure.",
  drift:
    "Something drifts constantly through the air — ash or snow, it is hard to say which.",
  fell: "Open moorland stretches in every direction, exposed and without shelter.",
  fen: "Stagnant water seeps between tussocks of dead grass, hiding the depth of the bog.",
  ford: "A crossing exists, but the water that flows here is dark and carries a faint chill.",
  glade:
    "A clearing opens in the canopy, but no real light seems to reach the ground.",
  grove:
    "Trees cluster in deliberate rings, as if arranged for a purpose since abandoned.",
  heath: "Low scrub covers open ground where nothing taller dares to grow.",
  hollow:
    "A depression in the earth gathers cold air and the slow smell of old rot.",
  holm: "A low island rises from the water, unreachable and apparently unlit.",
  holt: "A dense stand of trees stands here, dark inside even at noon.",
  mere: "A still lake reflects a sky that looks subtly wrong from its surface.",
  mire: "Sucking mud claims the unwary. The bones of the lost lie just beneath.",
  moor: "Flat and featureless, the moor offers no shelter and no concealment.",
  reach:
    "A long corridor of land stretches here, exposed on both flanks to whatever is out there.",
  slack:
    "A sluggish channel of dark water winds between mud banks, going nowhere fast.",
  thicket:
    "Dense bramble and briar form walls, steering travellers where they would not choose to go.",
  vale: "Cold air pools in the valley floor, holding shadow long past dawn.",
  weald:
    "Old forest presses close on all sides, the canopy unbroken for miles.",
  wood: "The trees are old and close-set, their roots lifting the ground in uneven ridges.",
};

const ADJECTIVE_LORE: Record<string, string> = {
  Ancient:
    "It has stood here longer than any nearby settlement. Its origin is not recorded.",
  Ashen:
    "A fine grey powder coats every surface in the vicinity, settling from the air without cease.",
  Blighted:
    "The land within sight of it refuses to flourish. Animals avoid the immediate area.",
  Crooked:
    "Nothing about it is straight or true. The eye slides off it uncomfortably.",
  Drowned:
    "Dark water pools at its base, soaking the surrounding ground year-round.",
  Festering:
    "A slow corruption seeps outward from it, visible in the blackening vegetation.",
  Forsaken:
    "Whatever purpose it once served, that covenant is broken. Nothing watches over it now.",
  Gaunt:
    "It stands skeletal and stripped, bearing no ornament or legible inscription.",
  Hollow:
    "It is empty inside. Sound carries within it in ways that do not make sense.",
  Hungering:
    "Those who linger near it report a gnawing need they cannot name or satisfy.",
  Mouldering:
    "It crumbles at the edges, slow and steady, as though being consumed from within.",
  Nameless: "No record of its dedication survives. Locals refuse to speculate.",
  Pale: "The stone is the colour of old bone, unmarked and cold to the touch in all seasons.",
  Seeping: "Moisture bleeds from its surface, dark and faintly acrid.",
  Shrouded: "Fog collects around it regardless of conditions elsewhere.",
  Silent: "Sound does not carry near it. Voices fall flat and fail to travel.",
  Starving:
    "The ground in its shadow is barren, as if the structure draws sustenance from the soil.",
  Sunken:
    "It has settled into the earth over the years — or the earth has risen to claim it.",
  Sunless:
    "Shadow clings to it at all hours. The sun appears to track deliberately around it.",
  Weeping:
    "Thin rivulets of dark fluid trace down its surface, constant and unexplained.",
  Withered:
    "It has the look of something once greater, reduced now to this diminished remnant.",
  Wretched:
    "Prolonged observation induces a quiet despair that lingers for days afterward.",
};

const MONUMENT_LORE: Record<string, string> = {
  Altar:
    "The altar's surface is stained dark from long use. Its purpose is not ambiguous.",
  Arch: "The arch stands alone in open ground, framing nothing but more of the same darkness.",
  Cairn:
    "A cairn of rough-stacked stones, larger than any single person could have built alone.",
  Hollow:
    "A hollow worn into the rock, body-sized, smooth from generations of contact.",
  Marker:
    "The marker bears symbols in a script no travelling scholar has yet identified.",
  Mound:
    "A great mound of earth, flat-topped, predating the forest that now surrounds it.",
  Obelisk:
    "The obelisk leans at a slight angle, its base half-consumed by the soil.",
  Pillar:
    "A single pillar rises from the earth — seamless, jointless, without apparent construction.",
  Pit: "The pit has no visible bottom. Objects dropped into it make no sound on landing.",
  Pyre: "The pyre smoulders at its base, though no fuel can be found to account for it.",
  Rune: "A great rune is incised into the bedrock, older than the land that covers it.",
  Seal: "A flat stone seals something below. The marks on it are worn but clearly deliberate.",
  Shard: "A massive shard of dark stone juts from the earth at a steep angle.",
  Spire: "The spire rises above to a point almost impossibly thin.",
  Stone: "A standing stone, unmarked, of no identifiable origin or period.",
  Stump:
    "The stump of something vast — not a tree — rises from the earth here.",
  Throne:
    "A throne of stone sits exposed to the elements in open ground, unoccupied.",
  Totem:
    "A carved totem stands at the site's edge, faces stacked and grinning.",
  Vault:
    "The vault's door is sealed from the outside, no living soul can attest.",
  Ward: "Great wards are carved in to the stone, protecting those around it.  Or within?",
};

const CULT_LINES = [
  "A small cult inhabits this place, drawn by something only understood by the initiates themselves.",
  "The congregation here is old and dwindling, but their rites still contain some power.",
  "A quiet cult holds this ground, their devotion to the monument is evident.",
  "Austere surroundings and meagre fare, the people of this cult worship only the monument.",
  "What began as a vigil became a penance, the cult members gave their lives to the monument.",
] as const;

const SETTLEMENT_LORE: Record<string, string> = {
  Break:
    "A wide slash cut through the wilderness, they consider it a wound they are obliged to tend.",
  Cradle:
    "Something was born here, in the deep dark below. They believe it is not yet finished.",
  End: "This is where the road stops. Those who come this far rarely retrace their steps.",
  Fall: "Uncertain what fell here, however these people have built a religion around the event.",
  Grave: "They tend the dead here with a fervent worship.",
  Hold: "They hold something here — or are held themselves. Or perhaps they bind each other.",
  Hollow:
    "Below you will find either unspeakable horrors or fabulous treasures.",
  Keep: "The keep is more enclosure than refuge, be careful what you seek within.",
  Knell:
    "They ring bells to ward of sprits, and stay in their sanctuaries at night.",
  March:
    "On the edge of no-man's land, they patrol their border with dogged conviction.",
  Mark: "Pathways in this dense forest are marked with cultist's runes.",
  Rest: "A sanctuary for cult members, an uncertain prospect for strangers.",
  Sink: "The ground has subsided at the cult's heart, forming a bowl they hold to be sacred.",
  Wake: "They keep vigil here without cease, waiting for something they believe is coming.",
  Watch:
    "Lookouts are posted at all hours, staring outward. Whatever they watch for remains at large.",
};

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
  /** Short atmospheric description of the area. */
  description: string;
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
      const description = `${PREFIX_LORE[prefix]} ${SUFFIX_LORE[suffix]}`;
      return { name: prefix + suffix, description, kind: "compound" };
    }
    case 1: {
      // "The Ashen Cairn", "The Weeping Spire"
      const adj = pickFrom(DARK_ADJECTIVES, base, "adj") as string;
      const monument = pickFrom(MONUMENTS, base, "monument") as string;
      const description = `${ADJECTIVE_LORE[adj]} ${MONUMENT_LORE[monument]}`;
      return {
        name: `The ${adj} ${monument}`,
        description,
        kind: "descriptive",
      };
    }
    case 2: {
      // "Morren's Watch", "Seld's Cradle"
      const cultName = pickFrom(CULT_NAMES, base, "cultName");
      const word = pickFrom(SETTLEMENT_WORDS, base, "settlement") as string;
      const cultLine = pickFrom(CULT_LINES, base, "cultLine") as string;
      const description = `${cultLine} ${SETTLEMENT_LORE[word]}`;
      return { name: `${cultName}'s ${word}`, description, kind: "cult" };
    }
    default: {
      // "Blight Hollow", "Dread Vale"
      const prefix = pickFrom(DARK_PREFIXES, base, "prefix") as string;
      const suffix = pickFrom(NATURE_SUFFIXES, base, "suffix") as string;
      const cap = (suffix[0].toUpperCase() + suffix.slice(1)) as string;
      const description = `${PREFIX_LORE[prefix]} ${SUFFIX_LORE[suffix]}`;
      return { name: `${prefix} ${cap}`, description, kind: "twoword" };
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
