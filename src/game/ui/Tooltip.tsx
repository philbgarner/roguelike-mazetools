import React from "react";
import BorderPanel from "./BorderPanel";

export interface TooltipProps {
  children: React.ReactNode;
  visible: boolean;
  x: number;
  y: number;
}

export default function Tooltip({ children, visible, x, y }: TooltipProps) {
  return (
    <BorderPanel
      width="20rem"
      background="#090909"
      hidden={!visible}
      left={`${x - 18}px`}
      top={`${y + 60}px`}
    >
      {children}
    </BorderPanel>
  );
}
