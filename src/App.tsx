import { GameProvider, useGame } from "./game/GameProvider";
import Dungeon from "./game/Dungeon";
import Overworld from "./game/Overworld";
import MainMenu from "./game/MainMenu";
import Success from "./game/Success";
import Death from "./game/Death";
import SeedPicker from "./game/SeedPicker";
import Graveyard from "./game/Graveyard";
function AppInner() {
  const { screen, seed, floor } = useGame();
  console.log("screen", screen);
  const showDungeon = screen === "dungeon" || screen === "success" || screen === "death";
  return (
    <>
      <Overworld screen={screen} />
      {showDungeon ? <Dungeon seed={seed} key={`dungeon-${seed}-${floor}`} /> : null}
      {screen === "main-menu" ? <MainMenu /> : null}
      {screen === "seed-picker" ? <SeedPicker /> : null}
      {screen === "death" ? <Death /> : null}
      {screen === "success" ? <Success /> : null}
      {screen === "graveyard" ? <Graveyard /> : null}
    </>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
