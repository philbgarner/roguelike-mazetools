// src/rendering/actorCharMask.ts
import * as THREE from "three";

export type ActorCharMask = { data: Uint8Array; tex: THREE.DataTexture };

export function createActorCharMaskR8(
  W: number,
  H: number,
  name: string,
): ActorCharMask {
  const data = new Uint8Array(W * H);
  const tex = new THREE.DataTexture(
    data,
    W,
    H,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  tex.name = name;
  return { data, tex };
}

export function clearActorCharMask(data: Uint8Array): void {
  data.fill(0);
}

export type ActorStamp = { id: string; x: number; y: number; tile?: number };

export function stampBlocksToActorCharMask(args: {
  data: Uint8Array;
  W: number;
  H: number;
  blocks: { x: number; y: number }[];
  blockTile: number;
}): void {
  const { data, W, H, blocks, blockTile } = args;
  for (const b of blocks) {
    const { x, y } = b;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    data[y * W + x] = (blockTile & 0x7f) | 0x80;
  }
}

/**
 * Stamp NPC actors into the NPC char R8 texture.
 * Encoding: tile ID stored directly (1-255); 0 = no NPC.
 */
export function stampNpcsToNpcCharMask(args: {
  data: Uint8Array;
  W: number;
  H: number;
  npcs: ActorStamp[];
  npcTile: number;
}): void {
  const { data, W, H, npcs, npcTile } = args;
  for (const npc of npcs) {
    const { x, y } = npc;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    data[y * W + x] = (npc.tile ?? npcTile) & 0xff;
  }
}

export function stampMonstersToActorCharMask(args: {
  data: Uint8Array;
  W: number;
  H: number;
  monsters: ActorStamp[];
  monsterTile: number;
  avoidCell?: { x: number; y: number };
  blocked?: (x: number, y: number) => boolean;
}): void {
  const { data, W, H, monsters, monsterTile, avoidCell, blocked } = args;
  for (const m of monsters) {
    const { x, y } = m;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    if (avoidCell && avoidCell.x === x && avoidCell.y === y) continue;
    if (blocked && blocked(x, y)) continue;
    data[y * W + x] = (m.tile ?? monsterTile) & 0xff;
  }
}
