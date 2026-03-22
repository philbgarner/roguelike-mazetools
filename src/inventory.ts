// Generic item interface - can represent any item type
export interface Item {
  name: string;
  quantity: number;
  state?: any; // Implemented per item type
}

// Item type definitions (reusable across game)
export interface ItemType {
  maxStack: number;
  isUsable?: boolean;
  initializeQuantity?: () => number;
}


// Generic inventory slot
export interface InventorySlot {
  index: number; // Slot position
  item: Item | null;
}

// Clean inventory config (behavior only)
export interface InventoryConfig {
  name: string;
  slotCount: number;
}

// Generic inventory props
export interface InventoryProps {
  inventory: Item[];
  config: InventoryConfig;
  isOpen: boolean;
  onToggle: () => void;
  onDoubleClickItem?: Function;
  onUseItem?: (item: Item, quantity: number) => void;
  onRemoveItem?: (item: Item, quantity: number) => void;
}