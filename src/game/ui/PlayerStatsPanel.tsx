import BorderPanel from "./BorderPanel";
import type { Inventory } from "../inventory";

export interface PlayerStatsPanelProps {
  visible: boolean;
  inventory: Inventory;
  attack: number;
  defense: number;
  maxHp: number;
  hp: number;
  level: number;
  xp: number;
}

export default function PlayerStatsPanel({
  visible,
  inventory,
  attack,
  defense,
  maxHp,
  hp,
  level,
  xp,
}: PlayerStatsPanelProps) {
  if (!visible) return null;

  const equippedItems = inventory.items.filter(
    (it) => inventory.equipped[it.slot] === it.instanceId,
  );
  const bonusAtk = equippedItems.reduce((s, it) => s + it.bonusAttack, 0);
  const bonusDef = equippedItems.reduce((s, it) => s + it.bonusDefense, 0);
  const bonusHp = equippedItems.reduce((s, it) => s + it.bonusMaxHp, 0);
  const baseAtk = attack - bonusAtk;
  const baseDef = defense - bonusDef;
  const baseHp = maxHp - bonusHp;

  const row = (label: string, base: number, bonus: number) => (
    <div
      key={label}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.5rem",
        padding: "0.15rem 0",
        borderBottom: "1px solid #333",
      }}
    >
      <span style={{ color: "#aaa" }}>{label}</span>
      <span>
        <span style={{ color: "#eee" }}>{base}</span>
        {bonus !== 0 && (
          <>
            <span
              style={{
                color: bonus > 0 ? "#6f6" : "#f66",
                marginLeft: "0.25rem",
              }}
            >
              ({bonus > 0 ? "+" : ""}{bonus})
            </span>
            <span style={{ color: "#eee", marginLeft: "0.25rem" }}>
              = {base + bonus}
            </span>
          </>
        )}
      </span>
    </div>
  );

  return (
    <BorderPanel
      right="10vw"
      top="30vh"
      width="15vw"
      height="30vh"
      background="rgb(25, 25, 25)"
      zIndex={999999}
    >
      <div style={{ fontSize: "0.85rem", padding: "0.25rem" }}>
        <div style={{ color: "#f0d060", fontWeight: "bold", marginBottom: "0.4rem" }}>
          Stats
        </div>
        {row("HP", baseHp, bonusHp)}
        {row("ATK", baseAtk, bonusAtk)}
        {row("DEF", baseDef, bonusDef)}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "0.15rem 0",
            borderBottom: "1px solid #333",
          }}
        >
          <span style={{ color: "#aaa" }}>Level</span>
          <span style={{ color: "#eee" }}>{level}</span>
        </div>
        <div
          style={{ display: "flex", justifyContent: "space-between", padding: "0.15rem 0" }}
        >
          <span style={{ color: "#aaa" }}>XP</span>
          <span style={{ color: "#eee" }}>{xp}</span>
        </div>
      </div>
    </BorderPanel>
  );
}
