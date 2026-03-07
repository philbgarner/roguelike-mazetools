import { GameProvider, useGame } from "./game/GameProvider";
import Dungeon from "./game/Dungeon";
import Overworld from "./game/Overworld";
import MainMenu from "./game/MainMenu";
import Success from "./game/Success";
import Death from "./game/Death";
import SeedPicker from "./game/SeedPicker";
import CharacterPicker from "./game/ui/CharacterPicker";

function AppInner() {
  const { screen, seed, floor } = useGame();
  console.log("screen", screen);
  return (
    <>
      <Overworld screen={screen} />
      {screen === "dungeon" ? <Dungeon seed={seed} key={`dungeon-${seed}-${floor}`} /> : null}
      {screen === "main-menu" ? <MainMenu /> : null}
      {screen === "seed-picker" ? <SeedPicker /> : null}
      {screen === "character-picker" ? <CharacterPicker /> : null}
      {screen === "death" ? <Death /> : null}
      {screen === "success" ? <Success /> : null}
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
