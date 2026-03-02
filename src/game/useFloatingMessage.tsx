import { useState, useCallback, useEffect } from "react";
import { Html } from "@react-three/drei";

export interface FloatingMessageOptions {
  /** CSS color string. Defaults to red for negative numbers, white otherwise. */
  color?: string;
  /** Upward travel distance in world-space pixels over the lifetime. Default: 40. */
  speed?: number;
  /** Lifetime in milliseconds. Default: 1200. */
  timeToLive?: number;
}

interface FloatingMessage {
  id: number;
  text: string;
  worldX: number;
  worldY: number;
  color: string;
  speed: number;
  timeToLive: number;
}

export interface UseFloatingMessageParams {
  mapWidth: number;
  mapHeight: number;
  pxPerCell?: number;
}

const DEFAULT_SPEED = 40;
const DEFAULT_TTL = 1200;
let _nextId = 0;

function ensureKeyframe() {
  const id = "__fm_keyframe__";
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = `
    @keyframes fm-float {
      from { transform: translateY(0px); opacity: 1; }
      to   { transform: translateY(var(--fm-rise, -50px)); opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

/**
 * Floating damage / status indicators rendered inside a React Three Fiber <Canvas>.
 *
 * Usage:
 *   const { push, floatingMessages } = useFloatingMessage({ mapWidth, mapHeight });
 *   // Inside <Canvas>:
 *   {floatingMessages}
 *
 * push(text, gridX, gridY, opts?)
 *   - Negative numeric strings default to red, all others to white.
 */
export function useFloatingMessage({
  mapWidth,
  mapHeight,
  pxPerCell = 32,
}: UseFloatingMessageParams) {
  const [messages, setMessages] = useState<FloatingMessage[]>([]);

  useEffect(() => {
    ensureKeyframe();
  }, []);

  const push = useCallback(
    (text: string, gridX: number, gridY: number, opts?: FloatingMessageOptions) => {
      const numeric = Number(text.trim());
      const isNeg = !isNaN(numeric) ? numeric < 0 : text.trimStart().startsWith("-");
      const color = opts?.color ?? (isNeg ? "#ff4444" : "#ffffff");
      const speed = opts?.speed ?? DEFAULT_SPEED;
      const timeToLive = opts?.timeToLive ?? DEFAULT_TTL;

      // Convert grid coords to R3F world-space (matches cellToWorldPx convention).
      const worldX = (gridX + 0.5 - mapWidth / 2) * pxPerCell;
      const worldY = (mapHeight / 2 - (gridY + 0.5)) * pxPerCell;

      const id = _nextId++;
      setMessages((prev) => [...prev, { id, text, worldX, worldY, color, speed, timeToLive }]);
      setTimeout(
        () => setMessages((prev) => prev.filter((m) => m.id !== id)),
        timeToLive + 100,
      );
    },
    [mapWidth, mapHeight, pxPerCell],
  );

  const floatingMessages = (
    <>
      {messages.map((msg) => {
        // Total rise distance in screen pixels (negative = upward).
        const risePx = -Math.abs((msg.speed * msg.timeToLive) / 1000);
        return (
          <Html
            key={msg.id}
            position={[msg.worldX, msg.worldY, 1]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div
              style={
                {
                  "--fm-rise": `${risePx}px`,
                  color: msg.color,
                  fontFamily: "monospace",
                  fontWeight: "bold",
                  fontSize: "14px",
                  textShadow: "1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  lineHeight: 1,
                  animationName: "fm-float",
                  animationDuration: `${msg.timeToLive}ms`,
                  animationTimingFunction: "ease-out",
                  animationFillMode: "forwards",
                } as React.CSSProperties
              }
            >
              {msg.text}
            </div>
          </Html>
        );
      })}
    </>
  );

  return { push, floatingMessages };
}
