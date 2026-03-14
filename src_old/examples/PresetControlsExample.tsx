import React, { useCallback } from "react";
import { generateDungeon } from "../api";
import ExampleShell from "./ExampleShell";

export default function PresetControlsExample() {
  const generate = useCallback(
    () =>
      generateDungeon({
        seed: 42,
        level: 1,
        themeId: "medieval_keep",
        difficultyBandId: "medium",
        budgetId: "balanced",
        pacingId: "standard",
      }),
    [],
  );

  return (
    <ExampleShell
      title="Preset Authorial Controls"
      description='medium difficulty, balanced budget, standard pacing'
      generate={generate}
    />
  );
}
