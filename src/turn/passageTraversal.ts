// src/turn/passageTraversal.ts
//
// Passage traversal state machine.
// Models step-by-step movement through a hidden passage tunnel.
// Traversal is driven by the same step-loop useEffect that drives auto-walk.

import type { HiddenPassage } from "../content";

export type PassageTraversalState =
  | { kind: "idle" }
  | {
      kind: "active";
      passageId: number;
      /** Remaining cells to walk (index 0 = next cell to step into). */
      remainingCells: Array<{ x: number; y: number }>;
    };

/**
 * Begin a traversal from the player's current position.
 * Player must be standing at passage.start or passage.end.
 * Returns null if the player is not at either mouth.
 */
export function startPassageTraversal(
  passage: HiddenPassage,
  playerPos: { x: number; y: number },
): PassageTraversalState | null {
  const fromStart =
    passage.start.x === playerPos.x && passage.start.y === playerPos.y;
  const fromEnd =
    passage.end.x === playerPos.x && passage.end.y === playerPos.y;
  if (!fromStart && !fromEnd) return null;

  // Skip the player's current cell (index 0 when going forward, last when reversed)
  const cells = fromStart
    ? passage.cells.slice(1)
    : [...passage.cells].reverse().slice(1);

  if (cells.length === 0) return null;
  return { kind: "active", passageId: passage.id, remainingCells: cells };
}

/**
 * Consume the next step from an active traversal.
 * Returns the cell to move into and the updated state.
 */
export function consumePassageStep(
  state: PassageTraversalState & { kind: "active" },
): {
  cell: { x: number; y: number };
  next: PassageTraversalState;
} {
  const [cell, ...rest] = state.remainingCells;
  const next: PassageTraversalState =
    rest.length > 0
      ? { kind: "active", passageId: state.passageId, remainingCells: rest }
      : { kind: "idle" };
  return { cell, next };
}

export function cancelPassageTraversal(): PassageTraversalState {
  return { kind: "idle" };
}
