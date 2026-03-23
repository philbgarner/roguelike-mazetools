// src/rendering/temperatureMask.ts
//
// Per-cell temperature mask: 0 = coldest, 255 = hottest.
//
// Corridor cells in the BSP dungeon share regionId=0 in the original texture,
// making them indistinguishable from one another.  buildTemperatureMask assigns
// each connected corridor segment a unique regionId (starting above the highest
// room ID) so callers can target individual corridors the same way they target
// rooms.

import * as THREE from "three";
import type { BspDungeonOutputs } from "../bsp";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TemperatureMask = {
  /** Per-cell temperature, 0 = cold, 255 = hot. Backed by `texture`. */
  data: Uint8Array;
  /** THREE.DataTexture (RedFormat / UnsignedByteType) sharing `data`'s buffer. */
  texture: THREE.DataTexture;
  /**
   * Copy of the dungeon's regionId data with corridor cells re-labelled.
   * Room cells keep their original IDs (1-N).
   * Corridor segments get IDs starting from `firstCorridorRegionId`.
   * Wall cells remain 0.
   */
  fullRegionIds: Uint8Array;
  /** Lowest regionId assigned to a corridor segment. */
  firstCorridorRegionId: number;
  /** Sorted list of every unique corridor regionId that was assigned. */
  corridorRegionIds: number[];
};

// ─── Internal helpers ────────────────────────────────────────────────────────

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

// ─── Corridor flood-fill ─────────────────────────────────────────────────────

/**
 * Builds a combined region-id array where corridor floor cells (regionId === 0
 * in the original texture) are flood-filled into unique IDs.
 *
 * @param regionIdData  Original regionId pixel data (0 = corridor/wall, 1+ = room)
 * @param solidData     Solid pixel data (255 = wall, 0 = floor)
 * @param W             Dungeon width
 * @param H             Dungeon height
 * @param firstId       First ID to assign to corridor segments (must be > max room ID)
 * @returns `{ fullRegionIds, corridorRegionIds }` where `corridorRegionIds` lists
 *          every ID that was assigned to a corridor segment.
 */
export function buildFullRegionIds(
  regionIdData: Uint8Array,
  solidData: Uint8Array,
  W: number,
  H: number,
  firstId: number,
): { fullRegionIds: Uint8Array; corridorRegionIds: number[] } {
  const full = new Uint8Array(regionIdData); // copy — room cells already have IDs
  const visited = new Uint8Array(W * H);
  const corridorRegionIds: number[] = [];
  let nextId = firstId;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (solidData[i] !== 0) continue;       // wall
      if (regionIdData[i] !== 0) continue;    // room cell — keep its original ID
      if (visited[i]) continue;               // corridor cell already labelled

      // Clamp to byte range, skip 0 which means "no region"
      const corridorId = ((nextId - 1) & 0xff) + 1;
      nextId++;
      corridorRegionIds.push(corridorId);

      // BFS over connected corridor-floor cells
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
          if (solidData[ni] !== 0) continue;    // wall
          if (regionIdData[ni] !== 0) continue; // room cell
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
 * Creates a zeroed temperature mask for the given BSP dungeon.
 *
 * Corridor cells are flood-filled and assigned unique regionIds that are
 * guaranteed not to conflict with any room ID in `dungeon.rooms`.
 */
export function buildTemperatureMask(dungeon: BspDungeonOutputs): TemperatureMask {
  const { width: W, height: H, rooms, textures } = dungeon;
  const regionIdData = textures.regionId.image.data as Uint8Array;
  const solidData = textures.solid.image.data as Uint8Array;

  const maxRoomId =
    rooms.size > 0 ? Math.max(...rooms.keys()) : 0;
  const firstCorridorRegionId = maxRoomId + 1;

  const { fullRegionIds, corridorRegionIds } = buildFullRegionIds(
    regionIdData,
    solidData,
    W,
    H,
    firstCorridorRegionId,
  );

  const data = new Uint8Array(W * H); // all zeros = cold
  const texture = makeDataTexture(data, W, H, "temperature_mask");

  return { data, texture, fullRegionIds, firstCorridorRegionId, corridorRegionIds };
}

/**
 * Sets the temperature of every cell that belongs to `regionId`.
 *
 * Works for both room regionIds (1 .. maxRoomId) and corridor regionIds
 * (firstCorridorRegionId .. ).
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
 * Identical to `setRegionTemperature` — room regionIds are unchanged from
 * the original BSP output (values 1 .. maxRoomId).
 */
export const setRoomTemperature = setRegionTemperature;

/**
 * Convenience alias for setting a corridor segment's temperature.
 * `corridorRegionId` must be one of the values in `mask.corridorRegionIds`.
 */
export const setCorridorTemperature = setRegionTemperature;
