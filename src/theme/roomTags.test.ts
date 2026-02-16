/**
 * Smoke / sanity tests for room tagging and deterministic room theme selection.
 *
 * Run: npx tsx src/theme/roomTags.test.ts
 */

import { computeRoomTags } from "./roomTags";
import type { RoomTag } from "./roomTags";
import { selectRoomThemeForRoom, selectAllRoomThemes } from "./selectRoomThemes";
import { THEME_MEDIEVAL_KEEP } from "./defaultThemes";

// ---------------------------------------------------------------------------
// Minimal mock data (avoids THREE dependency)
// ---------------------------------------------------------------------------

function makeMockBsp(roomCount: number) {
  const rooms = [];
  for (let i = 0; i < roomCount; i++) {
    rooms.push({ x: i * 12, y: 0, w: 10, h: 10 }); // area = 100 each
  }
  return {
    meta: { rooms, seedUsed: 42 },
  } as any;
}

function makeMockContent(opts: {
  roomCount: number;
  entranceRoomId: number;
  farthestRoomId: number;
  mainPathRoomIds: number[];
  roomGraph: Map<number, Set<number>>;
  monsters?: Array<{ id: number; x: number; y: number; roomId: number; danger: number }>;
  chests?: Array<{ id: number; x: number; y: number; roomId: number; tier: number }>;
  doors?: Array<{ id: number; x: number; y: number; roomA: number; roomB: number; kind: number; depth: number }>;
  hazards?: Array<{ id: number; x: number; y: number; roomId: number; hazardType: number; activeInitial: boolean }>;
  secrets?: Array<{ id: number; x: number; y: number; roomId: number; kind: string }>;
  keys?: Array<{ id: number; x: number; y: number; roomId: number }>;
  levers?: Array<{ id: number; x: number; y: number; roomId: number }>;
  plates?: any[];
  blocks?: any[];
}) {
  return {
    meta: {
      entranceRoomId: opts.entranceRoomId,
      farthestRoomId: opts.farthestRoomId,
      mainPathRoomIds: opts.mainPathRoomIds,
      roomGraph: opts.roomGraph,
      rooms: [],
      monsters: opts.monsters ?? [],
      chests: opts.chests ?? [],
      doors: opts.doors ?? [],
      hazards: opts.hazards ?? [],
      secrets: opts.secrets ?? [],
      keys: opts.keys ?? [],
      levers: opts.levers ?? [],
      plates: opts.plates ?? [],
      blocks: opts.blocks ?? [],
      circuits: [],
      patternDiagnostics: [],
    },
  } as any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("=== Room Tags Tests ===\n");

// Test 1: Basic structural tags
{
  console.log("Test 1: Structural tags (entrance, boss, main_path, dead_end, hub)");
  const graph = new Map<number, Set<number>>([
    [1, new Set([2])],           // dead end
    [2, new Set([1, 3, 4])],     // hub (3 neighbors)
    [3, new Set([2])],           // dead end
    [4, new Set([2])],           // dead end
  ]);

  const bsp = makeMockBsp(4);
  const content = makeMockContent({
    roomCount: 4,
    entranceRoomId: 1,
    farthestRoomId: 3,
    mainPathRoomIds: [1, 2, 3],
    roomGraph: graph,
  });

  const tags = computeRoomTags(bsp, content);

  assert(tags.get(1)!.has("entrance"), "room 1 should be entrance");
  assert(tags.get(3)!.has("boss"), "room 3 should be boss");
  assert(tags.get(1)!.has("main_path"), "room 1 on main path");
  assert(tags.get(2)!.has("main_path"), "room 2 on main path");
  assert(!tags.get(4)!.has("main_path"), "room 4 not on main path");
  assert(tags.get(1)!.has("dead_end"), "room 1 is dead end (1 neighbor)");
  assert(tags.get(2)!.has("hub"), "room 2 is hub (3 neighbors)");
}

// Test 2: Content tags
{
  console.log("Test 2: Content tags (monsters, chests, hazards, secrets, puzzle, doors)");
  const graph = new Map<number, Set<number>>([
    [1, new Set([2])],
    [2, new Set([1])],
  ]);

  const bsp = makeMockBsp(2);
  const content = makeMockContent({
    roomCount: 2,
    entranceRoomId: 1,
    farthestRoomId: 2,
    mainPathRoomIds: [1, 2],
    roomGraph: graph,
    monsters: [{ id: 1, x: 5, y: 5, roomId: 1, danger: 5 }],
    chests: [{ id: 2, x: 15, y: 5, roomId: 2, tier: 4 }],
    doors: [{ id: 3, x: 10, y: 5, roomA: 1, roomB: 2, kind: 1, depth: 1 }],
    levers: [{ id: 4, x: 6, y: 6, roomId: 1 }],
    hazards: [{ id: 5, x: 16, y: 6, roomId: 2, hazardType: 1, activeInitial: true }],
  });

  const tags = computeRoomTags(bsp, content);

  assert(tags.get(1)!.has("has_monsters"), "room 1 has monsters");
  assert(tags.get(1)!.has("high_danger"), "room 1 has high danger (5)");
  assert(tags.get(2)!.has("has_chest"), "room 2 has chest");
  assert(tags.get(2)!.has("high_loot"), "room 2 has high loot (tier 4)");
  assert(tags.get(1)!.has("has_door"), "room 1 adjacent to door");
  assert(tags.get(2)!.has("gated"), "room 2 is gated (roomB)");
  assert(tags.get(1)!.has("has_puzzle"), "room 1 has puzzle (lever)");
  assert(tags.get(2)!.has("has_hazard"), "room 2 has hazard");
}

// Test 3: Size tags
{
  console.log("Test 3: Size tags (large, small)");
  const bsp = {
    meta: {
      rooms: [
        { x: 0, y: 0, w: 12, h: 12 },  // area 144 → large
        { x: 20, y: 0, w: 5, h: 5 },    // area 25 → small
        { x: 40, y: 0, w: 8, h: 8 },    // area 64 → neither
      ],
      seedUsed: 42,
    },
  } as any;
  const graph = new Map<number, Set<number>>([
    [1, new Set([2, 3])],
    [2, new Set([1])],
    [3, new Set([1])],
  ]);
  const content = makeMockContent({
    roomCount: 3,
    entranceRoomId: 1,
    farthestRoomId: 3,
    mainPathRoomIds: [1, 3],
    roomGraph: graph,
  });
  const tags = computeRoomTags(bsp, content);

  assert(tags.get(1)!.has("large"), "room 1 is large (area=144)");
  assert(tags.get(2)!.has("small"), "room 2 is small (area=25)");
  assert(!tags.get(3)!.has("large") && !tags.get(3)!.has("small"), "room 3 is medium");
}

console.log("\n=== Room Theme Selection Tests ===\n");

// Test 4: Determinism
{
  console.log("Test 4: Determinism — same inputs yield same result");
  const tags = new Set<RoomTag>(["entrance", "has_monsters", "main_path"]);
  const r1 = selectRoomThemeForRoom(42, THEME_MEDIEVAL_KEEP, 1, tags);
  const r2 = selectRoomThemeForRoom(42, THEME_MEDIEVAL_KEEP, 1, tags);
  assert(r1.id === r2.id, `deterministic: both picks = "${r1.id}"`);
}

// Test 5: Different seeds → potentially different picks
{
  console.log("Test 5: Different seeds can produce different results");
  const tags = new Set<RoomTag>([]); // no affinity → pure hash pick
  const results = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    results.add(selectRoomThemeForRoom(seed, THEME_MEDIEVAL_KEEP, 1, tags).id);
  }
  assert(results.size > 1, `multiple themes selected across seeds (got ${results.size} distinct)`);
}

