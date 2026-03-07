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

export interface RunStats {
  monstersKilled: number;
  totalMonsters: number;
  chestsLooted: number;
  totalChests: number;
  floorItemsCollected: number;
  totalFloorItems: number;
  goldCollected: number;
}

export type GameScreen =
  | "main-menu"
  | "overworld"
  | "dungeon"
  | "death"
  | "seed-picker"
  | "character-picker"
  | "success";

interface MusicState {
  /** Key of the currently playing track, or null if silent. */
  currentTrack: string | null;
  /** Start playing a track by key (fades out previous, fades in new). No-op if already playing that key. */
  setTrack: (key: string | null) => void;
  /** Master music volume [0, 1]. */
  musicVolume: number;
  setMusicVolume: (vol: number) => void;
}

interface GameState extends MusicState {
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
  /** Stats from the most recent dungeon run (set before transitioning to success/death). */
  runStats: RunStats | null;
  setRunStats: (stats: RunStats) => void;
}

const GameContext = createContext<GameState | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<GameScreen>("main-menu");
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
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [overworldBsp, setOverworldBsp] = useState<BspDungeonOutputs | null>(
    null,
  );
  const [overworldContent, setOverworldContent] =
    useState<ForestContentOutputs | null>(null);

  // ── Music ────────────────────────────────────────────────────────────────
  const FADE_MS = 1000;
  const howlsRef = useRef<Record<string, Howl>>({});
  const currentTrackKeyRef = useRef<string | null>(null);
  const musicVolumeRef = useRef(0.7);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [musicVolume, setMusicVolumeState] = useState(0.7);

  useEffect(() => {
    const howls = howlsRef.current;
    Object.entries(MUSIC_TRACKS).forEach(([key, url]) => {
      howls[key] = new Howl({
        src: [url],
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
    }
  }, [screen]);

  const setMusicVolume = useCallback((vol: number) => {
    musicVolumeRef.current = vol;
    setMusicVolumeState(vol);
    const key = currentTrackKeyRef.current;
    if (key) howlsRef.current[key]?.volume(vol);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

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
        setRunStats,
        currentTrack,
        setTrack,
        musicVolume,
        setMusicVolume,
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
