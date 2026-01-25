// src/rendering/tiles.ts
import * as THREE from "three";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";

export type TileBuildParams = {
  wallTile: number;
  floorTile: number;

  // Example mappings (adjust to your atlas)
  doorTile?: number;
  keyTile?: number;
  leverTile?: number;
  plateTile?: number;
  blockTile?: number;
  chestTile?: number;
  monsterTile?: number;
};

export function buildCharMask(
  bsp: BspDungeonOutputs,
  content: ContentOutputs,
  params: TileBuildParams,
): Uint8Array {
  const W = bsp.width;
  const H = bsp.height;

  const out = new Uint8Array(W * H);
  const solid = bsp.masks.solid;
  const ft = content.masks.featureType;

  for (let i = 0; i < out.length; i++) {
    if (solid[i] === 255) {
      out[i] = 0; // shader will choose wall tile
      continue;
    }

    const featureType = ft[i];

    // Very first-pass mapping. Update these numbers once you lock featureType enums.
    // Common ones in your project: doors/keys/levers/plates/blocks/chests/monsters/hazards.
    let t = 0;

    switch (featureType) {
      case 1: // door (example)
        t = params.doorTile ?? 0;
        break;
      case 2: // key (example)
        t = params.keyTile ?? 0;
        break;
      case 3: // lever (example)
        t = params.leverTile ?? 0;
        break;
      case 4: // plate (example)
        t = params.plateTile ?? 0;
        break;
      case 5: // block (example)
        t = params.blockTile ?? 0;
        break;
      case 6: // chest (example)
        t = params.chestTile ?? 0;
        break;
      case 7: // monster (example)
        t = params.monsterTile ?? 0;
        break;
      default:
        t = 0;
        break;
    }

    out[i] = t & 0xff;
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

  return tex;
}
