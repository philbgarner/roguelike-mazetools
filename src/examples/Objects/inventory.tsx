import React, { useState, useRef } from 'react';
import styles from './Objects.module.css';
import { InventoryProps, InventorySlot, ItemType, Item } from '../../inventory';

export const Inventory: React.FC<InventoryProps> = ({ inventory, config, itemTypeRegistry, isOpen, onToggle, onUseItem, onRemoveItem }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const lastClickedIndexRef = useRef<number | null>(null);

  // Convert inventory items to slots using config
  const slots: InventorySlot[] = Array(config.slotCount).fill(null).map((_, index) => ({ index, item: null }));
  
  // Fill slots with items respecting stack limits
  let slotIndex = 0;
  inventory.forEach(item => {
    let remainingQuantity = item.quantity;
    const itemType = itemTypeRegistry[item.name];
    const maxStack = itemType?.maxStack || 99;
    
    while (remainingQuantity > 0 && slotIndex < slots.length) {
      const quantityToAdd = Math.min(remainingQuantity, maxStack);
      
      if (slots[slotIndex].item === null) {
        slots[slotIndex].item = {
          name: item.name,
          quantity: quantityToAdd,
          state: item.state
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

  const handleSlotClick = (slotIndex: number, item: Item) => {
    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    // Check if this is a second click on same slot (double click)
    if (lastClickedIndexRef.current === slotIndex) {
      // This is a double click
      handleSlotDoubleClick(item);
      lastClickedIndexRef.current = null;
    } else {
      // This might be first click, wait to see if there's a second click
      lastClickedIndexRef.current = slotIndex;
      clickTimeoutRef.current = setTimeout(() => {
        // No second click came, so this was a single click
        setSelectedIndex(selectedIndex === slotIndex ? null : slotIndex);
        lastClickedIndexRef.current = null;
        clickTimeoutRef.current = null;
      }, 250); // 250ms delay for double-click detection
    }
  };

  const handleSlotDoubleClick = (item: Item) => {
    // Clear any pending single click
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    lastClickedIndexRef.current = null;

    // Only use items that have onUse behavior (same as Use button)
    if (itemTypeRegistry[item.name]?.onUse) {
      handleUseItem(item, 1);
    }
    setSelectedIndex(null);
  };

  const handleUseItem = (item: Item, quantity: number) => {
  // Always call item-specific behavior first (if exists)
  if (itemTypeRegistry[item.name]?.onUse) {
    itemTypeRegistry[item.name].onUse!(item, quantity);
  }
  
    // Then call generic handler for inventory updates
    if (onUseItem) {
      onUseItem(item, quantity);
    }
  setSelectedIndex(null);
};

  const handleRemoveItem = (item: Item, quantity: number) => {
    if (onRemoveItem) {
      onRemoveItem(item, quantity);
    }
    setSelectedIndex(null);
  };

  const getSelectedItemInfo = () => {
    if (selectedIndex === null) return null;
    return slots[selectedIndex]?.item || null;
  };

  const selectedItemInfo = getSelectedItemInfo();

  return (
    <div className={styles.inventoryPanel}>
      <div className={styles.inventoryHeader}>
        <h3>{config.name}</h3>
      </div>
      {isOpen && (
        <div className={styles.inventoryContent}>
          <div className={styles.inventoryGrid}>
            {slots.map((slot, index) => (
              <div 
                key={index} 
                className={`${styles.inventorySlot} ${slot.item && selectedIndex === index ? styles.selectedSlot : ''}`}
                onClick={() => slot.item && handleSlotClick(index, slot.item)}
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
                  {itemTypeRegistry[selectedItemInfo.name]?.onUse && (
                    <button 
                      className={styles.useButton}
                      onClick={() => handleUseItem(selectedItemInfo, 1)}
                    >
                      Use
                    </button>
                  )}
                  <button 
                    className={styles.removeButton}
                    onClick={() => handleRemoveItem(selectedItemInfo, selectedItemInfo.quantity)}
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