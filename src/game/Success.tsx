import { useEffect, useMemo, useRef } from "react";
import { useGame, computeCompleteness, playerLevelFromXp } from "./GameProvider";
import { SECRET_LOCATION_TEMPLATES } from "./data/secretLocationData";
import BorderPanel from "./ui/BorderPanel";
import Button from "./ui/Button";

function StatRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.2rem 0" }}>
      <span style={{ color: "#aaa" }}>{label}</span>
      <span style={{ color: "#eee", fontFamily: "var(--mono)" }}>
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
    isWorldVictory,
    setIsWorldVictory,
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

  const glow = isWorldVictory ? "0 0 40px rgba(255,220,50,0.25)" : "0 0 40px rgba(0,200,100,0.2)";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.75)" }}>
      <div
        style={{
          position: "absolute",
          top: "calc(50vh - 17rem)",
          left: "calc(50vw - 13rem)",
          width: "26rem",
          height: "34rem",
          boxShadow: glow,
        }}
      >
        <BorderPanel background="#0a0a0a" width="26rem" height="34rem" top="0" left="0" flexMode="Column">
          <div style={{ padding: "1rem 1.5rem", fontFamily: "var(--mono)", color: "#eee", overflowY: "auto" }}>
            <div
              style={{
                fontSize: "1.8rem",
                color: isWorldVictory ? "#fd4" : "#4af",
                marginBottom: "1.5rem",
                textAlign: "center",
                letterSpacing: "0.1em",
              }}
            >
              {isWorldVictory ? "WORLD CLEARED" : "DUNGEON COMPLETE"}
            </div>
            {isWorldVictory && (
              <div style={{ textAlign: "center", color: "#cca", fontSize: "0.9em", marginBottom: "1rem" }}>
                All portals have been conquered. Your legend is complete.
              </div>
            )}

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
                  <span style={{ color: "#fd4", fontFamily: "var(--mono)" }}>{runStats.goldCollected} gp</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.2rem 0" }}>
                  <span style={{ color: "#aaa" }}>Steps taken</span>
                  <span style={{ color: "#eee", fontFamily: "var(--mono)" }}>{runStats.stepsTaken}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "2rem", padding: "0.6rem 0 0.2rem" }}>
                  <span style={{ color: "#aaa" }}>Completeness</span>
                  <span style={{ color: completeness >= 80 ? "#4af" : completeness >= 50 ? "#fa4" : "#f44", fontFamily: "var(--mono)", fontWeight: "bold" }}>
                    {completeness}%
                  </span>
                </div>
              </div>
            )}

            {lastRunTreasureScore !== null && (
              <div style={{ marginBottom: "1.5rem", borderBottom: "1px solid #333", paddingBottom: "0.8rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0" }}>
                  <span style={{ color: "#aaa" }}>Treasure score</span>
                  <span style={{ color: "#fd4", fontFamily: "var(--mono)", fontWeight: "bold" }}>{lastRunTreasureScore} pts</span>
                </div>
                {pointsGained > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0" }}>
                    <span style={{ color: "#aaa" }}>Legacy points gained</span>
                    <span style={{ color: "#4af", fontFamily: "var(--mono)", fontWeight: "bold" }}>+{pointsGained}</span>
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
              <Button
                background="#0a0a0a"
                onClick={() => {
                  if (isWorldVictory) {
                    setIsWorldVictory(false);
                    goTo("main-menu");
                  } else {
                    if (secretToReveal) revealSecret(secretToReveal.id);
                    goTo("overworld");
                  }
                }}
              >
                {isWorldVictory ? "Return to Main Menu" : "Return to World"}
              </Button>
            </div>
          </div>
        </BorderPanel>
      </div>
    </div>
  );
}
