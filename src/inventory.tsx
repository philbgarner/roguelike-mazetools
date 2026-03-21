import React, { useState } from 'react';
import styles from './examples/Objects/Objects.module.css';

interface InventoryItem {
  name: string;
  quantity: number;
}

interface ItemType {
  name: string;
  maxStack: number;
}

interface InventorySlot {
  item: InventoryItem | null;
}

interface InventoryProps {
  inventory: InventoryItem[];
  isOpen: boolean;
  onToggle: () => void;
  onUseItem?: (itemName: string, quantity: number) => void;
  onRemoveItem?: (itemName: string, quantity: number) => void;
}

// Define item types with their max stack sizes
const ITEM_TYPES: Record<string, ItemType> = {
  "Gold Coins": { name: "Gold Coins", maxStack: 999 },
  "Health Potion": { name: "Health Potion", maxStack: 20 },
  "Mana Potion": { name: "Mana Potion", maxStack: 20 },
  "Torch": { name: "Torch", maxStack: 10 },
  "Scroll": { name: "Scroll", maxStack: 5 },
  "Key": { name: "Key", maxStack: 1 },
  "Rations": { name: "Rations", maxStack: 50 }
};

// Define which items can be used
const USABLE_ITEMS = ["Health Potion", "Mana Potion", "Torch", "Rations"];

const Inventory: React.FC<InventoryProps> = ({ inventory, isOpen, onToggle, onUseItem, onRemoveItem }) => {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  // Convert inventory items to slots (6 slots total)
  const slots: InventorySlot[] = Array(6).fill(null).map(() => ({ item: null }));
  
  // Fill slots with items
  let slotIndex = 0;
  inventory.forEach(item => {
    let remainingQuantity = item.quantity;
    const itemType = ITEM_TYPES[item.name] || { name: item.name, maxStack: 99 };
    
    while (remainingQuantity > 0 && slotIndex < slots.length) {
      const maxStack = itemType.maxStack;
      const quantityToAdd = Math.min(remainingQuantity, maxStack);
      
      if (slots[slotIndex].item === null) {
        slots[slotIndex].item = {
          name: item.name,
          quantity: quantityToAdd
        };
        remainingQuantity -= quantityToAdd;
      } else if (slots[slotIndex].item?.name === item.name) {
        // Stack with existing item
        const currentStack = slots[slotIndex].item!.quantity;
        const canAdd = Math.min(maxStack - currentStack, remainingQuantity);
        slots[slotIndex].item!.quantity += canAdd;
        remainingQuantity -= canAdd;
      }
      
      slotIndex++;
    }
  });

  const handleSlotClick = (itemName: string) => {
    setSelectedItem(selectedItem === itemName ? null : itemName);
  };

  const handleUseItem = (itemName: string, quantity: number) => {
    if (onUseItem) {
      onUseItem(itemName, quantity);
    }
    setSelectedItem(null);
  };

  const handleRemoveItem = (itemName: string, quantity: number) => {
    if (onRemoveItem) {
      onRemoveItem(itemName, quantity);
    }
    setSelectedItem(null);
  };

  const getSelectedItemInfo = () => {
    if (!selectedItem) return null;
    return inventory.find(item => item.name === selectedItem);
  };

  const selectedItemInfo = getSelectedItemInfo();

  return (
    <div className={styles.inventoryPanel}>
      <div className={styles.inventoryHeader}>
        <h3>Inventory</h3>
      </div>
      {isOpen && (
        <div className={styles.inventoryContent}>
          <div className={styles.inventoryGrid}>
            {slots.map((slot, index) => (
              <div 
                key={index} 
                className={`${styles.inventorySlot} ${slot.item && selectedItem === slot.item.name ? styles.selectedSlot : ''}`}
                onClick={() => slot.item && handleSlotClick(slot.item.name)}
              >
                {slot.item ? (
                  <div className={styles.slotItem}>
                    <span className={styles.itemName}>{slot.item.name}</span>
                    <span className={styles.itemQuantity}>×{slot.item.quantity}</span>
                  </div>
                ) : (
                  <div className={styles.emptySlot}></div>
                )}
              </div>
            ))}
          </div>
          
          {selectedItemInfo && (
            <div className={styles.inventoryActions}>
              <div className={styles.inventoryActionItem}>
                <div className={styles.actionItemInfo}>
                  <span className={styles.itemName}>{selectedItemInfo.name}</span>
                  <span className={styles.itemQuantity}>×{selectedItemInfo.quantity}</span>
                </div>
                <div className={styles.actionItemButtons}>
                  {USABLE_ITEMS.includes(selectedItemInfo.name) && (
                    <button 
                      className={styles.useButton}
                      onClick={() => handleUseItem(selectedItemInfo.name, 1)}
                    >
                      Use
                    </button>
                  )}
                  <button 
                    className={styles.removeButton}
                    onClick={() => handleRemoveItem(selectedItemInfo.name, selectedItemInfo.quantity)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Inventory;