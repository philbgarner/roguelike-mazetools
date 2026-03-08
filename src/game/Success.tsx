import { useEffect, useMemo, useRef } from "react";
import { useGame, computeCompleteness, playerLevelFromXp } from "./GameProvider";
import { SECRET_LOCATION_TEMPLATES } from "./data/secretLocationData";

function StatRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.2rem 0" }}>
      <span style={{ color: "#aaa" }}>{label}</span>
      <span style={{ color: "#eee", fontFamily: "monospace" }}>
        {value}/{total} <span style={{ color: "#666" }}>({pct}%)</span>
      </span>
    </div>
  );
}

export default function Success() {
  const {
    goTo,
    runStats,
    recordRun,
    lastRunTreasureScore,
    legacyXp,
    legacyPointsSpent,
    overworldContent,
    usedSecrets,
    revealedSecrets,
    revealSecret,
  } = useGame();

  const recordedRef = useRef(false);
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    recordRun("success");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick a random undiscovered secret to reveal when the player returns.
  const secretToReveal = useMemo(() => {
    if (!overworldContent) return null;
    const candidates = overworldContent.meta.secretLocations.filter(
      (s) => !usedSecrets.has(s.id) && !revealedSecrets.has(s.id),
    );
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // computed once when success screen mounts

  const completeness = runStats ? computeCompleteness(runStats) : 0;

  const oldXp = legacyXp - (lastRunTreasureScore ?? 0);
  const oldLevel = playerLevelFromXp(Math.max(0, oldXp));
  const newLevel = playerLevelFromXp(legacyXp);
  const pointsGained = Math.max(0, (newLevel - 1 - legacyPointsSpent) - Math.max(0, oldLevel - 1 - legacyPointsSpent));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
      }}
    >
      <div
        style={{
          background: "#0a0a0a",
          border: "2px solid #4a8",
          padding: "2rem 2.5rem",
          minWidth: "22rem",
          maxWidth: "90vw",
          fontFamily: "monospace",
          color: "#eee",
          boxShadow: "0 0 40px rgba(0,200,100,0.2)",
        }}
      >
        <div
          style={{
            fontSize: "1.8rem",
            color: "#4af",
            marginBottom: "1.5rem",
            textAlign: "center",
            letterSpacing: "0.1em",
          }}
        >
          DUNGEON COMPLETE
        </div>

        {runStats && (
          <div style={{ marginBottom: "1.5rem", borderTop: "1px solid #333", borderBottom: "1px solid #333", padding: "1rem 0" }}>
            <div style={{ color: "#888", fontSize: "0.8em", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Run Summary
            </div>
            <StatRow label="Monsters slain" value={runStats.monstersKilled} total={runStats.totalMonsters} />
            <StatRow label="Chests opened" value={runStats.chestsLooted} total={runStats.totalChests} />
            <StatRow label="Items collected" value={runStats.floorItemsCollected} total={runStats.totalFloorItems} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.2rem 0" }}>
              <span style={{ color: "#aaa" }}>Gold found</span>
              <span style={{ color: "#fd4", fontFamily: "monospace" }}>{runStats.goldCollected} gp</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.2rem 0" }}>
              <span style={{ color: "#aaa" }}>Steps taken</span>
              <span style={{ color: "#eee", fontFamily: "monospace" }}>{runStats.stepsTaken}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.6rem 0 0.2rem" }}>
              <span style={{ color: "#aaa" }}>Completeness</span>
              <span style={{ color: completeness >= 80 ? "#4af" : completeness >= 50 ? "#fa4" : "#f44", fontFamily: "monospace", fontWeight: "bold" }}>
                {completeness}%
              </span>
            </div>
          </div>
        )}

        {lastRunTreasureScore !== null && (
          <div style={{ marginBottom: "1.5rem", borderBottom: "1px solid #333", paddingBottom: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0" }}>
              <span style={{ color: "#aaa" }}>Treasure score</span>
              <span style={{ color: "#fd4", fontFamily: "monospace", fontWeight: "bold" }}>{lastRunTreasureScore} pts</span>
            </div>
            {pointsGained > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0" }}>
                <span style={{ color: "#aaa" }}>Legacy points gained</span>
                <span style={{ color: "#4af", fontFamily: "monospace", fontWeight: "bold" }}>+{pointsGained}</span>
              </div>
            )}
          </div>
        )}

        {secretToReveal && (
          <div style={{ marginBottom: "1.5rem", borderBottom: "1px solid #333", paddingBottom: "1rem", fontSize: "0.85em" }}>
            <div style={{ color: "#888", fontSize: "0.8em", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Scout Report
            </div>
            <span style={{ color: "#ccaa66" }}>
              {SECRET_LOCATION_TEMPLATES[secretToReveal.templateIndex]?.name ?? "A hidden location"} has been located in the forest.
            </span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            style={{
              background: "#0a0a0a",
              border: "1px solid #4a8",
              color: "#4a8",
              fontFamily: "monospace",
              fontSize: "1rem",
              padding: "0.5rem 1.5rem",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#fff";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#fff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#4a8";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#4a8";
            }}
            onClick={() => {
              if (secretToReveal) revealSecret(secretToReveal.id);
              goTo("overworld");
            }}
          >
            Return to World
          </button>
        </div>
      </div>
    </div>
  );
}
