import React, { useState } from "react";

import styles from "./styles/Button.module.css";

export interface ButtonProps {
  children: React.ReactNode;

  onClick?: () => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;

  maxWidth?: string;
  minWidth?: string;
  width?: string;
  background?: string;
}

export type ButtonState = "Normal" | "Pressed";

export default function Button({
  children,
  background,
  maxWidth,
  minWidth,
  width,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ButtonProps) {
  const [state, setState] = useState<ButtonState>("Normal");

  return (
    <div
      onMouseDown={() => setState("Pressed")}
      onMouseUp={() => setState("Normal")}
      onMouseOut={() => setState("Normal")}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`${styles.buttonContainer} ${state === "Pressed" ? styles.pressed : ""}`}
      style={{
        maxWidth,
        minWidth,
        width,
        background: state === "Normal" ? background : undefined,
      }}
    >
      <div className={styles.buttonContent}>{children}</div>
    </div>
  );
}
