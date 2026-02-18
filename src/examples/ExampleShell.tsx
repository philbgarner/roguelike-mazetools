import React, { useMemo, useCallback, useState } from "react";
import type { GenerateDungeonResult } from "../api/publicTypes";
import InspectionShell from "../inspect/InspectionShell";
import { prepareInspectionResult } from "./prepareResult";

export type ExampleShellProps = {
  title: string;
  description: string;
  /** Factory that calls generateDungeon with this example's params. */
  generate: () => GenerateDungeonResult;
};

export default function ExampleShell({
  title,
  description,
  generate,
}: ExampleShellProps) {
  const [generation, setGeneration] = useState(0);

  const inspectionResult = useMemo(() => {
    void generation; // depend on generation counter to allow re-generation
    const apiResult = generate();
    return prepareInspectionResult(apiResult);
  }, [generate, generation]);

  const handleBack = useCallback(() => {
    window.location.hash = "#/examples";
  }, []);

  const handleRegenerate = useCallback(() => {
    setGeneration((g) => g + 1);
  }, []);

  return (
    <InspectionShell
      result={inspectionResult}
      title={`${title} — ${description}`}
      onBack={handleBack}
      onRandomizeSeedAndRegenerate={handleRegenerate}
    />
  );
}
