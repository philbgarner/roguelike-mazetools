import React, { useState, useCallback, useRef } from "react";
import ModalPanel from "./ModalPanel";
import Button from "./Button";

type Resolver = (value: boolean) => void;

export function useConfirmYesNo() {
  const [message, setMessage] = useState<string | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirmPrompt = useCallback((msg: string): Promise<boolean> => {
    setMessage(msg);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleYes = useCallback(() => {
    setMessage(null);
    resolverRef.current?.(true);
    resolverRef.current = null;
  }, []);

  const handleNo = useCallback(() => {
    setMessage(null);
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  const dialog = (
    <ModalPanel visible={message !== null} title="Confirm" maxHeight="10rem">
      <p style={{ margin: "0 0 1rem" }}>{message}</p>
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
        <Button onClick={handleYes} width="8rem">
          Yes
        </Button>
        <Button onClick={handleNo} width="8rem">
          No
        </Button>
      </div>
    </ModalPanel>
  );

  return { confirmPrompt, dialog };
}
