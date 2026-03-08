import { useEffect, useRef } from "react";
import { useGame, computeCompleteness, availableLegacyPoints, playerLevelFromXp } from "./GameProvider";

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

export default function Death() {
  const { goTo, runStats, killedBy, recordRun, lastRunTreasureScore, legacyXp, legacyPointsSpent } = useGame();

  const recordedRef = useRef(false);
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    recordRun("death");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeness = runStats ? computeCompleteness(runStats) : 0;

  // Attr points gained this run = new available - old available
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
        background: "rgba(0,0,0,0.8)",
      }}
    >
      <div
        style={{
          background: "#0a0000",
          border: "2px solid #a44",
          padding: "2rem 2.5rem",
          minWidth: "22rem",
          maxWidth: "90vw",
          fontFamily: "monospace",
          color: "#eee",
          boxShadow: "0 0 40px rgba(200,0,0,0.25)",
        }}
      >
        <div
          style={{
            fontSize: "1.8rem",
            color: "#f44",
            marginBottom: "1.5rem",
            textAlign: "center",
            letterSpacing: "0.1em",
          }}
        >
          YOU DIED
        </div>

        {runStats && (
          <div style={{ marginBottom: "1.5rem", borderTop: "1px solid #331111", borderBottom: "1px solid #331111", padding: "1rem 0" }}>
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
            {killedBy && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.2rem 0" }}>
                <span style={{ color: "#aaa" }}>Slain by</span>
                <span style={{ color: "#f88", fontFamily: "monospace" }}>{killedBy}</span>
              </div>
            )}
          </div>
        )}

        {lastRunTreasureScore !== null && (
          <div style={{ marginBottom: "1.5rem", borderBottom: "1px solid #331111", paddingBottom: "0.8rem" }}>
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

        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            style={{
              background: "#0a0000",
              border: "1px solid #a44",
              color: "#a44",
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
              (e.currentTarget as HTMLButtonElement).style.color = "#a44";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#a44";
            }}
            onClick={() => goTo("main-menu")}
          >
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
}
