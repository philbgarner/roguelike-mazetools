/**
 * Inventory system.
 *
 * An Inventory holds a bag of InventoryItems and tracks which item occupies
 * each EquipSlot.  All mutations are pure — functions return a new Inventory
 * and a StatDelta that the caller applies to the actor's stats.
 */

import { EquipSlot, ItemTemplate } from "./data/itemData";

export type { EquipSlot } from "./data/itemData";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** A concrete item instance (not a template — has real bonus values). */
export type InventoryItem = {
  instanceId: string;
  /** References ItemTemplate.id */
  templateId: string;
  /**
   * Slot this item occupies when equipped (copied from the template).
   * Undefined for consumables — they cannot be equipped.
   */
  slot?: EquipSlot;
  bonusAttack: number;
  bonusDefense: number;
  bonusMaxHp: number;
  /** Gold value if sold or dropped as loot. */
  value: number;
  /** Optional override for the display name (e.g. "Axe +1" for a level-scaled item). */
  nameOverride?: string;
  /** True for potions and other single-use items. */
  isConsumable?: boolean;
  /** Healing potions: HP restored on use. */
  healAmount?: number;
  /** TTL buff potions: number of player move steps the effect lasts. */
  buffDuration?: number;
  /** TTL buff: speed bonus applied while active. */
  bonusSpeed?: number;
};

export type Inventory = {
  /** All items the actor is carrying, including currently equipped ones. */
  items: InventoryItem[];
  /** Maps each slot to the instanceId of the item equipped there. */
  equipped: Partial<Record<EquipSlot, string>>;
};

/** Net stat change to apply to an actor after an equip/unequip operation. */
export type StatDelta = {
  attack: number;
  defense: number;
  maxHp: number;
};

const ZERO_DELTA: StatDelta = { attack: 0, defense: 0, maxHp: 0 };

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createInventory(): Inventory {
  return { items: [], equipped: {} };
}

/**
 * Create an InventoryItem from a template and computed bonus values.
 * `instanceId` must be unique across all items in the game world.
 */
export function createInventoryItem(
  instanceId: string,
  template: ItemTemplate,
  bonusAttack: number,
  bonusDefense: number,
  bonusMaxHp: number,
  value: number,
  nameOverride?: string,
): InventoryItem {
  return {
    instanceId,
    templateId: template.id,
    slot: template.slot,
    bonusAttack,
    bonusDefense,
    bonusMaxHp,
    value,
    ...(nameOverride ? { nameOverride } : {}),
  };
}

// ---------------------------------------------------------------------------
// Pure inventory mutations
// ---------------------------------------------------------------------------

/** Add an item to the bag (does not equip it). */
export function addItem(inventory: Inventory, item: InventoryItem): Inventory {
  return { ...inventory, items: [...inventory.items, item] };
}

/**
 * Remove an item from the bag by instanceId.
 * If the item was equipped, it is automatically unequipped (no stat delta is
 * returned here — call unequipSlot first if you need to reverse bonuses).
 */
export function removeItem(
  inventory: Inventory,
  instanceId: string,
): Inventory {
  const equipped = Object.fromEntries(
    Object.entries(inventory.equipped).filter(([, id]) => id !== instanceId),
  ) as Partial<Record<EquipSlot, string>>;
  return {
    items: inventory.items.filter((i) => i.instanceId !== instanceId),
    equipped,
  };
}

/**
 * Equip an item that is already in the bag.
 *
 * If the slot was already occupied, the old item is automatically unequipped
 * and its bonuses are included in the returned delta (as negative values).
 *
 * Returns `{ newInventory, delta }`.  Apply `delta` to the actor's stats.
 */
export function equipItem(
  inventory: Inventory,
  instanceId: string,
): { newInventory: Inventory; delta: StatDelta } {
  const item = inventory.items.find((i) => i.instanceId === instanceId);
  if (!item) return { newInventory: inventory, delta: { ...ZERO_DELTA } };
  // Consumables have no slot and cannot be equipped
  if (!item.slot) return { newInventory: inventory, delta: { ...ZERO_DELTA } };

  const delta: StatDelta = { attack: 0, defense: 0, maxHp: 0 };
  const equipped = { ...inventory.equipped };

  // Reverse bonuses of any item currently in the same slot
  const displacedId = equipped[item.slot];
  if (displacedId && displacedId !== instanceId) {
    const displaced = inventory.items.find((i) => i.instanceId === displacedId);
    if (displaced) {
      delta.attack -= displaced.bonusAttack;
      delta.defense -= displaced.bonusDefense;
      delta.maxHp -= displaced.bonusMaxHp;
    }
  }

  // Apply new item's bonuses
  delta.attack += item.bonusAttack;
  delta.defense += item.bonusDefense;
  delta.maxHp += item.bonusMaxHp;

  equipped[item.slot] = instanceId;
  return { newInventory: { ...inventory, equipped }, delta };
}

/**
 * Unequip whatever is in `slot`.
 *
 * Returns `{ newInventory, delta }` where delta reverses the item's bonuses.
 * If the slot is empty, delta is all zeros.
 */
export function unequipSlot(
  inventory: Inventory,
  slot: EquipSlot,
): { newInventory: Inventory; delta: StatDelta } {
  const instanceId = inventory.equipped[slot];
  if (!instanceId) return { newInventory: inventory, delta: { ...ZERO_DELTA } };

  const item = inventory.items.find((i) => i.instanceId === instanceId);
  const delta: StatDelta = item
    ? {
        attack: -item.bonusAttack,
        defense: -item.bonusDefense,
        maxHp: -item.bonusMaxHp,
      }
    : { ...ZERO_DELTA };

  const equipped = { ...inventory.equipped };
  delete equipped[slot];
  return { newInventory: { ...inventory, equipped }, delta };
}

/** Return the InventoryItem equipped in a slot, or undefined. */
export function getEquipped(
  inventory: Inventory,
  slot: EquipSlot,
): InventoryItem | undefined {
  const id = inventory.equipped[slot];
  return id ? inventory.items.find((i) => i.instanceId === id) : undefined;
}
