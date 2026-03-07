import React from "react";
import type {
  SecretLocationTemplate,
  SecretChoice,
  SecretOutcome,
} from "../data/secretLocationData";
import { getItemTemplate } from "../data/itemData";
import styles from "./styles/ModalPanelBackdrop.module.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function outcomeDescription(outcome: SecretOutcome): string {
  switch (outcome.kind) {
    case "gold":
      return `+${outcome.amount} gold`;
    case "xp":
      return `+${outcome.amount} experience`;
    case "stat": {
      const parts: string[] = [];
      if (outcome.hpBonus > 0) parts.push(`+${outcome.hpBonus} Max HP`);
      if (outcome.attackBonus > 0) parts.push(`+${outcome.attackBonus} Attack`);
      if (outcome.defenseBonus > 0)
        parts.push(`+${outcome.defenseBonus} Defense`);
      return parts.length > 0 ? parts.join(", ") : outcome.label;
    }
    case "resistance":
      return `Gained ${outcome.resistance} resistance`;
    case "item": {
      const template = getItemTemplate(outcome.templateId);
      const name = outcome.nameOverride ?? template?.name ?? outcome.templateId;
      const parts: string[] = [];
      if (outcome.attackBonus > 0) parts.push(`+${outcome.attackBonus} ATK`);
      if (outcome.defenseBonus > 0) parts.push(`+${outcome.defenseBonus} DEF`);
      if (outcome.hpBonus > 0) parts.push(`+${outcome.hpBonus} HP`);
      return `Found: ${name}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
    }
    case "nothing":
      return outcome.message;
    case "curse":
      return `${outcome.message} (-${outcome.hpLoss} HP)`;
  }
}

function outcomeColor(outcome: SecretOutcome): string {
  switch (outcome.kind) {
    case "gold":
      return "#ffdd88";
    case "xp":
      return "#88ddff";
    case "stat":
      return "#aaffaa";
    case "resistance":
      return "#ff8844";
    case "item":
      return "#ffdd88";
    case "nothing":
      return "#aaaaaa";
    case "curse":
      return "#ff6666";
  }
}

// ---------------------------------------------------------------------------
// Choice card
// ---------------------------------------------------------------------------

interface ChoiceCardProps {
  choice: SecretChoice;
  onChoose: () => void;
}

function ChoiceCard({ choice, onChoose }: ChoiceCardProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onClick={onChoose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        border: `2px solid ${hovered ? "#aaaaaa" : "#444"}`,
        borderRadius: "4px",
        background: hovered ? "#222" : "#181818",
        padding: "1rem",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        minHeight: "6rem",
      }}
    >
      <div style={{ color: "#cccccc", fontSize: "0.9em", lineHeight: 1.4 }}>
        {choice.label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface SecretLocationModalProps {
  template: SecretLocationTemplate;
  /** Called when the player makes a choice. Apply the outcome externally. */
  onChoose: (choice: SecretChoice) => void;
  /** Called when the player dismisses the result screen. */
  onClose: () => void;
}

export default function SecretLocationModal({
  template,
  onChoose,
  onClose,
}: SecretLocationModalProps) {
  const [chosen, setChosen] = React.useState<SecretChoice | null>(null);

  function handleChoose(choice: SecretChoice) {
    setChosen(choice);
    onChoose(choice);
  }

  return (
    <div className={styles.modalPanelBackdrop}>
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(52vw, 580px)",
          background: "#191919",
          border: "2px solid #555",
          borderRadius: "6px",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          zIndex: 1000,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              color: "#ccaa66",
              fontSize: "1.1em",
              fontWeight: "bold",
              letterSpacing: "0.05em",
            }}
          >
            {template.name}
          </div>
          <div
            style={{
              color: "#888888",
              fontSize: "0.82em",
              marginTop: "0.5rem",
              lineHeight: 1.5,
              maxWidth: "42ch",
              margin: "0.5rem auto 0",
            }}
          >
            {template.description}
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #333", margin: 0 }} />

        {chosen === null ? (
          /* Choice phase */
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {template.choices.map((choice, i) => (
              <ChoiceCard
                key={i}
                choice={choice}
                onChoose={() => handleChoose(choice)}
              />
            ))}
          </div>
        ) : (
          /* Reveal phase */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <div
              style={{
                color: "#aaaaaa",
                fontSize: "0.9em",
                fontStyle: "italic",
                lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              {chosen.revealText}
            </div>
            <div
              style={{
                color: outcomeColor(chosen.outcome),
                fontSize: "0.95em",
                fontWeight: "bold",
              }}
            >
              {outcomeDescription(chosen.outcome)}
            </div>
            <button
              onClick={onClose}
              style={{
                marginTop: "0.5rem",
                padding: "0.4rem 1.5rem",
                background: "#2a2a2a",
                border: "1px solid #666",
                borderRadius: "4px",
                color: "#cccccc",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.9em",
              }}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
