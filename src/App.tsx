import { GameProvider, useGame } from "./game/GameProvider";
import Dungeon from "./game/Dungeon";
import HomeBase from "./game/Overworld";
import MainMenu from "./game/MainMenu";
import Success from "./game/Success";

function AppInner() {
  const { screen } = useGame();

  if (screen === "dungeon") return <Dungeon />;
  if (screen === "home-base") return <HomeBase />;
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
