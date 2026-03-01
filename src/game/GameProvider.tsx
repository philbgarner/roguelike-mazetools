import { createContext, useContext, useState, type ReactNode } from "react";

export type GameScreen =
  | "main-menu"
  | "overworld"
  | "dungeon"
  | "death"
  | "success";

interface GameState {
  screen: GameScreen;
  goTo: (screen: GameScreen) => void;
}

const GameContext = createContext<GameState | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<GameScreen>("main-menu");

  return (
    <GameContext.Provider value={{ screen, goTo: setScreen }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameState {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
