// src/rendering/hiddenPassagesMask.ts
//
// Per-cell byte values for the hidden passages mask:
//   0 = no passage
//   1 = passage cell, disabled (locked)
//   2 = passage cell, enabled (enterable)

import type { HiddenPassage, ContentHiddenPassages } from "../content";

export const PASSAGE_NONE     = 0;
export const PASSAGE_DISABLED = 1;
export const PASSAGE_ENABLED  = 2;

/** Write all cells of a passage into the mask. Use PASSAGE_NONE to erase. */
export function stampPassageToMask(
  mask: Uint8Array,
  width: number,
  passage: HiddenPassage,
  value: 0 | 1 | 2,
): void {
  for (const cell of passage.cells) {
    mask[cell.y * width + cell.x] = value;
  }
}

/** Enable a passage in the mask (stamp with PASSAGE_ENABLED). */
export function enablePassageInMask(
  mask: Uint8Array,
  width: number,
  passage: HiddenPassage,
): void {
  stampPassageToMask(mask, width, passage, PASSAGE_ENABLED);
}

/** Disable a passage in the mask (stamp with PASSAGE_DISABLED). */
export function disablePassageInMask(
  mask: Uint8Array,
  width: number,
  passage: HiddenPassage,
): void {
  stampPassageToMask(mask, width, passage, PASSAGE_DISABLED);
}

/**
 * Build the initial mask from a full ContentHiddenPassages object.
 * All passages start disabled.
 */
export function buildPassageMask(
  width: number,
  height: number,
  hiddenPassages: ContentHiddenPassages,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const passage of hiddenPassages.passages) {
    stampPassageToMask(mask, width, passage, PASSAGE_DISABLED);
  }
  return mask;
}
