import React, { useEffect } from "react";
import BorderPanel from "./BorderPanel";
import Button from "./Button";
import styles from "./styles/ModalPanelBackdrop.module.css";

export interface ModalPanelProps {
  children: React.ReactNode;

  title?: string;

  closeButton?: boolean;

  onClose?: () => void;

  visible?: boolean;
  maxHeight?: string;
}

export default function ModalPanel({
  children,
  visible,
  title,
  closeButton,
  onClose,
  maxHeight,
}: ModalPanelProps) {
  useEffect(() => {
    if (!visible && onClose) {
      onClose();
    }
  }, [visible]);

  return visible ? (
    <div className={styles.modalPanelBackdrop}>
      <BorderPanel
        background="#191919"
        width="40vw"
        height={maxHeight || "40vh"}
        top="calc(50vh - 20vh)"
        left="calc(50vw - 20vw)"
        hidden={!visible}
        title={title}
        flexMode="Column"
      >
        {closeButton && (
          <div className={styles.closeButton}>
            <Button background="#191919" onClick={onClose} maxWidth="4rem">
              ✕
            </Button>
          </div>
        )}
        <div
          style={{
            padding: "1rem",
          }}
        >
          {children}
        </div>
      </BorderPanel>
    </div>
  ) : null;
}
