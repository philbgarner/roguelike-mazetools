import React, { useState, useRef } from 'react';
import styles from './Objects.module.css';
import { InventoryProps, InventorySlot, Item } from '../../inventory';

export const Inventory: React.FC<InventoryProps> = ({ inventory, inventoryName, itemTypeRegistry, isOpen, onToggle, onUseItem, onRemoveItem }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const lastClickedIndexRef = useRef<number | null>(null);

  // Inventory is now already an array of slots
  const slots = inventory;

  const handleSlotClick = (slotIndex: number, slot: InventorySlot) => {
    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    // Check if this is a second click on same slot (double click)
    if (lastClickedIndexRef.current === slotIndex) {
      // This is a double click
      handleSlotDoubleClick(slot);
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

  const handleSlotDoubleClick = (slot: InventorySlot) => {
    // Clear any pending single click
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    lastClickedIndexRef.current = null;

    // Only use items that have onUse behavior (same as Use button)
    if (slot.item && itemTypeRegistry[slot.item.name]?.onUse) {
      handleUseItem(slot, 1);
    }
    setSelectedIndex(null);
  };

  const handleUseItem = (slot: InventorySlot, quantity: number) => {
    // Always call item-specific behavior first (if exists)
    if (slot.item && itemTypeRegistry[slot.item.name]?.onUse) {
      itemTypeRegistry[slot.item.name].onUse!(slot.item, quantity);
    }
  
    // Then call generic handler for inventory updates
    if (onUseItem) {
      onUseItem(slot);
    }
    setSelectedIndex(null);
};

  const handleRemoveItem = (slot: InventorySlot) => {
    if (onRemoveItem) {
      onRemoveItem(slot);
    }
    setSelectedIndex(null);
  };

  const getSelectedItemInfo = () => {
    if (selectedIndex === null) return null;
    return slots[selectedIndex] || null;
  };

  const selectedItemInfo = getSelectedItemInfo();

  return (
    <div className={styles.inventoryPanel}>
      <div className={styles.inventoryHeader}>
        <h3>{inventoryName}</h3>
      </div>
      {isOpen && (
        <div className={styles.inventoryContent}>
          <div className={styles.inventoryGrid}>
            {slots.map((slot, index) => (
              <div 
                key={index} 
                className={`${styles.inventorySlot} ${slot.item && selectedIndex === index ? styles.selectedSlot : ''}`}
                onClick={() => slot.item && handleSlotClick(index, slot)}
              >
                {slot.item ? (
                  <div className={styles.slotItem}>
                    <span className={styles.itemName}>{slot.item.name}</span>
                    <span className={styles.itemQuantity}>×{slot.quantity}</span>
                  </div>
                ) : (
                  <div className={styles.emptySlot}></div>
                )}
              </div>
            ))}
          </div>
          
          {selectedItemInfo && selectedItemInfo.item && (
            <div className={styles.inventoryActions}>
              <div className={styles.inventoryActionItem}>
                <div className={styles.actionItemInfo}>
                  <span className={styles.itemName}>{selectedItemInfo.item.name}</span>
                  <span className={styles.itemQuantity}>×{selectedItemInfo.quantity}</span>
                </div>
                <div className={styles.actionItemButtons}>
                  {itemTypeRegistry[selectedItemInfo.item.name]?.onUse && (
                    <button 
                      className={styles.useButton}
                      onClick={() => handleUseItem(selectedItemInfo, 1)}
                    >
                      Use
                    </button>
                  )}
                  <button 
                    className={styles.removeButton}
                    onClick={() => handleRemoveItem(selectedItemInfo)}
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