import type { GenerateDungeonResult } from "../api/publicTypes";
import type { InspectionShellSingleResult } from "../inspect/InspectionShell";
import {
  initDungeonRuntimeState,
  derivePlatesFromBlocks,
} from "../dungeonState";
import { evaluateCircuits } from "../evaluateCircuits";

/**
 * Bridge: converts a public-API GenerateDungeonResult into the shape
 * InspectionShell expects (geometry + runtime state + circuit diagnostics).
 */
export function prepareInspectionResult(
  result: GenerateDungeonResult,
): InspectionShellSingleResult {
  const { bsp, content } = result;

  let rt0 = initDungeonRuntimeState(content);
  rt0 = derivePlatesFromBlocks(rt0, content);

  const eval0 = evaluateCircuits(rt0, content.meta.circuits);

  return {
    dungeon: bsp,
    content,
    runtime0: eval0.next,
    circuitDiagnostics0: eval0.diagnostics ?? null,
    circuitDebug0: eval0.debug ?? null,
  };
}
