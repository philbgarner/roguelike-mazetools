import { useCallback, useState } from "react";

export interface LogMessage {
  id: number;
  text: string;
}

let nextId = 0;

export function useMessageLog() {
  const [messages, setMessages] = useState<LogMessage[]>([]);

  const addMessage = useCallback((text: string) => {
    const id = nextId++;
    setMessages((prev) => [...prev, { id, text }]);
  }, []);

  const removeMessage = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { messages, addMessage, removeMessage };
}
