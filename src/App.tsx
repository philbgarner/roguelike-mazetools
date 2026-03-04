import { GameProvider, useGame } from "./game/GameProvider";
import Dungeon from "./game/Dungeon";
import Overworld from "./game/Overworld";
import MainMenu from "./game/MainMenu";
import Success from "./game/Success";
import SeedPicker from "./game/SeedPicker";

function AppInner() {
  const { screen, seed } = useGame();
  console.log("screen", screen);
  return (
    <>
      <Overworld screen={screen} />
      {screen === "dungeon" ? <Dungeon seed={seed} /> : null}
      {screen === "main-menu" ? <MainMenu /> : null}
      {screen === "seed-picker" ? <SeedPicker /> : null}
    </>
  );

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
