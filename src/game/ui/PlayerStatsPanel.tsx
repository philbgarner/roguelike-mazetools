import ModalPanel from "./ModalPanel";
import type { Inventory } from "../inventory";
import type { DamageType } from "../data/itemData";
import { xpToReachLevel } from "../../resolve/levelBudget";

export interface PlayerStatsPanelProps {
  visible: boolean;
  onClose: () => void;
  inventory: Inventory;
  attack: number;
  defense: number;
  maxHp: number;
  hp: number;
  level: number;
  xp: number;
  resistances: DamageType[];
}

const DAMAGE_TYPE_COLORS: Record<DamageType, string> = {
  slash: "#f08040",
  blunt: "#c080f0",
  pierce: "#40b0f0",
};

export default function PlayerStatsPanel({
  visible,
  onClose,
  inventory,
  attack,
  defense,
  maxHp,
  hp,
  level,
  xp,
  resistances,
}: PlayerStatsPanelProps) {
  const equippedItems = inventory.items.filter(
    (it) => inventory.equipped[it.slot] === it.instanceId,
  );
  const bonusAtk = equippedItems.reduce((s, it) => s + it.bonusAttack, 0);
  const bonusDef = equippedItems.reduce((s, it) => s + it.bonusDefense, 0);
  const bonusHp = equippedItems.reduce((s, it) => s + it.bonusMaxHp, 0);
  const baseAtk = attack - bonusAtk;
  const baseDef = defense - bonusDef;
  const baseHp = maxHp - bonusHp;

  const xpForNextLevel = xpToReachLevel(level + 1);
  const xpToNext = xpForNextLevel - xp;

  const cellStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "0.2rem 0",
    borderBottom: "1px solid #2a2a2a",
  };

  const row = (label: string, base: number, bonus: number) => (
    <div key={label} style={cellStyle}>
      <span style={{ color: "#aaa" }}>{label}</span>
      <span>
        <span style={{ color: "#eee" }}>{base}</span>
        {bonus !== 0 && (
          <>
            <span style={{ color: bonus > 0 ? "#6f6" : "#f66", marginLeft: "0.25rem" }}>
              ({bonus > 0 ? "+" : ""}{bonus})
            </span>
            <span style={{ color: "#eee", marginLeft: "0.25rem" }}>= {base + bonus}</span>
          </>
        )}
      </span>
    </div>
  );

  const simpleRow = (label: string, value: React.ReactNode, last = false) => (
    <div style={{ ...cellStyle, borderBottom: last ? "none" : cellStyle.borderBottom }}>
      <span style={{ color: "#aaa" }}>{label}</span>
      <span style={{ color: "#eee" }}>{value}</span>
    </div>
  );

  return (
    <ModalPanel title="Character Stats" visible={visible} closeButton onClose={onClose} maxHeight="55vh">
      <div style={{ fontSize: "0.85rem" }}>
        <div style={{ color: "#f0d060", fontWeight: "bold", marginBottom: "0.5rem" }}>
          Attributes
        </div>
        {row("HP", baseHp, bonusHp)}
        {row("ATK", baseAtk, bonusAtk)}
        {row("DEF", baseDef, bonusDef)}

        <div style={{ color: "#f0d060", fontWeight: "bold", margin: "0.6rem 0 0.3rem" }}>
          Level &amp; Experience
        </div>
        {simpleRow("Level", level)}
        {simpleRow("XP", xp)}
        {simpleRow("Next level", `${xpToNext} XP needed`)}

        <div style={{ color: "#f0d060", fontWeight: "bold", margin: "0.6rem 0 0.3rem" }}>
          Resistances
        </div>
        {resistances.length === 0 ? (
          <div style={{ color: "#666", padding: "0.2rem 0" }}>None</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", padding: "0.2rem 0" }}>
            {resistances.map((r, i) => (
              <span
                key={i}
                style={{
                  color: DAMAGE_TYPE_COLORS[r] ?? "#eee",
                  background: "#1a1a1a",
                  border: `1px solid ${DAMAGE_TYPE_COLORS[r] ?? "#555"}`,
                  padding: "0.1rem 0.4rem",
                  fontSize: "0.8em",
                  textTransform: "capitalize",
                }}
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </ModalPanel>
  );
}
