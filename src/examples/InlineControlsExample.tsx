import React, { useCallback } from "react";
import { generateDungeon } from "../api";
import ExampleShell from "./ExampleShell";

export default function InlineControlsExample() {
  const generate = useCallback(
    () =>
      generateDungeon({
        seed: 42,
        level: 1,
        themeId: "babylon_ziggurat",
        difficultyBand: {
          totalRooms: { min: 6, max: 14 },
          criticalPathLength: { min: 3, max: 10 },
          maxGateDepth: { max: 3 },
        },
        contentBudget: {
          doors: { min: 1, max: 6 },
          monsters: { min: 1, max: 8 },
          chests: { min: 1, max: 5 },
        },
        pacingTargets: {
          firstGateDistance: { min: 1, max: 5 },
          rewardAfterGate: { enabled: true, maxDistance: 3 },
          rampProfile: { target: "linear" },
        },
      }),
    [],
  );

  return (
    <ExampleShell
      title="Inline Authorial Controls"
      description="babylon_ziggurat with custom difficulty, budget, and pacing"
      generate={generate}
    />
  );
}
