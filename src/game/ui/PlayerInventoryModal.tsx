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

export interface PlayerInventoryModalProps {
  visible: boolean;
  onClose: () => void;
  inventory: Inventory;
  /** Called when equip/unequip happens. Receives the updated inventory and stat delta. */
  onInventoryChange: (newInventory: Inventory, delta: StatDelta) => void;
}

export default function PlayerInventoryModal({
  visible,
  onClose,
  inventory,
  onInventoryChange,
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
            const isEquipped =
              inventory.equipped[item.slot] === item.instanceId;
            const statParts: string[] = [];
            if (template?.damageType)
              statParts.push(template.damageType);
            if (item.bonusAttack > 0)
              statParts.push(`+${item.bonusAttack} ATK`);
            if (item.bonusDefense > 0)
              statParts.push(`+${item.bonusDefense} DEF`);
            if (item.bonusMaxHp > 0) statParts.push(`+${item.bonusMaxHp} HP`);
            return (
              <div
                key={`${item.instanceId}_${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.25rem 0.4rem",
                  border: `1px solid ${isEquipped ? "#446" : "#333"}`,
                  background: isEquipped ? "#12121e" : "#111",
                }}
              >
                <span
                  style={{
                    fontFamily: "monospace",
                    color: "#ccc",
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
                {isEquipped ? (
                  <Button
                    maxWidth="6rem"
                    onClick={() => {
                      const { newInventory, delta } = unequipSlot(
                        inventory,
                        item.slot,
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
    </ModalPanel>
  );
}
