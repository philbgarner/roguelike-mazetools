import React, { useCallback } from "react";
import { generateDungeon } from "../api";
import ExampleShell from "./ExampleShell";

export default function ThemedExample() {
  const generate = useCallback(
    () => generateDungeon({ seed: 42, level: 1, themeId: "medieval_keep" }),
    [],
  );

  return (
    <ExampleShell
      title="With Theme"
      description='themeId: "medieval_keep" — resolved spawns + render uniforms'
      generate={generate}
    />
  );
}
