import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { BspDungeonOutputs, ForestContentOutputs } from "../mazeGen";
import { Player, DEFAULT_PLAYER } from "./player";

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

interface GameState {
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
  const [completedDungeons, setCompletedDungeons] = useState<Set<string | number>>(new Set());
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [overworldBsp, setOverworldBsp] = useState<BspDungeonOutputs | null>(
    null,
  );
  const [overworldContent, setOverworldContent] =
    useState<ForestContentOutputs | null>(null);

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
        runStats,
        setRunStats,
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
