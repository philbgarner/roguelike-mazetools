import React from "react";
import styles from "./styles/BorderPanel.module.css";

export type FlexMode = "Column" | "Row";

export interface BorderPanelProps {
  children: React.ReactNode;
  width: string;
  background: string;
  flexMode?: FlexMode;
  height?: string;
  hidden?: boolean;
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
  hidden,
  flexMode,
}: BorderPanelProps) {
  return (
    <>
      <div
        className={styles.borderPanelContainer}
        style={{
          width,
          height,
          left,
          right,
          top,
          bottom,
          opacity: hidden ? 0 : 1,
        }}
      >
        {title ? (
          <div className={styles.title} style={{ backgroundColor: background }}>
            {title}
          </div>
        ) : null}
        <div
          className={styles.content}
          style={{
            backgroundColor: background,
            flexDirection: flexMode
              ? flexMode === "Column"
                ? "column"
                : "row"
              : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
