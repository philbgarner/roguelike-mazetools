// src/inspect/BatchResultsView.tsx
//
// Milestone 5 — UI Wizard Refactor (rev S)
// Step 7 wrapper for BATCH results: summary-only, no map.
//
// Phase 3 additions: seed bank table with download, copy, and inspect affordances.

import React, { useMemo, useState } from "react";
import type { SeedBank, SeedBankEntry } from "../batchStats";

export type BatchResultsPayload = {
  summary: any;
  summaryJson: string;

  // Optional display metadata
  runs?: number;
  seedPrefix?: string;

  // Seed bank (Phase 3)
  seedBank?: SeedBank;
  seedBankJson?: string;
};

export type BatchResultsViewProps = {
  payload: BatchResultsPayload;
  onBack: () => void;

  /** Optional: custom JSON downloader */
  onDownloadJson?: (filename: string, jsonText: string) => void;

  /** Re-run a seed in single mode for inspection */
  onRerunSeed?: (seed: string) => void;

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

// Best-effort small preview (won't break if shape changes)
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

type SeedFilter =
  | "all"
  | "good"
  | "failed"
  | "budgetViolation"
  | "difficultyOutOfBand"
  | "pacingFailure";

function filterSeeds(
  seeds: SeedBankEntry[],
  filter: SeedFilter,
): SeedBankEntry[] {
  if (filter === "all") return seeds;
  if (filter === "good") return seeds.filter((s) => s.tags.includes("good"));
  if (filter === "budgetViolation")
    return seeds.filter((s) => s.tags.includes("budgetViolation"));
  if (filter === "difficultyOutOfBand")
    return seeds.filter((s) => s.tags.includes("difficultyOutOfBand"));
  if (filter === "pacingFailure")
    return seeds.filter((s) => s.tags.includes("pacingFailure"));
  return seeds.filter((s) => !s.tags.includes("good"));
}

function SeedBankTable(props: {
  seedBank: SeedBank;
  seedBankJson: string;
  seedPrefix?: string;
  onRerunSeed?: (seed: string) => void;
}) {
  const { seedBank, seedBankJson, onRerunSeed } = props;
  const [filter, setFilter] = useState<SeedFilter>("good");
  const [copiedSeed, setCopiedSeed] = useState<string | null>(null);

  const budgetViolationCount = useMemo(
    () =>
      seedBank.seeds.filter((s) => s.tags.includes("budgetViolation")).length,
    [seedBank.seeds],
  );

  const difficultyViolationCount = useMemo(
    () =>
      seedBank.seeds.filter((s) => s.tags.includes("difficultyOutOfBand"))
        .length,
    [seedBank.seeds],
  );

  const pacingFailureCount = useMemo(
    () => seedBank.seeds.filter((s) => s.tags.includes("pacingFailure")).length,
    [seedBank.seeds],
  );

  const filtered = useMemo(
    () => filterSeeds(seedBank.seeds, filter),
    [seedBank.seeds, filter],
  );

  const seedBankFilename = useMemo(() => {
    const prefix = props.seedPrefix ? `${props.seedPrefix}-` : "";
    return `${prefix}seed-bank.json`.replace(/\s+/g, "");
  }, [props.seedPrefix]);

  const doDownloadSeedBank = () => {
    downloadText(seedBankFilename, seedBankJson);
  };

  const doDownloadGoodSeeds = () => {
    const goodOnly = seedBank.seeds.filter((s) => s.tags.includes("good"));
    const goodList = goodOnly.map((s) => s.seed);
    const prefix = props.seedPrefix ? `${props.seedPrefix}-` : "";
    downloadText(
      `${prefix}good-seeds.json`.replace(/\s+/g, ""),
      JSON.stringify(goodList, null, 2),
    );
  };

  const doCopySeed = async (seed: string) => {
    const ok = await copyToClipboard(seed);
    if (ok) {
      setCopiedSeed(seed);
      window.setTimeout(() => setCopiedSeed(null), 1200);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <strong>
          Seed Bank: {seedBank.goodCount} good / {seedBank.totalSeeds} total
          {seedBank.failedCount > 0 && ` (${seedBank.failedCount} failed)`}
        </strong>
        <button
          className="maze-btn"
          onClick={doDownloadSeedBank}
          title="Download full seed bank JSON"
        >
          Download Seed Bank
        </button>
        {seedBank.goodCount > 0 && (
          <button
            className="maze-btn"
            onClick={doDownloadGoodSeeds}
            title="Download list of good seed strings only"
          >
            Download Good Seeds
          </button>
        )}
      </div>

      <div style={{ marginBottom: 6, display: "flex", gap: 4 }}>
        {(
          [
            "all",
            "good",
            "failed",
            ...(budgetViolationCount > 0 ? ["budgetViolation"] : []),
            ...(difficultyViolationCount > 0 ? ["difficultyOutOfBand"] : []),
            ...(pacingFailureCount > 0 ? ["pacingFailure"] : []),
          ] as SeedFilter[]
        ).map((f) => (
          <button
            key={f}
            className="maze-btn"
            onClick={() => setFilter(f)}
            style={{
              fontWeight: filter === f ? "bold" : "normal",
              opacity: filter === f ? 1 : 0.7,
            }}
          >
            {f === "all"
              ? `All (${seedBank.totalSeeds})`
              : f === "good"
                ? `Good (${seedBank.goodCount})`
                : f === "budgetViolation"
                  ? `Budget (${budgetViolationCount})`
                  : f === "difficultyOutOfBand"
                    ? `Difficulty (${difficultyViolationCount})`
                    : f === "pacingFailure"
                      ? `Pacing (${pacingFailureCount})`
                      : `Failed (${seedBank.failedCount})`}
          </button>
        ))}
      </div>

      <div
        style={{
          maxHeight: 400,
          overflowY: "auto",
          border: "1px solid #444",
          borderRadius: 4,
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
        >
          <thead>
            <tr
              style={{
                position: "sticky",
                top: 0,
                background: "#222",
                borderBottom: "1px solid #555",
              }}
            >
              <th style={thStyle}>Seed</th>
              <th style={thStyle}>seedUsed</th>
              <th style={thStyle}>Rooms</th>
              <th style={thStyle}>Tags</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.seed} style={{ borderBottom: "1px solid #333" }}>
                <td style={tdStyle}>{entry.seed}</td>
                <td style={tdStyle}>{entry.seedUsed}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {entry.rooms}
                </td>
                <td style={tdStyle}>
                  {entry.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: "inline-block",
                        padding: "1px 5px",
                        marginRight: 3,
                        borderRadius: 3,
                        fontSize: 11,
                        background:
                          t === "good"
                            ? "#2a5a2a"
                            : t === "patternFailure"
                              ? "#5a2a2a"
                              : t === "budgetViolation"
                                ? "#5a4a1a"
                                : t === "difficultyOutOfBand"
                                  ? "#1a4a5a"
                                  : t === "pacingFailure"
                                    ? "#4a1a5a"
                                    : "#4a4a2a",
                        color: "#ddd",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <button
                    className="maze-btn"
                    style={{ fontSize: 11, padding: "1px 6px", marginRight: 3 }}
                    onClick={() => doCopySeed(entry.seed)}
                    title="Copy seed string"
                  >
                    {copiedSeed === entry.seed ? "Copied" : "Copy"}
                  </button>
                  {onRerunSeed && (
                    <button
                      className="maze-btn"
                      style={{ fontSize: 11, padding: "1px 6px" }}
                      onClick={() => onRerunSeed(entry.seed)}
                      title="Re-run this seed in single mode for inspection"
                    >
                      Inspect
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 12, textAlign: "center", opacity: 0.6 }}>
            No seeds match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  fontWeight: "bold",
};

const tdStyle: React.CSSProperties = {
  padding: "3px 8px",
};

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

        {payload.seedBank && payload.seedBankJson && (
          <SeedBankTable
            seedBank={payload.seedBank}
            seedBankJson={payload.seedBankJson}
            seedPrefix={payload.seedPrefix}
            onRerunSeed={props.onRerunSeed}
          />
        )}

        {payload.summary?.difficulty && (
          <div
            style={{
              marginTop: 12,
              padding: 8,
              background: "#1a2a2a",
              borderRadius: 4,
              border: "1px solid #455",
            }}
          >
            <strong>Difficulty Band Summary</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Checked: {payload.summary.difficulty.checkedCount} | Pass:{" "}
              {payload.summary.difficulty.passCount} | Fail:{" "}
              {payload.summary.difficulty.failCount}
              {payload.summary.difficulty.failCount > 0 && (
                <span>
                  {" "}
                  (
                  {(
                    (payload.summary.difficulty.failCount /
                      payload.summary.difficulty.checkedCount) *
                    100
                  ).toFixed(1)}
                  % rejection rate)
                </span>
              )}
            </div>
            {Object.keys(payload.summary.difficulty.violationsByMetric).length >
              0 && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Violations by metric:{" "}
                {Object.entries(payload.summary.difficulty.violationsByMetric)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([metric, count]) => `${metric}: ${count}`)
                  .join(", ")}
              </div>
            )}
          </div>
        )}

        {payload.summary?.budget && (
          <div
            style={{
              marginTop: 12,
              padding: 8,
              background: "#2a2a1a",
              borderRadius: 4,
              border: "1px solid #554",
            }}
          >
            <strong>Content Budget Summary</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Checked: {payload.summary.budget.checkedCount} | Pass:{" "}
              {payload.summary.budget.passCount} | Fail:{" "}
              {payload.summary.budget.failCount}
              {payload.summary.budget.failCount > 0 && (
                <span>
                  {" "}
                  (
                  {(
                    (payload.summary.budget.failCount /
                      payload.summary.budget.checkedCount) *
                    100
                  ).toFixed(1)}
                  % rejection rate)
                </span>
              )}
            </div>
            {Object.keys(payload.summary.budget.violationsByCategory).length >
              0 && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Violations by category:{" "}
                {Object.entries(payload.summary.budget.violationsByCategory)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([cat, count]) => `${cat}: ${count}`)
                  .join(", ")}
              </div>
            )}
          </div>
        )}

        {payload.summary?.pacing && (
          <div
            style={{
              marginTop: 12,
              padding: 8,
              background: "#2a1a2a",
              borderRadius: 4,
              border: "1px solid #545",
            }}
          >
            <strong>Pacing Targets Summary</strong>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Checked: {payload.summary.pacing.checkedCount} | Pass:{" "}
              {payload.summary.pacing.passCount} | Fail:{" "}
              {payload.summary.pacing.failCount}
              {payload.summary.pacing.failCount > 0 && (
                <span>
                  {" "}
                  (
                  {(
                    (payload.summary.pacing.failCount /
                      payload.summary.pacing.checkedCount) *
                    100
                  ).toFixed(1)}
                  % rejection rate)
                </span>
              )}
            </div>
            {Object.keys(payload.summary.pacing.violationsByMetric).length >
              0 && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Violations by metric:{" "}
                {Object.entries(payload.summary.pacing.violationsByMetric)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([metric, count]) => `${metric}: ${count}`)
                  .join(", ")}
              </div>
            )}
          </div>
        )}

        {preview && (
          <details style={{ marginBottom: 10, marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Quick preview</summary>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(preview, null, 2)}
            </pre>
          </details>
        )}

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer" }}>
            Full batch summary JSON
          </summary>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
            {payload.summaryJson}
          </pre>
        </details>
      </div>
    </div>
  );
}

export default BatchResultsView;
