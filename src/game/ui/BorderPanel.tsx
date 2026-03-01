import React from "react";
import styles from "./styles/BorderPanel.module.css";

export interface BorderPanelProps {
  children: React.ReactNode;
  width: string;
  height: string;
  background: string;
  title?: string;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

export default function BorderPanel({
  title,
  children,
  width,
  height,
  background,
  left,
  right,
  top,
  bottom,
}: BorderPanelProps) {
  return (
    <div
      className={styles.borderPanelContainer}
      style={{
        width,
        height,
        backgroundColor: background,
        left,
        right,
        top,
        bottom,
      }}
    >
      {title ? <div>{title}</div> : null}
      <div>{children}</div>
    </div>
  );
}
