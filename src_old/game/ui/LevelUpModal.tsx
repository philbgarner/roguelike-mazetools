import React from "react";
import type { LevelUpReward } from "../levelUpRewards";
import { resistanceLabel } from "../levelUpRewards";
import { getItemTemplate } from "../data/itemData";
import styles from "./styles/ModalPanelBackdrop.module.css";

const RESIST_COLORS: Record<string, string> = {
  slash: "#ff8844",
  blunt: "#aa88ff",
  pierce: "#44ddff",
};

interface ChoiceCardProps {
  reward: LevelUpReward;
  onChoose: () => void;
}

function ChoiceCard({ reward, onChoose }: ChoiceCardProps) {
  const [hovered, setHovered] = React.useState(false);

  let title = "";
  let body: React.ReactNode = null;
  let accent = "#aaffaa";

  if (reward.kind === "stat") {
    title = reward.label;
    accent = "#88ff88";
    const parts: string[] = [];
    if (reward.hpBonus > 0) parts.push(`+${reward.hpBonus} Max HP`);
    if (reward.attackBonus > 0) parts.push(`+${reward.attackBonus} Attack`);
    if (reward.defenseBonus > 0) parts.push(`+${reward.defenseBonus} Defense`);
    body = parts.map((p) => (
      <div key={p} style={{ color: "#aaffaa", fontSize: "0.85em" }}>{p}</div>
    ));
  } else if (reward.kind === "resistance") {
    title = resistanceLabel(reward.resistance);
    accent = RESIST_COLORS[reward.resistance] ?? "#aaaaff";
    body = (
      <div style={{ color: "#cccccc", fontSize: "0.8em", lineHeight: 1.4 }}>
        Reduce incoming {reward.resistance} damage by 25%
      </div>
    );
  } else if (reward.kind === "item") {
    const template = getItemTemplate(reward.item.templateId);
    title = reward.item.nameOverride ?? template?.name ?? "Item";
    accent = "#ffdd88";
    const statParts: string[] = [];
    if (reward.item.bonusAttack > 0) statParts.push(`+${reward.item.bonusAttack} ATK`);
    if (reward.item.bonusDefense > 0) statParts.push(`+${reward.item.bonusDefense} DEF`);
    if (reward.item.bonusMaxHp > 0) statParts.push(`+${reward.item.bonusMaxHp} HP`);
    body = (
      <>
        <div style={{ color: "#aaaaaa", fontSize: "0.75em", marginBottom: "0.3em" }}>
          {template?.type ?? ""} · {template?.slot ?? ""}
          {template?.damageType ? ` · ${template.damageType}` : ""}
        </div>
        {statParts.map((p) => (
          <div key={p} style={{ color: "#ffdd88", fontSize: "0.85em" }}>{p}</div>
        ))}
      </>
    );
  }

  return (
    <div
      onClick={onChoose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        border: `2px solid ${hovered ? accent : "#444"}`,
        borderRadius: "4px",
        background: hovered ? "#222" : "#181818",
        padding: "1rem",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minHeight: "8rem",
      }}
    >
      <div style={{ color: accent, fontWeight: "bold", fontSize: "0.95em" }}>{title}</div>
      <div>{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface LevelUpModalProps {
  newLevel: number;
  rewards: LevelUpReward[];
  onChoose: (reward: LevelUpReward) => void;
}

export default function LevelUpModal({ newLevel, rewards, onChoose }: LevelUpModalProps) {
  return (
    <div className={styles.modalPanelBackdrop}>
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(56vw, 640px)",
          background: "#191919",
          border: "2px solid #666",
          borderRadius: "6px",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          zIndex: 1000,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#ffdd55", fontSize: "1.2em", fontWeight: "bold" }}>
            Level Up!
          </div>
          <div style={{ color: "#aaaaaa", fontSize: "0.85em", marginTop: "0.25rem" }}>
            You reached level {newLevel}. Choose a reward:
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {rewards.map((reward, i) => (
            <ChoiceCard key={i} reward={reward} onChoose={() => onChoose(reward)} />
          ))}
        </div>
      </div>
    </div>
  );
}
