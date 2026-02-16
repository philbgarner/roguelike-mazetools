/**
 * Room tagging — derive semantic tags from generator/content outputs.
 *
 * Tags describe what a room "is" based on its contents, graph position,
 * and structural properties. Downstream consumers (room theme selection,
 * spawn resolution) use tags to make deterministic decisions.
 */

import type { ContentOutputs, BspDungeonOutputs } from "../mazeGen";

// ---------------------------------------------------------------------------
// Tag vocabulary
// ---------------------------------------------------------------------------

/**
 * Authoritative list of room tags.
 *
 * Structural:
 *   entrance        — the starting room
 *   boss            — the farthest room (boss / final encounter)
 *   main_path       — room lies on the critical path
 *   dead_end        — single neighbor in room graph
 *   hub             — 3+ neighbors in room graph
 *   large           — room area ≥ 120 cells
 *   small           — room area ≤ 35 cells
 *
 * Content:
 *   has_monsters     — at least one monster spawn
 *   high_danger      — contains a monster with danger ≥ 4
 *   has_chest        — at least one chest
 *   high_loot        — contains a chest with tier ≥ 4
 *   has_hazard       — at least one hazard
 *   has_secret       — at least one secret
 *   has_puzzle       — contains a key, lever, plate, or block
 *   has_door         — room is adjacent to (roomA or roomB of) a door
 *   gated            — room is behind a locked/lever door (roomB side)
 */
export type RoomTag =
  | "entrance"
  | "boss"
  | "main_path"
  | "dead_end"
  | "hub"
  | "large"
  | "small"
  | "has_monsters"
  | "high_danger"
  | "has_chest"
  | "high_loot"
  | "has_hazard"
  | "has_secret"
  | "has_puzzle"
  | "has_door"
  | "gated";

// ---------------------------------------------------------------------------
// Compute tags
// ---------------------------------------------------------------------------

/**
 * Derive per-room tag sets from generator outputs.
 *
 * @param bsp    BSP layout (rooms geometry)
 * @param content Content placement outputs
 * @returns Map from roomId (1-based) to its tag set
 */
export function computeRoomTags(
  bsp: BspDungeonOutputs,
  content: ContentOutputs,
): Map<number, Set<RoomTag>> {
  const rooms = bsp.meta.rooms; // 0-indexed array; roomId = index + 1
  const meta = content.meta;
  const result = new Map<number, Set<RoomTag>>();

  // Initialize a tag set for every room
  for (let i = 0; i < rooms.length; i++) {
    result.set(i + 1, new Set());
  }

  const addTag = (roomId: number, tag: RoomTag) => {
    const s = result.get(roomId);
    if (s) s.add(tag);
  };

  // ---- Structural tags ----------------------------------------------------

  // Entrance & boss
  if (meta.entranceRoomId) addTag(meta.entranceRoomId, "entrance");
  if (meta.farthestRoomId) addTag(meta.farthestRoomId, "boss");

  // Main path
  const mainPathSet = new Set(meta.mainPathRoomIds ?? []);
  for (const rid of mainPathSet) addTag(rid, "main_path");

  // Graph degree → dead_end / hub
  const graph = meta.roomGraph;
  if (graph) {
    for (const [rid, neighbors] of graph) {
      if (neighbors.size <= 1) addTag(rid, "dead_end");
      if (neighbors.size >= 3) addTag(rid, "hub");
    }
  }

  // Size tags (based on room area)
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const area = r.w * r.h;
    if (area >= 120) addTag(i + 1, "large");
    if (area <= 35) addTag(i + 1, "small");
  }

  // ---- Content tags -------------------------------------------------------

  // Monsters
  for (const m of meta.monsters ?? []) {
    addTag(m.roomId, "has_monsters");
    if (m.danger >= 4) addTag(m.roomId, "high_danger");
  }

  // Chests
  for (const c of meta.chests ?? []) {
    addTag(c.roomId, "has_chest");
    if (c.tier >= 4) addTag(c.roomId, "high_loot");
  }

  // Hazards
  for (const h of meta.hazards ?? []) {
    addTag(h.roomId, "has_hazard");
  }

  // Secrets
  for (const s of meta.secrets ?? []) {
    addTag(s.roomId, "has_secret");
  }

  // Puzzle elements (keys, levers, plates, blocks)
  for (const k of meta.keys ?? []) addTag(k.roomId, "has_puzzle");
  for (const l of meta.levers ?? []) addTag(l.roomId, "has_puzzle");
  for (const p of meta.plates ?? []) addTag(p.roomId, "has_puzzle");
  for (const b of meta.blocks ?? []) addTag(b.roomId, "has_puzzle");

  // Doors — tag both sides; roomB is the "gated" side
  for (const d of meta.doors ?? []) {
    addTag(d.roomA, "has_door");
    addTag(d.roomB, "has_door");
    addTag(d.roomB, "gated");
  }

  return result;
}
