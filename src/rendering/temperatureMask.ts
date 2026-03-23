// src/rendering/temperatureMask.ts
//
// Per-cell temperature mask: 0 = coldest, 255 = hottest.
//
// generateBspDungeon already assigns each room and corridor segment a unique
// regionId (via fullRegionIds) and defaults all floor cells to 127.
// This module provides a lightweight wrapper and the helpers for updating
// per-region temperatures at runtime.

import * as THREE from "three";
import type { BspDungeonOutputs } from "../bsp";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TemperatureMask = {
  /** Per-cell temperature, 0 = cold, 255 = hot. Backed by `texture`. */
  data: Uint8Array;
  /** THREE.DataTexture (RedFormat / UnsignedByteType) sharing `data`'s buffer. */
  texture: THREE.DataTexture;
  /**
   * Region-id map with corridor cells re-labelled into unique IDs.
   * Room cells keep their original IDs (1..maxRoomId).
   * Corridor cells have IDs starting at `firstCorridorRegionId`.
   * Wall cells are 0.
   */
  fullRegionIds: Uint8Array;
  /** Lowest regionId assigned to a corridor segment. */
  firstCorridorRegionId: number;
  /** Sorted list of every unique corridor regionId. */
  corridorRegionIds: number[];
};

// ─── Internal texture helper (for standalone use without BspDungeonOutputs) ──

function makeDataTexture(
  data: Uint8Array,
  W: number,
  H: number,
  name: string,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.name = name;
  tex.needsUpdate = true;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  return tex;
}

// ─── Corridor flood-fill (exported for use with plain DungeonOutputs) ────────

/**
 * Builds a combined region-id array where corridor floor cells (regionId === 0
 * in the original texture) are flood-filled into unique IDs.
 *
 * Only needed when working with a plain `DungeonOutputs` that lacks the
 * pre-computed `fullRegionIds` field.  For `BspDungeonOutputs`, prefer
 * `buildTemperatureMask` which uses the already-computed data.
 */
export function buildFullRegionIds(
  regionIdData: Uint8Array,
  solidData: Uint8Array,
  W: number,
  H: number,
  firstId: number,
): { fullRegionIds: Uint8Array; corridorRegionIds: number[] } {
  const full = new Uint8Array(regionIdData);
  const visited = new Uint8Array(W * H);
  const corridorRegionIds: number[] = [];
  let nextId = firstId;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (solidData[i] !== 0) continue;
      if (regionIdData[i] !== 0) continue;
      if (visited[i]) continue;

      const corridorId = ((nextId - 1) & 0xff) + 1;
      nextId++;
      corridorRegionIds.push(corridorId);

      const queue: number[] = [i];
      visited[i] = 1;
      let head = 0;
      while (head < queue.length) {
        const ci = queue[head++];
        full[ci] = corridorId;
        const cx = ci % W;
        const cy = (ci / W) | 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (visited[ni]) continue;
          if (solidData[ni] !== 0) continue;
          if (regionIdData[ni] !== 0) continue;
          visited[ni] = 1;
          queue.push(ni);
        }
      }
    }
  }

  return { fullRegionIds: full, corridorRegionIds };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Wraps the temperature data already computed by `generateBspDungeon` into a
 * `TemperatureMask` for convenient runtime updates.
 *
 * The returned `data` and `texture` point directly at the dungeon's existing
 * temperature buffer — no copy is made.
 */
export function buildTemperatureMask(dungeon: BspDungeonOutputs): TemperatureMask {
  const data = dungeon.textures.temperature.image.data as Uint8Array;
  const corridorRegionIds = Array.from(dungeon.rooms.values())
    .filter((r) => r.type === "corridor")
    .map((r) => r.id)
    .sort((a, b) => a - b);

  return {
    data,
    texture: dungeon.textures.temperature,
    fullRegionIds: dungeon.fullRegionIds,
    firstCorridorRegionId: dungeon.firstCorridorRegionId,
    corridorRegionIds,
  };
}

/**
 * Sets the temperature of every cell that belongs to `regionId`.
 *
 * Works for both room regionIds (1 .. maxRoomId) and corridor regionIds
 * (firstCorridorRegionId+).
 *
 * @param mask        The TemperatureMask to modify
 * @param W           Dungeon width
 * @param H           Dungeon height
 * @param regionId    The region to update (room or corridor ID)
 * @param temperature Value in [0, 255]; 255 = hottest, 0 = coldest
 */
export function setRegionTemperature(
  mask: TemperatureMask,
  W: number,
  H: number,
  regionId: number,
  temperature: number,
): void {
  const temp = Math.max(0, Math.min(255, Math.round(temperature)));
  const { data, fullRegionIds } = mask;
  const len = W * H;
  for (let i = 0; i < len; i++) {
    if (fullRegionIds[i] === regionId) {
      data[i] = temp;
    }
  }
  mask.texture.needsUpdate = true;
}

/**
 * Convenience alias for setting a room's temperature by its roomId.
 * Room regionIds are unchanged from the original BSP output (values 1..maxRoomId).
 */
export const setRoomTemperature = setRegionTemperature;

/**
 * Convenience alias for setting a corridor segment's temperature.
 * `corridorRegionId` must be one of the values in `mask.corridorRegionIds`.
 */
export const setCorridorTemperature = setRegionTemperature;

/**
 * Builds a standalone TemperatureMask from raw dungeon arrays, for use with
 * plain `DungeonOutputs` that lack `fullRegionIds`.  Defaults all floor cells
 * to `defaultTemperature` (127 if not specified).
 */
export function buildTemperatureMaskFromArrays(
  regionIdData: Uint8Array,
  solidData: Uint8Array,
  W: number,
  H: number,
  maxRoomId: number,
  defaultTemperature = 127,
): TemperatureMask {
  const firstId = maxRoomId + 1;
  const { fullRegionIds, corridorRegionIds } = buildFullRegionIds(
    regionIdData,
    solidData,
    W,
    H,
    firstId,
  );
  const data = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (solidData[i] === 0) data[i] = defaultTemperature;
  }
  const texture = makeDataTexture(data, W, H, "temperature_mask");
  return {
    data,
    texture,
    fullRegionIds,
    firstCorridorRegionId: firstId,
    corridorRegionIds,
  };
}
