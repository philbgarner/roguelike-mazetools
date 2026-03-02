import React, { useState } from "react";

import styles from "./styles/Button.module.css";

export interface ButtonProps {
  children: React.ReactNode;

  onClick?: () => void;

  maxWidth?: string;
  width?: string;
  background?: string;
}

export type ButtonState = "Normal" | "Pressed";

export default function Button({
  children,
  background,
  maxWidth,
  width,
  onClick,
}: ButtonProps) {
  const [state, setState] = useState<ButtonState>("Normal");

  return (
    <div
      onMouseDown={() => setState("Pressed")}
      onMouseUp={() => setState("Normal")}
      onMouseOut={() => setState("Normal")}
      onClick={onClick}
      className={`${styles.buttonContainer} ${state === "Pressed" ? styles.pressed : ""}`}
      style={{
        maxWidth,
        width,
        background: state === "Normal" ? background : undefined,
      }}
    >
      <div className={styles.buttonContent}>{children}</div>
    </div>
  );
}
