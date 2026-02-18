import React, { useCallback } from "react";
import { generateDungeon } from "../api";
import ExampleShell from "./ExampleShell";

export default function MinimalExample() {
  const generate = useCallback(
    () => generateDungeon({ seed: 42, level: 1 }),
    [],
  );

  return (
    <ExampleShell
      title="Minimal Call"
      description="generateDungeon({ seed: 42, level: 1 })"
      generate={generate}
    />
  );
}
