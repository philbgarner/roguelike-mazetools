import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Howl } from "howler";
import { BspDungeonOutputs, ForestContentOutputs } from "../mazeGen";
import { Player, DEFAULT_PLAYER } from "./player";
import { MUSIC_TRACKS } from "./musicTracks";
import { SFX_TRACKS } from "./sfxTracks";
import { publicUrl } from "../utils/publicUrl";
import { playerLevelFromXp, xpToReachLevel } from "../resolve/levelBudget";

export { playerLevelFromXp, xpToReachLevel };

const EMPTY_STATS: RunStats = {
  monstersKilled: 0, totalMonsters: 0,
  chestsLooted: 0, totalChests: 0,
  floorItemsCollected: 0, totalFloorItems: 0,
  goldCollected: 0, stepsTaken: 0,
};

function mergeStats(a: RunStats, b: RunStats): RunStats {
  return {
    monstersKilled: a.monstersKilled + b.monstersKilled,
    totalMonsters: a.totalMonsters + b.totalMonsters,
    chestsLooted: a.chestsLooted + b.chestsLooted,
    totalChests: a.totalChests + b.totalChests,
    floorItemsCollected: a.floorItemsCollected + b.floorItemsCollected,
    totalFloorItems: a.totalFloorItems + b.totalFloorItems,
    goldCollected: a.goldCollected + b.goldCollected,
    stepsTaken: a.stepsTaken + b.stepsTaken,
  };
}

export interface RunStats {
  monstersKilled: number;
  totalMonsters: number;
  chestsLooted: number;
  totalChests: number;
  floorItemsCollected: number;
  totalFloorItems: number;
  goldCollected: number;
  stepsTaken: number;
}

export interface DeathRecord {
  id: string;
  timestamp: number;
  seed: string | number;
  level: number;
  theme: string;
  outcome: "death" | "success";
  playerLevel: number;
  playerMaxHp: number;
  gold: number;
  runStats: RunStats;
  completenessPercent: number;
  dungeonsCompleted: number;
  dungeonsExitedEarly: number;
  treasureScore: number;
  /** Monster (or other source) that killed the player, if known. */
  killedBy?: string;
}

export function computeTreasureScore(record: Omit<DeathRecord, "treasureScore">): number {
  const { runStats, dungeonsCompleted, completenessPercent, outcome } = record;
  let score = 0;
  score += dungeonsCompleted * 60;
  score += completenessPercent * 0.4;
  score += Math.min(15, runStats.goldCollected * 0.04);
  score += Math.min(8, runStats.monstersKilled * 0.5);
  if (outcome === "success") score += 20;
  return Math.round(score);
}

export function availableLegacyPoints(totalXp: number, spent: number): number {
  return Math.max(0, playerLevelFromXp(totalXp) - 1 - spent);
}

const DEATH_RECORDS_KEY = "mazegen_death_records";
const LEGACY_XP_KEY = "mazegen_legacy_xp";
const LEGACY_SPENT_KEY = "mazegen_legacy_spent";
const MAX_DEATH_RECORDS = 100;

