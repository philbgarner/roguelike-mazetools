import React from "react";
import BorderPanel from "./BorderPanel";
import Button from "./Button";
import { Inventory, InventoryItem } from "../inventory";
import { getItemTemplate } from "../data/itemData";

export interface QuickSlotPanelProps {
  inventory: Inventory;
  /** Position props forwarded to BorderPanel */
  left?: string;
  right?: string;
  bottom?: string;
  top?: string;
  width?: string;
  onEquipToggle: (item: InventoryItem) => void;
  onUseConsumable: (item: InventoryItem) => void;
  onSlotHover?: (item: InventoryItem, e: React.MouseEvent) => void;
  onSlotHoverEnd?: () => void;
}

function isHealPotion(item: InventoryItem): boolean {
  return item.templateId.startsWith("heal_potion");
}

function isDagger(item: InventoryItem): boolean {
  return item.templateId === "dagger";
}

function buildSlots(inventory: Inventory): InventoryItem[] {
  const { items } = inventory;

  // Weapons (slot === "weapon"): non-daggers first, then daggers grouped together
  const nonDaggerWeapons = items.filter(
    (it) => it.slot === "weapon" && !isDagger(it),
  );
  const daggers = items.filter((it) => it.slot === "weapon" && isDagger(it));

  // Heal potions
  const healPotions = items.filter((it) => it.isConsumable && isHealPotion(it));

  // Other potions (consumable but not heal)
  const otherPotions = items.filter(
    (it) => it.isConsumable && !isHealPotion(it),
  );

  return [...nonDaggerWeapons, ...daggers, ...healPotions, ...otherPotions];
}

export default function QuickSlotPanel({
  inventory,
  left,
  right,
  bottom,
  top,
  width = "calc(100% - 43rem)",
  onEquipToggle,
  onUseConsumable,
  onSlotHover,
  onSlotHoverEnd,
}: QuickSlotPanelProps) {
  const slots = buildSlots(inventory);

  if (slots.length === 0) return null;

  return (
    <BorderPanel
      width={width}
      height="5rem"
      background="#050505"
      left={left}
      right={right}
      bottom={bottom ?? "0px"}
      top={top}
      flexMode="Row"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "0.3rem",
          padding: "0 0.4rem",
          flexWrap: "nowrap",
          overflowX: "auto",
          width: "100%",
        }}
      >
        {slots.map((item, idx) => {
          const template = getItemTemplate(item.templateId);
          const isEquipped =
            item.slot !== undefined &&
            inventory.equipped[item.slot] === item.instanceId;
          const label = item.nameOverride ?? template?.name ?? item.templateId;
          const glyph = template?.glyph ?? "?";

          // Insert a visual separator before the first dagger when preceded by a non-dagger weapon
          const prevItem = idx > 0 ? slots[idx - 1] : null;
          const isDaggerGroupStart =
            isDagger(item) && prevItem !== null && !isDagger(prevItem);

          return (
            <React.Fragment key={item.instanceId}>
              {isDaggerGroupStart && (
                <div
                  style={{
                    width: "1px",
                    height: "2rem",
                    background: "#444",
                    flexShrink: 0,
                  }}
                />
              )}
              <Button
                background={isEquipped ? "#1a3a1a" : undefined}
                onClick={() => {
                  if (item.isConsumable) {
                    onUseConsumable(item);
                  } else {
                    onEquipToggle(item);
                  }
                }}
                onMouseEnter={(e) => onSlotHover?.(item, e)}
                onMouseLeave={() => onSlotHoverEnd?.()}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.1rem",
                    padding: "0.1rem 0.25rem",
                    minWidth: "2.8rem",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: isEquipped
                        ? "#8f8"
                        : item.isConsumable
                          ? "#fa8"
                          : "#ccc",
                      fontSize: "1rem",
                    }}
                  >
                    {glyph}
                  </span>
                  <span
                    style={{
                      fontSize: "0.6rem",
                      color: isEquipped ? "#8f8" : "#999",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "5rem",
                    }}
                  >
                    {label}
                  </span>
                </div>
              </Button>
            </React.Fragment>
          );
        })}
      </div>
    </BorderPanel>
  );
}
