import { GameProvider, useGame } from "./game/GameProvider";
import Game from "./game/Game";
import MainMenu from "./game/MainMenu";
import Success from "./game/Success";

function AppInner() {
  const { screen } = useGame();

  if (screen === "dungeon") return <Game />;
  if (screen === "main-menu") return <MainMenu />;
  if (screen === "success") return <Success />;

  // Placeholder screens — replace with real components as needed
  return <div style={{ color: "white", padding: 32 }}>Screen: {screen}</div>;
}

export default function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
