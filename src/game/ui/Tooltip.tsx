import React, { useEffect, useRef, useState } from "react";
import BorderPanel from "./BorderPanel";

/** Height of bottom UI bar (5rem) + a generous buffer for tall tooltips. */
const BOTTOM_UI_CLEARANCE = 400;
/** Fallback offset below cursor when no cellPxH is provided. */
const BELOW_OFFSET = 20;
/** Fallback offset above cursor when no cellPxH is provided. */
const ABOVE_OFFSET = 60;
/** Small aesthetic gap between anchor cell edge and tooltip edge. */
const CELL_PADDING = 4;

export interface TooltipProps {
  children: React.ReactNode;
  visible: boolean;
  x: number;
  y: number;
  title?: string;
  zIndex?: number;
  /**
   * Height of the hovered cell in screen pixels.
   * When provided, the tooltip is positioned so it never overlaps the cell —
   * it appears fully below (cursor + cellPxH + gap) or fully above
   * (cursor - cellPxH - gap - tooltipHeight).
   */
  cellPxH?: number;
}

export default function Tooltip({
  children,
  visible,
  x,
  y,
  title,
  zIndex,
  cellPxH,
}: TooltipProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setTooltipHeight(entries[0].contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const belowClear = cellPxH != null ? cellPxH + CELL_PADDING : BELOW_OFFSET;
  const aboveClear = cellPxH != null ? cellPxH + CELL_PADDING : ABOVE_OFFSET;

  const isNearBottom =
    y + tooltipHeight + belowClear + BOTTOM_UI_CLEARANCE > window.innerHeight;
  const topPos = isNearBottom ? y - tooltipHeight - aboveClear : y + belowClear;

  return (
    <BorderPanel
      ref={panelRef}
      width="20rem"
      background="#090909"
      hidden={!visible}
      title={title}
      left={`${x - 18}px`}
      top={`${topPos}px`}
      zIndex={zIndex}
      mouseEvents={false}
    >
      {children}
    </BorderPanel>
  );
}
