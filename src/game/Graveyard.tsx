import { useMemo, useState } from "react";
import { useGame, type DeathRecord } from "./GameProvider";
import BorderPanel from "./ui/BorderPanel";
import Button from "./ui/Button";

const OUTCOME_COLOR = { death: "#f44", success: "#4af" } as const;
const OUTCOME_LABEL = { death: "DIED", success: "VICTORY" } as const;

const THEME_COLOR: Record<string, string> = {
  cave: "#888",
  ruins: "#a96",
  crypt: "#a8c",
  temple: "#fa8",
  lair: "#f64",
};

function fmt(n: number) {
  return n.toLocaleString();
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DeathCard({
  record,
  highlight,
  compact,
}: {
  record: DeathRecord;
  highlight?: boolean;
  compact?: boolean;
}) {
  const borderColor = record.outcome === "death" ? "#a33" : "#2a7";
  const glowColor =
    record.outcome === "death"
      ? "rgba(180,30,30,0.2)"
      : "rgba(30,180,100,0.2)";

  return (
    <div
      style={{
        background: record.outcome === "death" ? "#0b0505" : "#050b07",
        border: `1px solid ${highlight ? "#fff" : borderColor}`,
        padding: compact ? "0.8rem 1rem" : "1rem 1.2rem",
        fontFamily: "monospace",
        color: "#ddd",
        boxShadow: `0 0 16px ${glowColor}`,
        minWidth: compact ? "12rem" : "16rem",
        flex: "1 1 0",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
        <span
          style={{
            color: OUTCOME_COLOR[record.outcome],
            fontWeight: "bold",
            fontSize: compact ? "0.85em" : "1em",
            letterSpacing: "0.06em",
          }}
        >
          {OUTCOME_LABEL[record.outcome]}
        </span>
        <span style={{ color: "#555", fontSize: "0.75em" }}>{timeAgo(record.timestamp)}</span>
      </div>

      {/* Character name */}
      {record.characterName && (
        <div style={{ color: "#eee", fontSize: compact ? "0.85em" : "0.95em", marginBottom: "0.5rem", letterSpacing: "0.04em" }}>
          {record.characterName}
        </div>
      )}

      {/* Theme + level */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", fontSize: "0.8em" }}>
        <span style={{ color: THEME_COLOR[record.theme] ?? "#aaa", textTransform: "capitalize" }}>
          {record.theme}
        </span>
        <span style={{ color: "#555" }}>·</span>
        <span style={{ color: "#888" }}>Lv {record.level}</span>
        <span style={{ color: "#555" }}>·</span>
        <span style={{ color: "#888" }}>Char Lv {record.playerLevel}</span>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.15rem 1rem", fontSize: "0.82em", marginBottom: "0.5rem" }}>
        <span style={{ color: "#888" }}>Gold</span>
        <span style={{ color: "#fd4" }}>{fmt(record.runStats.goldCollected)} gp</span>

        <span style={{ color: "#888" }}>Steps</span>
        <span style={{ color: "#ccc" }}>{fmt(record.runStats.stepsTaken)}</span>

        <span style={{ color: "#888" }}>Monsters</span>
        <span style={{ color: "#ccc" }}>
          {record.runStats.monstersKilled}/{record.runStats.totalMonsters}
        </span>

        <span style={{ color: "#888" }}>Dungeons</span>
        <span style={{ color: "#ccc" }}>
          {(record.dungeonsCompleted ?? 0)}✓
          {(record.dungeonsExitedEarly ?? 0) > 0 && (
            <span style={{ color: "#666" }}> {record.dungeonsExitedEarly}↩</span>
          )}
        </span>

        <span style={{ color: "#888" }}>Treasure</span>
        <span style={{ color: "#fd4", fontWeight: "bold" }}>{record.treasureScore ?? "—"} pts</span>

        {record.killedBy && (
          <>
            <span style={{ color: "#888" }}>Slain by</span>
            <span style={{ color: "#f88" }}>{record.killedBy}</span>
          </>
        )}
      </div>

      {/* Completeness bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78em", marginBottom: "0.2rem" }}>
          <span style={{ color: "#666" }}>Completeness</span>
          <span
            style={{
              color:
                record.completenessPercent >= 80
                  ? "#4af"
                  : record.completenessPercent >= 50
                  ? "#fa4"
                  : "#f64",
              fontWeight: "bold",
            }}
          >
            {record.completenessPercent}%
          </span>
        </div>
        <div style={{ height: "4px", background: "#222", borderRadius: "2px" }}>
          <div
            style={{
              height: "100%",
              width: `${record.completenessPercent}%`,
              background:
                record.completenessPercent >= 80
                  ? "#4af"
                  : record.completenessPercent >= 50
                  ? "#fa4"
                  : "#f64",
              borderRadius: "2px",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SeedGallery({
  seedKey,
  records,
  onReplay,
}: {
  seedKey: string;
  records: DeathRecord[];
  onReplay: () => void;
}) {
  const best = records.reduce((a, b) =>
    (b.treasureScore ?? 0) > (a.treasureScore ?? 0) ? b : a,
  );

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "0.7rem",
          borderBottom: "1px solid #333",
          paddingBottom: "0.4rem",
        }}
      >
        <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: "0.9em" }}>
          Seed: <span style={{ color: "#fff" }}>{seedKey}</span>
        </span>
        <span style={{ color: "#555", fontSize: "0.8em" }}>{records.length} run{records.length !== 1 ? "s" : ""}</span>
        <span style={{ color: "#555", fontSize: "0.8em" }}>
          Best: <span style={{ color: "#fd4" }}>{best.treasureScore ?? best.completenessPercent + "%"} pts</span>
        </span>
        <Button background="transparent" onClick={onReplay}>replay</Button>
      </div>
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
        {records.map((r) => (
          <DeathCard key={r.id} record={r} highlight={r.id === best.id} compact={records.length > 2} />
        ))}
      </div>
    </div>
  );
}

export default function Graveyard() {
  const { goTo, deathRecords, setSeed } = useGame();
  const [filter, setFilter] = useState<"all" | "death" | "success">("all");

  const filtered = useMemo(
    () => (filter === "all" ? deathRecords : deathRecords.filter((r) => r.outcome === filter)),
    [deathRecords, filter],
  );

  // Group by seed; seeds with >1 run get gallery treatment
  const groups = useMemo(() => {
    const map = new Map<string, DeathRecord[]>();
    for (const r of filtered) {
      const key = String(r.seed);
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    // Sort groups by most recent record
    return [...map.entries()].sort(
      (a, b) => b[1][0].timestamp - a[1][0].timestamp,
    );
  }, [filtered]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#060606" }}>
      <BorderPanel
        background="#0c0c0c"
        width="80vw"
        height="85vh"
        top="7.5vh"
        left="10vw"
        flexMode="Column"
        title="HALL OF THE FALLEN"
      >
        <div style={{ padding: "1.5rem 2rem", fontFamily: "monospace", color: "#eee", overflowY: "auto", height: "100%" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <div style={{ color: "#444", fontSize: "0.8em" }}>
              {deathRecords.length} run{deathRecords.length !== 1 ? "s" : ""} recorded
            </div>
            <Button background="#0c0c0c" onClick={() => goTo("main-menu")}>← Back</Button>
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {(["all", "death", "success"] as const).map((f) => (
              <Button
                key={f}
                background={filter === f ? "#222" : "transparent"}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "death" ? "Deaths" : "Victories"}
              </Button>
            ))}
          </div>

          {/* Content */}
          {groups.length === 0 ? (
            <div style={{ color: "#444", textAlign: "center", marginTop: "6rem", fontSize: "1.1em" }}>
              No runs recorded yet.
            </div>
          ) : (
            groups.map(([seedKey, records]) =>
              records.length === 1 ? (
                <div key={seedKey} style={{ marginBottom: "1.5rem" }}>
                  <div
                    style={{
                      color: "#555",
                      fontSize: "0.78em",
                      marginBottom: "0.4rem",
                      display: "flex",
                      gap: "0.8rem",
                      alignItems: "center",
                    }}
                  >
                    <span>Seed: <span style={{ color: "#888" }}>{seedKey}</span></span>
                    <Button
                      background="transparent"
                      onClick={() => {
                        setSeed(records[0].seed);
                        goTo("main-menu");
                      }}
                    >
                      replay
                    </Button>
                  </div>
                  <div style={{ display: "flex" }}>
                    <DeathCard record={records[0]} />
                  </div>
                </div>
              ) : (
                <SeedGallery
                  key={seedKey}
                  seedKey={seedKey}
                  records={records}
                  onReplay={() => {
                    setSeed(records[0].seed);
                    goTo("main-menu");
                  }}
                />
              ),
            )
          )}
        </div>
      </BorderPanel>
    </div>
  );
}
