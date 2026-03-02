import { createContext, useContext, useState, type ReactNode } from "react";
import { BspDungeonOutputs, ForestContentOutputs } from "../mazeGen";

export type GameScreen =
  | "main-menu"
  | "overworld"
  | "dungeon"
  | "death"
  | "success";

interface GameState {
  screen: GameScreen;
  seed: string | number;
  overworldBsp: BspDungeonOutputs | null;
  overworldContent: ForestContentOutputs | null;
  setOverworld: (bsp: BspDungeonOutputs, content: ForestContentOutputs) => void;
  setSeed: (newSeed: string | number) => void;
  goTo: (screen: GameScreen) => void;
}

const GameContext = createContext<GameState | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<GameScreen>("main-menu");
  const [seed, setSeed] = useState<string | number>("test");
  const [overworldBsp, setOverworldBsp] = useState<BspDungeonOutputs | null>(
    null,
  );
  const [overworldContent, setOverworldContent] =
    useState<ForestContentOutputs | null>(null);

  return (
    <GameContext.Provider
      value={{
        screen,
        seed,
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
