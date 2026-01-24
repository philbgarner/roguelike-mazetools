// src/inspect/BatchResultsView.tsx
//
// Milestone 5 — UI Wizard Refactor (rev S)
// Step 7 wrapper for BATCH results: summary-only, no map.
//
// This is intentionally minimal and stable:
// - Show summary JSON
// - Copy to clipboard
// - Download JSON
// - Back to wizard

import React, { useMemo, useState } from "react";

export type BatchResultsPayload = {
  summary: any;
  summaryJson: string;

  // Optional display metadata
  runs?: number;
  seedPrefix?: string;
};

export type BatchResultsViewProps = {
  payload: BatchResultsPayload;
  onBack: () => void;

  /** Optional: custom JSON downloader */
  onDownloadJson?: (filename: string, jsonText: string) => void;

  /** Optional title */
  title?: string;
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Best-effort small preview (won’t break if shape changes)
function pickPreview(summary: any) {
  if (!summary || typeof summary !== "object") return null;

  const out: Record<string, any> = {};
  const keys = [
    "runs",
    "roomsAvg",
    "corridorsAvg",
    "patterns",
    "patternSummary",
    "globalCircuitMetrics",
  ];

  for (const k of keys) {
    if (k in summary) out[k] = (summary as any)[k];
  }
  return Object.keys(out).length ? out : null;
}

export function BatchResultsView(props: BatchResultsViewProps) {
  const { payload, onBack } = props;
  const title = props.title ?? "Batch Results — Summary Only";

  const preview = useMemo(
    () => pickPreview(payload.summary),
    [payload.summary],
  );
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  const filename = useMemo(() => {
    const prefix = payload.seedPrefix ? `${payload.seedPrefix}-` : "";
    const runs = payload.runs ? `${payload.runs}runs-` : "";
    return `${prefix}${runs}batch-summary.json`.replace(/\s+/g, "");
  }, [payload.runs, payload.seedPrefix]);

  const doCopy = async () => {
    setCopied("idle");
    const ok = await copyToClipboard(payload.summaryJson);
    setCopied(ok ? "ok" : "fail");
    window.setTimeout(() => setCopied("idle"), 1500);
  };

  const doDownload = () => {
    if (props.onDownloadJson)
      props.onDownloadJson(filename, payload.summaryJson);
    else downloadText(filename, payload.summaryJson);
  };

  return (
    <div className="maze-app">
      <div className="maze-controls" style={{ width: 860, maxWidth: "100%" }}>
        <div className="maze-header-row">
          <h2 className="maze-title">{title}</h2>
          <button className="maze-btn" onClick={onBack}>
            Back
          </button>
        </div>

        <div className="maze-controls-row" style={{ marginBottom: 8 }}>
          <button
            className="maze-btn"
            onClick={doCopy}
            title="Copy JSON to clipboard"
          >
            Copy JSON
          </button>
          <button
            className="maze-btn"
            onClick={doDownload}
            title="Download JSON file"
          >
            Download JSON
          </button>
          {copied !== "idle" && (
            <span style={{ opacity: 0.85 }}>
              {copied === "ok"
                ? "Copied."
                : "Copy failed (browser permissions)."}
            </span>
          )}
        </div>

        {preview && (
          <details style={{ marginBottom: 10 }}>
            <summary style={{ cursor: "pointer" }}>Quick preview</summary>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(preview, null, 2)}
            </pre>
          </details>
        )}

        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
          {payload.summaryJson}
        </pre>
      </div>
    </div>
  );
}

export default BatchResultsView;
