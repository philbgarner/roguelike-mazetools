// src/inspect/computeStartCell.ts
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";

export type Cell = { x: number; y: number };

function isFloor(dungeon: BspDungeonOutputs, x: number, y: number) {
  const w = dungeon.width;
  const i = y * w + x;
  // Contract: floor predicate is "not wall"
  return dungeon.masks.solid[i] !== 255;
}

export function computeStartCell(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
): Cell {
  const w = dungeon.width;
  const h = dungeon.height;

  const entranceRoomId = (content.meta.entranceRoomId ?? 0) | 0;
  const regionId = dungeon.masks.regionId;

  // Fallback: center if it’s floor; otherwise first floor in scan
  const fallback: Cell = { x: Math.floor(w / 2), y: Math.floor(h / 2) };

  const fallbackFloor = (): Cell => {
    if (
      fallback.x >= 0 &&
      fallback.x < w &&
      fallback.y >= 0 &&
      fallback.y < h &&
      isFloor(dungeon, fallback.x, fallback.y)
    ) {
      return fallback;
    }

    // bounded scan
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isFloor(dungeon, x, y)) return { x, y };
      }
    }

    return fallback;
  };

  if (entranceRoomId <= 0) return fallbackFloor();

  // Find entrance room bounds by scanning regionId (matches current content composite behavior)
  let minX = 1e9,
    minY = 1e9,
    maxX = -1,
    maxY = -1;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((regionId[i] | 0) === entranceRoomId) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return fallbackFloor();

  // Center of bounds
  const cx = Math.floor((minX + maxX) / 2);
  const cy = Math.floor((minY + maxY) / 2);

  // If center is floor, use it
  if (cx >= 0 && cx < w && cy >= 0 && cy < h && isFloor(dungeon, cx, cy)) {
    return { x: cx, y: cy };
  }

  // Otherwise search outward for nearest floor (bounded)
  const R = 8;
  for (let r = 1; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        if (isFloor(dungeon, x, y)) return { x, y };
      }
    }
  }

  return fallbackFloor();
}
