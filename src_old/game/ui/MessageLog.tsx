import type { LogMessage } from "./useMessageLog";
import styles from "./MessageLog.module.css";

interface MessageLogProps {
  messages: LogMessage[];
  onMessageExpired: (id: number) => void;
}

export default function MessageLog({
  messages,
  onMessageExpired,
}: MessageLogProps) {
  if (messages.length === 0) return null;

  return (
    <div className={styles.container}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={styles.message}
          onAnimationEnd={() => onMessageExpired(msg.id)}
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
}
