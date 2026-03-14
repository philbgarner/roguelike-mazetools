/**
 * Deterministic room theme selection.
 *
 * Given a dungeon theme's available room themes and a room's computed tags,
 * pick the best-matching room theme. Deterministic by (seed, themeId, roomId).
 *
 * Strategy:
 *   1. Score each candidate room theme against the room's tags using an
 *      affinity table (tag→roomThemeId→bonus).
 *   2. Pick the highest-scoring candidate.
 *   3. Tie-break deterministically using a hash of (seed, themeId, roomId).
 *   4. If no affinity matches at all, fall back to hash-based uniform pick.
 */

import type { DungeonTheme, RoomTheme } from "./themeTypes";
import type { RoomTag } from "./roomTags";

// ---------------------------------------------------------------------------
// Simple deterministic hash (FNV-1a 32-bit)
// ---------------------------------------------------------------------------

function fnv1a(data: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0; // unsigned 32-bit
}

/**
 * Produce a deterministic float in [0, 1) from a composite key.
 */
function hashToFloat(seed: number, themeId: string, roomId: number): number {
  return fnv1a(`${seed}:${themeId}:${roomId}`) / 0x100000000;
}

// ---------------------------------------------------------------------------
// Tag → Room theme affinity
// ---------------------------------------------------------------------------

/**
 * Default affinity rules. Each entry maps a RoomTag to a map of
 * roomTheme ids that get a bonus score when that tag is present.
 *
 * Themes not listed here get 0 bonus for that tag.
 * The system is best-effort: unknown theme ids are silently ignored.
 */
const TAG_AFFINITY: Partial<Record<RoomTag, Record<string, number>>> = {
  // Structural
  entrance: { throne_room: 3, offering_hall: 3, observation: 2 },
  boss: { throne_room: 5, sacred_pool: 4, operating_room: 4 },
  dead_end: { dungeon_cell: 3, storage: 3, recovery_ward: 2 },
  hub: { library: 2, scribe_chamber: 2, observation: 2 },
  large: { throne_room: 2, offering_hall: 2, operating_room: 2 },
  small: { dungeon_cell: 2, storage: 2, recovery_ward: 1 },

  // Content
  has_monsters: { armory: 2, offering_hall: 1, operating_room: 2 },
  high_danger: { armory: 3, offering_hall: 2, operating_room: 3 },
  has_chest: { library: 2, scribe_chamber: 2, storage: 2 },
  high_loot: { throne_room: 3, sacred_pool: 3, observation: 2 },
  has_hazard: { dungeon_cell: 2, sacred_pool: 3, recovery_ward: 2 },
  has_secret: { library: 3, scribe_chamber: 3, storage: 1 },
  has_puzzle: { library: 2, scribe_chamber: 2, observation: 2 },
  gated: { dungeon_cell: 2, sacred_pool: 2, recovery_ward: 2 },
};

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Select a room theme for one room.
 *
 * @param seed     Generation seed (number)
 * @param theme    The dungeon theme (provides candidate room themes)
 * @param roomId   The room's numeric id (1-based)
 * @param tags     The room's computed tags
 * @returns The selected RoomTheme (never null — falls back to hash pick)
 */
export function selectRoomThemeForRoom(
  seed: number,
  theme: DungeonTheme,
  roomId: number,
  tags: Set<RoomTag>,
): RoomTheme {
  const candidates = theme.roomThemes;
  if (candidates.length === 0) {
    return { id: "default", label: "Default" };
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  // Score each candidate
  const scores: number[] = new Array(candidates.length).fill(0);
  for (const tag of tags) {
    const affinities = TAG_AFFINITY[tag];
    if (!affinities) continue;
    for (let i = 0; i < candidates.length; i++) {
      const bonus = affinities[candidates[i].id];
      if (bonus) scores[i] += bonus;
    }
  }

  // Find max score
  let maxScore = 0;
  for (const s of scores) {
    if (s > maxScore) maxScore = s;
  }

  // Collect tied candidates (all at max score; if all 0, that means everyone)
  const tiedIndices: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] === maxScore) tiedIndices.push(i);
  }

  // Deterministic tie-break via hash
  const h = hashToFloat(seed, theme.id, roomId);
  const pick = tiedIndices[Math.floor(h * tiedIndices.length)];
  return candidates[pick];
}

// ---------------------------------------------------------------------------
// Batch helper — select themes for all rooms in a dungeon
// ---------------------------------------------------------------------------

/**
 * Select room themes for every room, returning a map roomId → RoomTheme.
 */
export function selectAllRoomThemes(
  seed: number,
  theme: DungeonTheme,
  tagsByRoomId: Map<number, Set<RoomTag>>,
): Map<number, RoomTheme> {
  const result = new Map<number, RoomTheme>();
  for (const [roomId, tags] of tagsByRoomId) {
    result.set(roomId, selectRoomThemeForRoom(seed, theme, roomId, tags));
  }
  return result;
}
