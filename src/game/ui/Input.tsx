import React, { useState } from "react";

import styles from "./styles/Button.module.css";

export interface InputProps {
  value: string | number;

  onClick?: () => void;
  onChange?: (value: string | number) => void;

  maxWidth?: string;
  width?: string;
  background?: string;
}

export type InputState = "Normal" | "Active";

export default function Button({
  value,
  background,
  maxWidth,
  width,
  onClick,
  onChange,
}: InputProps) {
  const [state, setState] = useState<InputState>("Normal");

  return (
    <div
      onMouseUp={() => setState("Active")}
      onBlur={() => setState("Normal")}
      onClick={onClick}
      className={`${styles.buttonContainer} ${state === "Active" ? styles.pressed : ""}`}
      style={{
        maxWidth,
        width,
        background: state === "Normal" ? background : undefined,
      }}
    >
      <div className={styles.buttonContent}>
        <input
          value={value}
          onChange={(e) => {
            if (onChange) onChange(e.target.value);
          }}
          onClick={() => {
            if (onClick) onClick();
          }}
        />
      </div>
    </div>
  );
}
