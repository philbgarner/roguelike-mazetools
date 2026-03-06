import Button from "./Button";
import ModalPanel from "./ModalPanel";
import {
  equipItem,
  unequipSlot,
  type Inventory,
  type InventoryItem,
} from "../inventory";
import { getItemTemplate } from "../data/itemData";
import type { StatDelta } from "../inventory";
import type { ActiveBuff } from "../activeBuffs";

export interface PlayerInventoryModalProps {
  visible: boolean;
  onClose: () => void;
  inventory: Inventory;
  /** Called when equip/unequip happens. Receives the updated inventory and stat delta. */
  onInventoryChange: (newInventory: Inventory, delta: StatDelta) => void;
  /** Called when a consumable item is used. */
  onUseConsumable?: (item: InventoryItem) => void;
  /** Currently active buff potions to display below the item list. */
  activeBuffs?: ActiveBuff[];
}

export default function PlayerInventoryModal({
  visible,
  onClose,
  inventory,
  onInventoryChange,
  onUseConsumable,
  activeBuffs,
}: PlayerInventoryModalProps) {
  return (
    <ModalPanel
      title="Inventory"
      visible={visible}
      closeButton
      onClose={onClose}
      maxHeight="60vh"
    >
      {inventory.items.length === 0 ? (
        <div style={{ color: "#888" }}>No items in inventory.</div>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
          {inventory.items.map((item: InventoryItem, index: number) => {
            const template = getItemTemplate(item.templateId);
            const isConsumable = !!item.isConsumable;
            const isEquipped =
              item.slot !== undefined &&
              inventory.equipped[item.slot] === item.instanceId;
            const statParts: string[] = [];
            if (template?.damageType)
              statParts.push(template.damageType);
            if (item.bonusAttack > 0)
              statParts.push(`+${item.bonusAttack} ATK`);
            if (item.bonusDefense > 0)
              statParts.push(`+${item.bonusDefense} DEF`);
            if (item.bonusMaxHp > 0 && !isConsumable)
              statParts.push(`+${item.bonusMaxHp} HP`);
            if (item.healAmount && item.healAmount > 0)
              statParts.push(`Heals ${item.healAmount} HP`);
            if (item.buffDuration && item.buffDuration > 0) {
              const buffParts: string[] = [];
              if (item.bonusAttack > 0) buffParts.push(`+${item.bonusAttack} ATK`);
              if (item.bonusDefense > 0) buffParts.push(`+${item.bonusDefense} DEF`);
              if (item.bonusMaxHp > 0) buffParts.push(`+${item.bonusMaxHp} HP`);
              if (item.bonusSpeed && item.bonusSpeed > 0) buffParts.push(`+${item.bonusSpeed} SPD`);
              if (buffParts.length > 0)
                statParts.push(`${buffParts.join(", ")} (${item.buffDuration} steps)`);
            }
            return (
              <div
                key={`${item.instanceId}_${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.25rem 0.4rem",
                  border: `1px solid ${isEquipped ? "#446" : isConsumable ? "#244" : "#333"}`,
                  background: isEquipped ? "#12121e" : isConsumable ? "#101a18" : "#111",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    color: isConsumable ? "#6ef" : "#ccc",
                    minWidth: "1.2rem",
                  }}
                >
                  {template?.glyph ?? "?"}
                </span>
                <span style={{ flex: 1, color: "#ddd" }}>
                  {item.nameOverride ?? template?.name ?? item.templateId}
                  {statParts.length > 0 && (
                    <span
                      style={{
                        color: "#888",
                        marginLeft: "0.5rem",
                        fontSize: "0.85em",
                      }}
                    >
                      {statParts.join(", ")}
                    </span>
                  )}
                </span>
                {isEquipped && (
                  <span style={{ color: "#88a", fontSize: "0.8em" }}>
                    [{item.slot}]
                  </span>
                )}
                {isConsumable ? (
                  <Button
                    maxWidth="5rem"
                    onClick={() => onUseConsumable?.(item)}
                  >
                    Use
                  </Button>
                ) : isEquipped ? (
                  <Button
                    maxWidth="6rem"
                    onClick={() => {
                      const { newInventory, delta } = unequipSlot(
                        inventory,
                        item.slot!,
                      );
                      onInventoryChange(newInventory, delta);
                    }}
                  >
                    Unequip
                  </Button>
                ) : (
                  <Button
                    maxWidth="5rem"
                    onClick={() => {
                      const { newInventory, delta } = equipItem(
                        inventory,
                        item.instanceId,
                      );
                      onInventoryChange(newInventory, delta);
                    }}
                  >
                    Equip
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeBuffs && activeBuffs.length > 0 && (
        <>
          <div
            style={{
              marginTop: "0.8rem",
              marginBottom: "0.3rem",
              color: "#6ef",
              fontSize: "0.85em",
              borderTop: "1px solid #333",
              paddingTop: "0.5rem",
            }}
          >
            Active Effects
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {activeBuffs.map((buff) => {
              const parts: string[] = [];
              if (buff.bonusAttack > 0) parts.push(`+${buff.bonusAttack} ATK`);
              if (buff.bonusDefense > 0) parts.push(`+${buff.bonusDefense} DEF`);
              if (buff.bonusMaxHp > 0) parts.push(`+${buff.bonusMaxHp} HP`);
              if (buff.bonusSpeed > 0) parts.push(`+${buff.bonusSpeed} SPD`);
              return (
                <div
                  key={buff.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85em",
                    color: "#adf",
                    padding: "0.15rem 0.4rem",
                    background: "#0a1820",
                  }}
                >
                  <span>{buff.name} ({parts.join(", ")})</span>
                  <span style={{ color: "#68a" }}>{buff.stepsRemaining} steps</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </ModalPanel>
  );
}
