import { useState } from "react";
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
import { useGame } from "../GameProvider";

export interface PlayerInventoryModalProps {
  visible: boolean;
  onClose: () => void;
  inventory: Inventory;
  /** Current player stats used to compute before/after tooltip. */
  playerStats?: { attack: number; defense: number; maxHp: number };
  /** Called when equip/unequip happens. Receives the updated inventory and stat delta. */
  onInventoryChange: (newInventory: Inventory, delta: StatDelta) => void;
  /** Called when a consumable item is used. */
  onUseConsumable?: (item: InventoryItem) => void;
  /** Currently active buff potions to display below the item list. */
  activeBuffs?: ActiveBuff[];
}

function StatRow({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}) {
  const diff = after - before;
  const diffColor = diff > 0 ? "#6f6" : diff < 0 ? "#f66" : "#888";
  const diffStr = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "—";
  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
      <span style={{ color: "#888", minWidth: "2.8rem" }}>{label}:</span>
      <span style={{ color: "#ccc", minWidth: "1.8rem", textAlign: "right" }}>
        {before}
      </span>
      <span style={{ color: "#555" }}>→</span>
      <span
        style={{
          color: diff !== 0 ? "#eee" : "#888",
          minWidth: "1.8rem",
          textAlign: "right",
        }}
      >
        {after}
      </span>
      <span
        style={{ color: diffColor, minWidth: "2.4rem", textAlign: "right" }}
      >
        ({diffStr})
      </span>
    </div>
  );
}

function EquipTooltip({
  delta,
  playerStats,
}: {
  delta: StatDelta;
  playerStats: { attack: number; defense: number; maxHp: number };
}) {
  return (
    <div
      style={{
        position: "absolute",
        right: "calc(100% + 0.5rem)",
        top: "50%",
        transform: "translateY(-50%)",
        background: "#1a1a2e",
        border: "1px solid #446",
        padding: "0.5rem 0.7rem",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontFamily: "monospace",
        whiteSpace: "nowrap",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
      }}
    >
      <div style={{ color: "#aaa", marginBottom: "0.2rem", fontSize: "0.9em" }}>
        Before → After
      </div>
      <StatRow
        label="ATK"
        before={playerStats.attack}
        after={playerStats.attack + delta.attack}
      />
      <StatRow
        label="DEF"
        before={playerStats.defense}
        after={playerStats.defense + delta.defense}
      />
      <StatRow
        label="MaxHP"
        before={playerStats.maxHp}
        after={playerStats.maxHp + delta.maxHp}
      />
    </div>
  );
}

export default function PlayerInventoryModal({
  visible,
  onClose,
  inventory,
  playerStats,
  onInventoryChange,
  onUseConsumable,
  activeBuffs,
}: PlayerInventoryModalProps) {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const { playSfx } = useGame();

  return (
    <ModalPanel
      title="Inventory"
      visible={visible}
      closeButton
      scrollContents
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
            if (template?.damageType) statParts.push(template.damageType);
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
              if (item.bonusAttack > 0)
                buffParts.push(`+${item.bonusAttack} ATK`);
              if (item.bonusDefense > 0)
                buffParts.push(`+${item.bonusDefense} DEF`);
              if (item.bonusMaxHp > 0) buffParts.push(`+${item.bonusMaxHp} HP`);
              if (item.bonusSpeed && item.bonusSpeed > 0)
                buffParts.push(`+${item.bonusSpeed} SPD`);
              if (buffParts.length > 0)
                statParts.push(
                  `${buffParts.join(", ")} (${item.buffDuration} steps)`,
                );
            }

            // Compute delta for tooltip preview
            const isHovered = hoveredItemId === item.instanceId;
            let previewDelta: StatDelta | null = null;
            if (isHovered && playerStats && !isConsumable) {
              if (isEquipped) {
                previewDelta = unequipSlot(inventory, item.slot!).delta;
              } else {
                previewDelta = equipItem(inventory, item.instanceId).delta;
              }
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
                  background: isEquipped
                    ? "#12121e"
                    : isConsumable
                      ? "#101a18"
                      : "#111",
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
                  <div
                    style={{ position: "relative" }}
                    onMouseEnter={() => setHoveredItemId(item.instanceId)}
                    onMouseLeave={() => setHoveredItemId(null)}
                  >
                    {isHovered && previewDelta && playerStats && (
                      <EquipTooltip
                        delta={previewDelta}
                        playerStats={playerStats}
                      />
                    )}
                    <Button
                      maxWidth="6rem"
                      onClick={() => {
                        if (item.slot === "weapon") {
                          const template = getItemTemplate(item.templateId);
                          playSfx(
                            template?.isRanged
                              ? "bow-unequip"
                              : "sword-unequip",
                          );
                        }
                        const { newInventory, delta } = unequipSlot(
                          inventory,
                          item.slot!,
                        );
                        onInventoryChange(newInventory, delta);
                      }}
                    >
                      Unequip
                    </Button>
                  </div>
                ) : (
                  <div
                    style={{ position: "relative" }}
                    onMouseEnter={() => setHoveredItemId(item.instanceId)}
                    onMouseLeave={() => setHoveredItemId(null)}
                  >
                    {isHovered && previewDelta && playerStats && (
                      <EquipTooltip
                        delta={previewDelta}
                        playerStats={playerStats}
                      />
                    )}
                    <Button
                      maxWidth="5rem"
                      onClick={() => {
                        if (item.slot === "weapon") {
                          const template = getItemTemplate(item.templateId);
                          playSfx(
                            template?.isRanged ? "bow-equip" : "sword-equip",
                          );
                        }
                        const { newInventory, delta } = equipItem(
                          inventory,
                          item.instanceId,
                        );
                        onInventoryChange(newInventory, delta);
                      }}
                    >
                      Equip
                    </Button>
                  </div>
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
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
          >
            {activeBuffs.map((buff) => {
              const parts: string[] = [];
              if (buff.bonusAttack > 0) parts.push(`+${buff.bonusAttack} ATK`);
              if (buff.bonusDefense > 0)
                parts.push(`+${buff.bonusDefense} DEF`);
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
                  <span>
                    {buff.name} ({parts.join(", ")})
                  </span>
                  <span style={{ color: "#68a" }}>
                    {buff.stepsRemaining} steps
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </ModalPanel>
  );
}