// Test 6: Tag affinity influences selection
{
  console.log("Test 6: Tags influence selection (boss → throne_room)");
  const bossTags = new Set<RoomTag>(["boss", "large", "high_loot"]);
  // Run many seeds — throne_room should appear more than random chance
  let throneCount = 0;
  const trials = 200;
  for (let seed = 0; seed < trials; seed++) {
    const pick = selectRoomThemeForRoom(seed, THEME_MEDIEVAL_KEEP, 99, bossTags);
    if (pick.id === "throne_room") throneCount++;
  }
  // With 4 room themes, random would give ~25%. With affinity, throne_room
  // should appear significantly more.
  const ratio = throneCount / trials;
  assert(ratio > 0.35, `throne_room selected ${(ratio * 100).toFixed(0)}% of time for boss rooms (expected >35%)`);
}

// Test 7: selectAllRoomThemes covers every room
{
  console.log("Test 7: selectAllRoomThemes assigns a theme to every room");
  const tagMap = new Map<number, Set<RoomTag>>();
  for (let i = 1; i <= 10; i++) {
    tagMap.set(i, new Set(["main_path"]));
  }
  const result = selectAllRoomThemes(42, THEME_MEDIEVAL_KEEP, tagMap);
  assert(result.size === 10, `all 10 rooms assigned (got ${result.size})`);
  for (const [rid, theme] of result) {
    assert(!!theme.id, `room ${rid} has a theme id`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed!");
}
