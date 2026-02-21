// src/rendering/tiles.ts
import * as THREE from "three";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
// FeatureType values are defined in mazeGen.ts as literal union 0..10.

export type TileBuildParams = {
  wallTile: number;
  floorTile: number;

  // FeatureType-specific tiles (adjust to your atlas)
  monsterTile?: number; // FeatureType=1
  chestTile?: number; // FeatureType=2
  secretDoorTile?: number; // FeatureType=3
  doorTile?: number; // FeatureType=4
  keyTile?: number; // FeatureType=5
  leverTile?: number; // FeatureType=6
  plateTile?: number; // FeatureType=7
  blockTile?: number; // FeatureType=8
  hiddenPassageTile?: number; // FeatureType=9

  // Hazards (FeatureType=10)
  hazardDefaultTile?: number;
  hazardTilesByType?: Partial<Record<number, number>>; // hazardType -> tile index

  playerX?: number;
  playerY?: number;
  playerTile?: number;
};

// 0=base, 1=player, 2=item/interactable, 3=hazard
export function buildTintMask(
  bsp: BspDungeonOutputs,
  content: ContentOutputs,
  params: Pick<TileBuildParams, "playerX" | "playerY">,
): Uint8Array {
  const W = bsp.width;
  const H = bsp.height;
  const out = new Uint8Array(W * H);

  const solid = bsp.masks.solid; // 0 floor, 255 wall
  const ft = content.masks.featureType;

  for (let i = 0; i < out.length; i++) {
    if (solid[i] === 255) {
      out[i] = 0;
      continue;
    }

    const featureType = ft[i] ?? 0;

    // hazards get danger tint
    if (featureType === 10) {
      out[i] = 3;
      continue;
    }

    // interactables/items (tinted consistently for now)
    // 1 monster, 2 chest, 4 door, 5 key, 6 lever, 7 plate, 8 block, 9 hidden passage
    if (
      featureType === 1 ||
      featureType === 2 ||
      featureType === 4 ||
      featureType === 5 ||
      featureType === 6 ||
      featureType === 7 ||
      featureType === 8 ||
      featureType === 9
    ) {
      out[i] = 2;
      continue;
    }

    out[i] = 0;
  }

  // Player wins
  if (params.playerX !== undefined && params.playerY !== undefined) {
    const px = params.playerX | 0;
    const py = params.playerY | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      const pi = py * W + px;
      if (solid[pi] !== 255) out[pi] = 1;
    }
  }

  return out;
}

export function buildCharMask(
  bsp: BspDungeonOutputs,
  content: ContentOutputs,
  params: TileBuildParams,
): Uint8Array {
  const W = bsp.width;
  const H = bsp.height;

  const out = new Uint8Array(W * H);

  const solid = bsp.masks.solid; // 0 floor, 255 wall
  const ft = content.masks.featureType; // FeatureType enum
  const hz = content.masks.hazardType ?? null; // meaningful if ft==10

  for (let i = 0; i < out.length; i++) {
    // Let shader choose base wall/floor. Only override with a non-zero tile index.
    if (solid[i] === 255) {
      out[i] = 0;
      continue;
    }

    const featureType = ft[i] ?? 0;

    let t = 0;
    switch (featureType) {
      case 1: // monster (if used)
        t = params.monsterTile ?? 0;
        break;
      case 2: // chest
        t = params.chestTile ?? 0;
        break;
      case 3: // secret door
        t = params.secretDoorTile ?? 0;
        break;
      case 4: // door
        t = params.doorTile ?? 0;
        break;
      case 5: // key
        t = params.keyTile ?? 0;
        break;
      case 6: // lever
        t = params.leverTile ?? 0;
        break;
      case 7: // plate
        t = params.plateTile ?? 0;
        break;
      case 8: // block
        t = params.blockTile ?? 0;
        break;
      case 9: // hidden passage
        t = params.hiddenPassageTile ?? 0;
        break;
      case 10: {
        const hazardType = hz ? hz[i] : 0;
        t =
          (params.hazardTilesByType && params.hazardTilesByType[hazardType]) ??
          params.hazardDefaultTile ??
          0;
        break;
      }
      default:
        t = 0;
    }

    out[i] = t & 0xff;
  }

  // --- Player overlay (highest priority) ------------------------------------
  if (
    params.playerTile !== undefined &&
    params.playerX !== undefined &&
    params.playerY !== undefined
  ) {
    const px = params.playerX | 0;
    const py = params.playerY | 0;
    if (px >= 0 && px < W && py >= 0 && py < H) {
      const pi = py * W + px;
      // only place player on non-wall cells
      if (solid[pi] !== 255) {
        out[pi] = params.playerTile & 0xff;
      }
    }
  }

  return out;
}

export function maskToTileTextureR8(
  mask: Uint8Array,
  W: number,
  H: number,
  name: string,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    mask,
    W,
    H,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );

  tex.name = name;
  tex.needsUpdate = true;

  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;

  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;

  // Match your generator DataTextures
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;

  return tex;
}

export function maskToTileTextureRGBA8(
  mask: Uint8Array,
  W: number,
  H: number,
  name: string,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    mask,
    W,
    H,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );

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
