import { createInventory, Inventory } from "./inventory";
import type { DamageType } from "./data/itemData";
import type { ActiveBuff } from "./activeBuffs";

export interface Player {
  name?: string;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  attack: number;
  defense: number;
  gold: number;
  inventory: Inventory;
  resistances: DamageType[];
  /** Currently active timed buff potions. */
  activeBuffs: ActiveBuff[];
}

/** Extract the persistent Player fields from a PlayerActor. */
export function playerFromActor(actor: {
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  attack: number;
  defense: number;
  gold?: number;
  inventory?: Inventory;
  resistances?: DamageType[];
  activeBuffs?: ActiveBuff[];
}): Player {
  return {
    hp: actor.hp,
    maxHp: actor.maxHp,
    xp: actor.xp,
    level: actor.level,
    attack: actor.attack,
    defense: actor.defense,
    gold: actor.gold ?? 100,
    inventory: actor.inventory ?? createInventory(),
    resistances: actor.resistances ?? [],
    activeBuffs: actor.activeBuffs ?? [],
    name: (actor as { name?: string }).name,
  };
}

export const DEFAULT_PLAYER: Player = {
  hp: 20,
  maxHp: 20,
  xp: 0,
  level: 1,
  attack: 5,
  defense: 1,
  gold: 100,
  inventory: createInventory(),
  resistances: [],
  activeBuffs: [],
};
