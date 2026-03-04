import React, { useRef } from "react";
import BorderPanel from "./BorderPanel";

/** Height of bottom UI bar (5rem) + a small buffer. */
const BOTTOM_UI_CLEARANCE = 256;
/** Offset below cursor when rendering under it. */
const BELOW_OFFSET = 20;
/** Offset above cursor when flipping. */
const ABOVE_OFFSET = 60;

export interface TooltipProps {
  children: React.ReactNode;
  visible: boolean;
  x: number;
  y: number;
  title?: string;
}

export default function Tooltip({
  children,
  visible,
  x,
  y,
  title,
}: TooltipProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipHeight = containerRef.current?.offsetHeight ?? 120;
  const isNearBottom =
    y + tooltipHeight + BELOW_OFFSET + BOTTOM_UI_CLEARANCE > window.innerHeight;
  const topPos = isNearBottom
    ? y - tooltipHeight - ABOVE_OFFSET
    : y + BELOW_OFFSET;

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}
    >
      <BorderPanel
        width="20rem"
        background="#090909"
        hidden={!visible}
        title={title}
        left={`${x - 18}px`}
        top={`${topPos}px`}
      >
        {children}
      </BorderPanel>
    </div>
  );
}
