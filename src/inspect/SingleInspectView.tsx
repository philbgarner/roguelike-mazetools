// src/inspect/SingleInspectView.tsx
//
// Milestone 5 — UI Wizard Refactor (rev S)
// Step 7 wrapper for SINGLE-SEED inspection.
// Keeps InspectionShell pure; this wrapper handles top-level framing/navigation.

import React from "react";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import type { DungeonRuntimeState } from "../dungeonState";
import type {
  CircuitEvalDiagnostics,
  CircuitEvalResult,
} from "../evaluateCircuits";
import InspectionShell from "./InspectionShell";

export type SingleInspectPayload = {
  dungeon: BspDungeonOutputs;
  content: ContentOutputs;
  runtime0: DungeonRuntimeState;

  // Optional seed metadata for display
  seed?: string;
  seedUsed?: string;

  // Optional precomputed eval artifacts
  circuitDiagnostics0?: CircuitEvalDiagnostics | null;
  circuitDebug0?: CircuitEvalResult["debug"] | null;
};

export type SingleInspectViewProps = {
  payload: SingleInspectPayload;
  onBack: () => void;

  /** Optional: override title */
  title?: string;

  /** Optional: custom PNG downloader */
  onDownloadPng?: (filename: string, dataUrl: string) => void;
};

export function SingleInspectView(props: SingleInspectViewProps) {
  const { payload, onBack } = props;

  const title =
    props.title ??
    (payload.seed
      ? `Dungeon Inspection — ${payload.seed}`
      : "Dungeon Inspection");

  return (
    <InspectionShell
      title={title}
      onBack={onBack}
      onDownloadPng={props.onDownloadPng}
      result={{
        dungeon: payload.dungeon,
        content: payload.content,
        runtime0: payload.runtime0,
        circuitDiagnostics0: payload.circuitDiagnostics0 ?? null,
        circuitDebug0: payload.circuitDebug0 ?? null,
      }}
    />
  );
}

export default SingleInspectView;
