// Generic item interface - can represent any item type
export interface Item {
  name: string;
  state?: any; // Implemented per item type
}

// Item type definitions (reusable across game)
export interface ItemType {
  maxStack: number;
  onUse?: (item: Item, quantity: number) => void; // Item-specific behavior
  initializeQuantity?: () => number;
}

// Generic inventory slot
export interface InventorySlot {
  index: number; // Slot position
  item: Item | null;
  quantity: number; // How many of this item in this slot
}

// Generic inventory props
export interface InventoryProps {
  inventory: InventorySlot[]; // Array of slots, not items
  inventoryName: string;
  itemTypeRegistry: Record<string, ItemType>; // Game item definitions
  isOpen: boolean;
  onToggle: () => void;
  onUseItem?: (slot: InventorySlot) => void;
  onRemoveItem?: (slot: InventorySlot) => void;
}