function loadNumber(key: string, fallback = 0): number {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? Number(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persistNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

export function computeCompleteness(stats: RunStats): number {
  const total = stats.totalMonsters + stats.totalChests + stats.totalFloorItems;
  if (total === 0) return 0;
  const done = stats.monstersKilled + stats.chestsLooted + stats.floorItemsCollected;
  return Math.round((done / total) * 100);
}

function loadDeathRecords(): DeathRecord[] {
  try {
    const raw = localStorage.getItem(DEATH_RECORDS_KEY);
    return raw ? (JSON.parse(raw) as DeathRecord[]) : [];
  } catch {
    return [];
  }
}

function persistDeathRecords(records: DeathRecord[]): void {
  try {
    localStorage.setItem(DEATH_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // ignore quota errors
  }
}

const DEFAULT_MUSIC_VOLUME = 0.15;
const DEFAULT_SFX_VOLUME = 0.45;

export type GameScreen =
  | "main-menu"
  | "overworld"
  | "dungeon"
  | "death"
  | "seed-picker"
  | "character-picker"
  | "success"
  | "graveyard"
  | "";

interface MusicState {
  /** Key of the currently playing track, or null if silent. */
  currentTrack: string | null;
  /** Start playing a track by key (fades out previous, fades in new). No-op if already playing that key. */
  setTrack: (key: string | null) => void;
  /** Master music volume [0, 1]. */
  musicVolume: number;
  setMusicVolume: (vol: number) => void;
}

interface SfxState {
  /**
   * Play a one-shot SFX by key.
   * - "immediate" (default): plays concurrently with any already-playing instance.
   * - "queued": waits for the current sound to finish before playing the next one.
   *   At most one pending queued play is kept per key; extra calls while waiting are dropped.
   */
  playSfx: (key: string, mode?: "immediate" | "queued") => void;
  /** Master SFX volume [0, 1]. */
  sfxVolume: number;
  setSfxVolume: (vol: number) => void;
}

interface GameState extends MusicState, SfxState {
  screen: GameScreen;
  player: Player;
  setPlayer: Dispatch<SetStateAction<Player>>;
  seed: string | number;
  level: number;
  setLevel: (newLevel: number) => void;
  /** Current floor within the dungeon (1-indexed). Reset to 1 on dungeon entry. */
  floor: number;
  setFloor: (floor: number) => void;
  /** Portal theme id (e.g. "cave", "ruins", "crypt", "temple", "lair"). */
  theme: string;
  setTheme: (theme: string) => void;
  overworldBsp: BspDungeonOutputs | null;
  overworldContent: ForestContentOutputs | null;
  setOverworld: (bsp: BspDungeonOutputs, content: ForestContentOutputs) => void;
  setSeed: (newSeed: string | number) => void;
  goTo: (screen: GameScreen) => void;
  /** Set of dungeon seeds the player has fully cleared. */
  completedDungeons: Set<string | number>;
  markDungeonComplete: (seed: string | number) => void;
  /** Set of secret location IDs the player has already interacted with. */
  usedSecrets: Set<number>;
  markSecretUsed: (id: number) => void;
  /** Set of secret location IDs that have been revealed (location known, not yet visited). */
  revealedSecrets: Set<number>;
  revealSecret: (id: number) => void;
  /** Cumulative stats across all dungeons in this life. Null until first dungeon stat flush. */
  runStats: RunStats | null;
  /** Merge a dungeon's stats into the running life total. */
  accumulateRunStats: (stats: RunStats) => void;
  /** Monster or source that killed the player, if known. */
  killedBy: string | null;
  setKilledBy: (name: string | null) => void;
  /** Persistent list of all run records (deaths + victories). */
  deathRecords: DeathRecord[];
  /** Save a completed run to localStorage. */
  recordRun: (outcome: "death" | "success") => void;
  /** Treasure score earned by the most recent recorded run. */
  lastRunTreasureScore: number | null;
  /** Dungeons completed in the current life (across overworld trips). */
  runDungeonsCompleted: number;
  /** Dungeons exited early in the current life. */
  runDungeonsExitedEarly: number;
  incrementRunCompleted: () => void;
  incrementRunExitedEarly: () => void;
  /** Cumulative legacy XP earned across all runs. */
  legacyXp: number;
  /** Total legacy attribute points already spent. */
  legacyPointsSpent: number;
  /** Points currently available to spend in CharacterPicker. */
  availableLegacyPoints: number;
  spendLegacyPoints: (n: number) => void;
  /** True when the player has cleared all overworld portals (world victory). */
  isWorldVictory: boolean;
  setIsWorldVictory: (v: boolean) => void;
}

const GameContext = createContext<GameState | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<GameScreen>("");
  const [player, setPlayer] = useState<Player>(DEFAULT_PLAYER);
  const [seed, setSeed] = useState<string | number>("test");
  const [level, setLevel] = useState<number>(1);
  const [floor, setFloor] = useState<number>(1);
  const [theme, setTheme] = useState<string>("cave");
  const [completedDungeons, setCompletedDungeons] = useState<
    Set<string | number>
  >(new Set());
  const [usedSecrets, setUsedSecrets] = useState<Set<number>>(new Set());
  const [revealedSecrets, setRevealedSecrets] = useState<Set<number>>(
    new Set(),
  );
  // Cumulative stats across all dungeons in the current life.
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const cumulativeStatsRef = useRef<RunStats>(EMPTY_STATS);
  const [killedBy, setKilledBy] = useState<string | null>(null);
  const killedByRef = useRef<string | null>(null);
  killedByRef.current = killedBy;

  const accumulateRunStats = useCallback((stats: RunStats) => {
    cumulativeStatsRef.current = mergeStats(cumulativeStatsRef.current, stats);
    setRunStats({ ...cumulativeStatsRef.current });
  }, []);

  const [deathRecords, setDeathRecords] = useState<DeathRecord[]>(() => loadDeathRecords());
  const [lastRunTreasureScore, setLastRunTreasureScore] = useState<number | null>(null);
  const [legacyXp, setLegacyXp] = useState(() => loadNumber(LEGACY_XP_KEY));
  const [legacyPointsSpent, setLegacyPointsSpent] = useState(() => loadNumber(LEGACY_SPENT_KEY));

  // Dungeon count refs — refs so recordRun always reads the latest value.
  const runDungeonsCompletedRef = useRef(0);
  const runDungeonsExitedEarlyRef = useRef(0);
  const [runDungeonsCompleted, setRunDungeonsCompleted] = useState(0);
  const [runDungeonsExitedEarly, setRunDungeonsExitedEarly] = useState(0);

  const incrementRunCompleted = useCallback(() => {
    runDungeonsCompletedRef.current += 1;
    setRunDungeonsCompleted(runDungeonsCompletedRef.current);
  }, []);

  const incrementRunExitedEarly = useCallback(() => {
    runDungeonsExitedEarlyRef.current += 1;
    setRunDungeonsExitedEarly(runDungeonsExitedEarlyRef.current);
  }, []);

  const seedRef = useRef(seed);
  const levelRef = useRef(level);
  const themeRef = useRef(theme);
  const playerRef = useRef(player);
  seedRef.current = seed;
  levelRef.current = level;
  themeRef.current = theme;
  playerRef.current = player;

  const legacyXpRef = useRef(legacyXp);
  legacyXpRef.current = legacyXp;

  const recordRun = useCallback((outcome: "death" | "success") => {
    const stats = cumulativeStatsRef.current;
    // If no stats accumulated yet, still record a blank run
    const p = playerRef.current;
    const dungeonsCompleted = runDungeonsCompletedRef.current;
    const dungeonsExitedEarly = runDungeonsExitedEarlyRef.current;
    const partial: Omit<DeathRecord, "treasureScore"> = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      seed: seedRef.current,
      level: levelRef.current,
      theme: themeRef.current,
      outcome,
      playerLevel: p.level ?? 1,
      playerMaxHp: p.maxHp,
      gold: p.gold ?? 0,
      runStats: stats,
      completenessPercent: computeCompleteness(stats),
      dungeonsCompleted,
      dungeonsExitedEarly,
      killedBy: killedByRef.current ?? undefined,
    };
    const score = computeTreasureScore(partial);
    const record: DeathRecord = { ...partial, treasureScore: score };
    setLastRunTreasureScore(score);
    // Reset per-life state
    cumulativeStatsRef.current = { ...EMPTY_STATS };
    setRunStats(null);
    runDungeonsCompletedRef.current = 0;
    runDungeonsExitedEarlyRef.current = 0;
    setRunDungeonsCompleted(0);
    setRunDungeonsExitedEarly(0);
    killedByRef.current = null;
    setKilledBy(null);
    // Accumulate legacy XP
    setLegacyXp((prev) => {
      const next = prev + score;
      persistNumber(LEGACY_XP_KEY, next);
      return next;
    });
    setDeathRecords((prev) => {
      const next = [record, ...prev].slice(0, MAX_DEATH_RECORDS);
      persistDeathRecords(next);
      return next;
    });
  }, []);

  const spendLegacyPoints = useCallback((n: number) => {
    setLegacyPointsSpent((prev) => {
      const next = prev + n;
      persistNumber(LEGACY_SPENT_KEY, next);
      return next;
    });
  }, []);

  const [isWorldVictory, setIsWorldVictory] = useState(false);

  const [overworldBsp, setOverworldBsp] = useState<BspDungeonOutputs | null>(
    null,
  );
  const [overworldContent, setOverworldContent] =
    useState<ForestContentOutputs | null>(null);

  // ── Music ────────────────────────────────────────────────────────────────
  const FADE_MS = 1000;
  const howlsRef = useRef<Record<string, Howl>>({});
  const currentTrackKeyRef = useRef<string | null>(null);
  const musicVolumeRef = useRef(DEFAULT_MUSIC_VOLUME);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [musicVolume, setMusicVolumeState] = useState(DEFAULT_MUSIC_VOLUME);

  useEffect(() => {
    const howls = howlsRef.current;
    Object.entries(MUSIC_TRACKS).forEach(([key, url]) => {
      howls[key] = new Howl({
        src: [publicUrl(url)],
        loop: true,
        volume: musicVolumeRef.current,
        preload: true,
      });
    });

    return () => {
      Object.values(howls).forEach((h) => h.unload());
    };
  }, []);

  const setTrack = useCallback((key: string | null) => {
    const prevKey = currentTrackKeyRef.current;
    if (prevKey === key) return;

    if (prevKey) {
      const prev = howlsRef.current[prevKey];
      if (prev) {
        prev.fade(prev.volume(), 0, FADE_MS);
        setTimeout(() => prev.stop(), FADE_MS);
      }
    }

    currentTrackKeyRef.current = key;
    setCurrentTrack(key);

    if (key) {
      const next = howlsRef.current[key];
      if (next) {
        next.volume(0);
        next.play();
        next.fade(0, musicVolumeRef.current, FADE_MS);
      }
    }
  }, []);

  useEffect(() => {
    if (screen === "overworld") {
      setTrack("dark-woods");
    } else if (screen === "dungeon") {
      setTrack("bloodrat-sewers");
    } else if (screen !== "") {
      setTrack("frost-mountain");
    }
  }, [screen]);

  const setMusicVolume = useCallback((vol: number) => {
    musicVolumeRef.current = vol;
    setMusicVolumeState(vol);
    const key = currentTrackKeyRef.current;
    if (key) howlsRef.current[key]?.volume(vol);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  // ── SFX ──────────────────────────────────────────────────────────────────
  // For series entries, sfxHowlsRef stores an array of Howls; for singles, a 1-element array.
  const sfxHowlsRef = useRef<Record<string, Howl[]>>({});
  // Round-robin index per key.
  const sfxSeriesIndexRef = useRef<Record<string, number>>({});
  // Last played Howl + sound ID per key, used for queued mode to check if still playing.
  const sfxLastPlayRef = useRef<
    Record<string, { howl: Howl; soundId: number } | null>
  >({});
  // Whether a queued play is already pending for a key (cap at one pending per key).
  const sfxQueuedRef = useRef<Record<string, boolean>>({});
  const sfxVolumeRef = useRef(DEFAULT_MUSIC_VOLUME);
  const [sfxVolume, setSfxVolumeState] = useState(DEFAULT_SFX_VOLUME);

  useEffect(() => {
    const howls = sfxHowlsRef.current;
    Object.entries(SFX_TRACKS).forEach(([key, entry]) => {
      const urls = Array.isArray(entry) ? entry : [entry];
      howls[key] = urls.map(
        (url) =>
          new Howl({
            src: [publicUrl(url)],
            loop: false,
            volume: sfxVolumeRef.current,
            preload: true,
          }),
      );
      sfxSeriesIndexRef.current[key] = 0;
    });

    return () => {
      Object.values(howls)
        .flat()
        .forEach((h) => h.unload());
    };
  }, []);

  const playSfx = useCallback(
    (key: string, mode: "immediate" | "queued" = "immediate") => {
      const series = sfxHowlsRef.current[key];
      if (!series || series.length === 0) return;

      const playNow = () => {
        const idx = sfxSeriesIndexRef.current[key] ?? 0;
        const howl = series[idx % series.length];
        howl.volume(sfxVolumeRef.current);
        const soundId = howl.play();
        sfxLastPlayRef.current[key] = { howl, soundId };
        sfxSeriesIndexRef.current[key] = (idx + 1) % series.length;
      };

      if (mode === "immediate") {
        playNow();
        return;
      }

      // Queued mode: wait for the current sound to finish before playing.
      const last = sfxLastPlayRef.current[key];
      if (last && last.howl.playing(last.soundId)) {
        // Already waiting? Drop this call to avoid pile-up.
        if (sfxQueuedRef.current[key]) return;
        sfxQueuedRef.current[key] = true;
        last.howl.once(
          "end",
          () => {
            sfxQueuedRef.current[key] = false;
            playNow();
          },
          last.soundId,
        );
      } else {
        playNow();
      }
    },
    [],
  );

  const setSfxVolume = useCallback((vol: number) => {
    sfxVolumeRef.current = vol;
    setSfxVolumeState(vol);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  if (screen === "") {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "default",
        }}
        onClick={() => setScreen("main-menu")}
      >
        <div style={{ maxHeight: "2rem", fontSize: "21pt" }}>
          Click to Begin!
        </div>
      </div>
    );
  }

  return (
    <GameContext.Provider
      value={{
        screen,
        player,
        setPlayer,
        seed,
        level,
        setLevel: (newLevel: number) => setLevel(newLevel),
        floor,
        setFloor: (newFloor: number) => setFloor(newFloor),
        theme,
        setTheme: (newTheme: string) => setTheme(newTheme),
        setSeed: (newSeed: string | number) => setSeed(newSeed),
        overworldBsp,
        overworldContent,
        setOverworld: (
          bsp: BspDungeonOutputs,
          content: ForestContentOutputs,
        ) => {
          setOverworldBsp(bsp);
          setOverworldContent(content);
        },
        goTo: setScreen,
        completedDungeons,
        markDungeonComplete: (seed: string | number) =>
          setCompletedDungeons((prev) => new Set([...prev, seed])),
        usedSecrets,
        markSecretUsed: (id: number) =>
          setUsedSecrets((prev) => new Set([...prev, id])),
        revealedSecrets,
        revealSecret: (id: number) =>
          setRevealedSecrets((prev) => new Set([...prev, id])),
        runStats,
        accumulateRunStats,
        killedBy,
        setKilledBy,
        deathRecords,
        recordRun,
        lastRunTreasureScore,
        runDungeonsCompleted,
        runDungeonsExitedEarly,
        incrementRunCompleted,
        incrementRunExitedEarly,
        legacyXp,
        legacyPointsSpent,
        availableLegacyPoints: availableLegacyPoints(legacyXp, legacyPointsSpent),
        spendLegacyPoints,
        isWorldVictory,
        setIsWorldVictory,
        currentTrack,
        setTrack,
        musicVolume,
        setMusicVolume,
        playSfx,
        sfxVolume,
        setSfxVolume,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameState {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
