// src/serialize.ts
//
// Dungeon state serialization to/from JSON-safe plain objects.
// Textures hold all mutable state; generation inputs are stored for
// full rehydration (including the room graph) without re-running from scratch.

import type { BspDungeonOptions, BspDungeonOutputs, RoomInfo } from "./bsp";
import { generateBspDungeon } from "./bsp";
import { buildFullRegionIds } from "./rendering/temperatureMask";
import * as THREE from "three";

// --------------------------------
// Types
// --------------------------------

/**
 * Plain, JSON-safe snapshot of a dungeon's mutable texture data.
 * Immutable generation inputs are stored so the dungeon can be fully
 * reconstructed without the original options object.
 */
export type SerializedDungeon = {
  version: 1;
  width: number;
  height: number;
  seed: number;
  startRoomId: number;
  endRoomId: number;
  /** Base64-encoded Uint8Array for each texture channel. */
  solid: string;
  regionId: string;
  distanceToWall: string;
  hazards: string;
};

// --------------------------------
// Base64 helpers
// --------------------------------

function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function base64ToUint8(str: string): Uint8Array {
  const binary = atob(str);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function textureData(tex: THREE.DataTexture): Uint8Array {
  return tex.image.data as Uint8Array;
}

// --------------------------------
// DataTexture reconstruction
// --------------------------------

function makeDataTexture(data: Uint8Array, W: number, H: number, name: string): THREE.DataTexture {
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

function makeDataTextureRGBA(data: Uint8Array, W: number, H: number, name: string): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
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

// --------------------------------
// Public API
// --------------------------------

/**
 * Snapshot all mutable texture data into a JSON-safe object.
 * Call after generateContent() to capture placed content (doors, hazards, etc.).
 */
export function serializeDungeon(dungeon: BspDungeonOutputs): SerializedDungeon {
  return {
    version: 1,
    width: dungeon.width,
    height: dungeon.height,
    seed: dungeon.seed,
    startRoomId: dungeon.startRoomId,
    endRoomId: dungeon.endRoomId,
    solid:         uint8ToBase64(textureData(dungeon.textures.solid)),
    regionId:      uint8ToBase64(textureData(dungeon.textures.regionId)),
    distanceToWall: uint8ToBase64(textureData(dungeon.textures.distanceToWall)),
    hazards:       uint8ToBase64(textureData(dungeon.textures.hazards)),
  };
}

/**
 * Reconstruct a BspDungeonOutputs from a snapshot.
 * The returned object is fully usable with generateContent, aStar8, computeFov, etc.
 * The `rooms` map is empty — call rehydrateDungeon() if room graph data is needed.
 */
export function deserializeDungeon(data: SerializedDungeon): BspDungeonOutputs {
  const { width: W, height: H } = data;
  const solidData    = base64ToUint8(data.solid);
  const regionIdData = base64ToUint8(data.regionId);

  // Reconstruct corridor region IDs from the raw arrays
  const rooms = new Map<number, RoomInfo>();
  const maxRoomId = regionIdData.reduce((m, v) => (v > m ? v : m), 0);
  const firstCorridorRegionId = maxRoomId + 1;
  const { fullRegionIds } = buildFullRegionIds(
    regionIdData, solidData, W, H, firstCorridorRegionId,
  );

  // Default temperature: 127 for all floor cells
  const temperature = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (solidData[i] === 0) temperature[i] = 127;
  }

  return {
    width: W,
    height: H,
    seed: data.seed,
    startRoomId: data.startRoomId,
    endRoomId: data.endRoomId,
    rooms,
    fullRegionIds,
    firstCorridorRegionId,
    textures: {
      solid:          makeDataTexture(solidData,                           W, H, "bsp_dungeon_solid"),
      regionId:       makeDataTexture(regionIdData,                        W, H, "bsp_dungeon_region_id"),
      distanceToWall: makeDataTexture(base64ToUint8(data.distanceToWall), W, H, "bsp_dungeon_distance_to_wall"),
      hazards:        makeDataTexture(base64ToUint8(data.hazards),        W, H, "bsp_dungeon_hazards"),
      temperature:    makeDataTexture(temperature,                        W, H, "bsp_dungeon_temperature"),
      floorType:       makeDataTexture(new Uint8Array(W * H),           W, H, "bsp_dungeon_floor_type"),
      overlays:        makeDataTextureRGBA(new Uint8Array(4 * W * H),  W, H, "bsp_dungeon_overlays"),
      wallType:        makeDataTexture(new Uint8Array(W * H),           W, H, "bsp_dungeon_wall_type"),
      wallOverlays:    makeDataTextureRGBA(new Uint8Array(4 * W * H),  W, H, "bsp_dungeon_wall_overlays"),
      ceilingType:     makeDataTexture(new Uint8Array(W * H),           W, H, "bsp_dungeon_ceiling_type"),
      ceilingOverlays: makeDataTextureRGBA(new Uint8Array(4 * W * H),  W, H, "bsp_dungeon_ceiling_overlays"),
    },
  };
}

/**
 * Full rehydration: deserializes texture data AND reconstructs the room graph
 * by re-running BSP with the stored seed. Rooms will be identical because
 * generation is deterministic.
 */
export function rehydrateDungeon(
  data: SerializedDungeon,
  originalOptions: Omit<BspDungeonOptions, "seed">,
): BspDungeonOutputs {
  // Re-run BSP to recover the room graph (deterministic from seed)
  const fresh = generateBspDungeon({ ...originalOptions, seed: data.seed });

  // Overwrite texture data with the serialized (post-content) state
  const solidData          = base64ToUint8(data.solid);
  const regionIdData       = base64ToUint8(data.regionId);
  const distanceToWallData = base64ToUint8(data.distanceToWall);
  const hazardsData        = base64ToUint8(data.hazards);

  (fresh.textures.solid.image.data          as Uint8Array).set(solidData);
  (fresh.textures.regionId.image.data       as Uint8Array).set(regionIdData);
  (fresh.textures.distanceToWall.image.data as Uint8Array).set(distanceToWallData);
  (fresh.textures.hazards.image.data        as Uint8Array).set(hazardsData);

  fresh.textures.solid.needsUpdate          = true;
  fresh.textures.regionId.needsUpdate       = true;
  fresh.textures.distanceToWall.needsUpdate = true;
  fresh.textures.hazards.needsUpdate        = true;

  return fresh;
}

/**
 * Convenience: serialize a dungeon to a JSON string.
 */
export function dungeonToJson(dungeon: BspDungeonOutputs): string {
  return JSON.stringify(serializeDungeon(dungeon));
}

/**
 * Convenience: deserialize a dungeon from a JSON string.
 * The `rooms` map will be empty; use rehydrateDungeon() for full restoration.
 */
export function dungeonFromJson(json: string): BspDungeonOutputs {
  return deserializeDungeon(JSON.parse(json) as SerializedDungeon);
}
