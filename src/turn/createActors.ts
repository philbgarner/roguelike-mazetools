// src/turn/createActors.ts
//
// Factory functions for creating turn-system actors.

import type { PlayerActor, MonsterActor } from "./turnTypes";
import type { MobilePlacement } from "../content";

export const PLAYER_SPEED = 10;
export const MONSTER_SPEED_DEFAULT = 7;

export type PlayerSeed = {
  hp?: number;
  maxHp?: number;
  attack?: number;
  defense?: number;
};

/**
 * Create the player actor at the given position.
 */
export function createPlayerActor(
  x: number,
  y: number,
  seed: PlayerSeed = {},
): PlayerActor {
  const maxHp = seed.maxHp ?? 20;
  return {
    id: "player",
    kind: "player",
    x,
    y,
    speed: PLAYER_SPEED,
    alive: true,
    blocksMovement: true,
    hp: seed.hp ?? maxHp,
    maxHp,
    attack: seed.attack ?? 5,
    defense: seed.defense ?? 1,
  };
}

/**
 * A simple monster template, keyed by the `type` field of MobilePlacement.
 */
export type MonsterTemplate = {
  name: string;
  glyph: string;
  danger: number;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  speed: number;
};

/** Built-in monster templates keyed by mobile type string. */
export const DEFAULT_MONSTER_TEMPLATES: Record<string, MonsterTemplate> = {
  goblin: { name: "Goblin",    glyph: "g", danger: 1, hp: 6,  attack: 3, defense: 0, xp: 10, speed: 8  },
  orc:    { name: "Orc",       glyph: "o", danger: 3, hp: 12, attack: 5, defense: 1, xp: 25, speed: 6  },
  troll:  { name: "Troll",     glyph: "T", danger: 6, hp: 25, attack: 8, defense: 2, xp: 60, speed: 5  },
  rat:    { name: "Giant Rat", glyph: "r", danger: 0, hp: 4,  attack: 2, defense: 0, xp: 5,  speed: 9  },
  kobold: { name: "Kobold",    glyph: "k", danger: 1, hp: 5,  attack: 3, defense: 0, xp: 8,  speed: 9  },
  // fallback for unknown types
  monster: { name: "Monster", glyph: "m", danger: 2, hp: 8,  attack: 4, defense: 1, xp: 15, speed: 7  },
};

let _nextId = 1;

/**
 * Create a MonsterActor from a MobilePlacement.
 * Uses `placement.type` to look up a template in `templates`.
 */
export function createMonsterFromPlacement(
  placement: MobilePlacement,
  templates: Record<string, MonsterTemplate> = DEFAULT_MONSTER_TEMPLATES,
): MonsterActor {
  const template = templates[placement.type] ?? templates["monster"]!;
  const id = `monster_${_nextId++}`;
  return {
    id,
    kind: "monster",
    x: placement.x,
    y: placement.z, // content uses z for the Y axis
    speed: template.speed,
    alive: true,
    blocksMovement: true,
    name: template.name,
    glyph: template.glyph,
    danger: template.danger,
    hp: template.hp,
    maxHp: template.hp,
    attack: template.attack,
    defense: template.defense,
    xp: template.xp,
    alertState: "idle",
    searchTurnsLeft: 0,
    lastKnownPlayerPos: null,
  };
}

/**
 * Create MonsterActors from all mobiles in ContentOutputs.
 */
export function createMonstersFromMobiles(
  mobiles: MobilePlacement[],
  templates?: Record<string, MonsterTemplate>,
): MonsterActor[] {
  return mobiles.map(m => createMonsterFromPlacement(m, templates));
}
