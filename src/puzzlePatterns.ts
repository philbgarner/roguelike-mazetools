// src/puzzlePatterns.ts
//
// Milestone 3: generalized puzzle pattern placement.
//
// Pattern (Variant A):
// - Carve a small unreachable “pocket” behind a connector tile.
// - Place a hidden passage fixture (featureType=9) on the connector tile.
// - Place a lever (featureType=6) in reachable space.
// - Wire circuit: LEVER -> HIDDEN(REVEAL), PERSISTENT.
// - Validate: pocket goal unreachable pre-reveal, reachable post-reveal.
//
// NOTE:
// Hidden passage behavior in runtime is driven by meta.secrets[id].revealed.
// Your current fixture already uses featureType=9 on floor tiles, so this
// pattern does the same.
//
// IMPORTANT:
// In your current runtime movement logic, hidden passages only work on tiles
// that are NOT walls in dungeon.masks.solid. So this pattern carves the
// connector tile as FLOOR, but blocks it until revealed via featureType=9 +
// runtime.secrets[secretId].revealed.

import type { BspDungeonOutputs, ContentOutputs, CircuitDef } from "./mazeGen";

type Point = { x: number; y: number };

export type PatternRng = {
  nextFloat(): number;
  nextInt(lo: number, hiInclusive: number): number;
};

export type LeverHiddenPocketPatternOptions = {
  pocketSize?: number; // odd >= 3
  minLeverToConnectorDist?: number; // Manhattan distance
  minConnectorFromEntranceManhattan?: number;
  maxCandidateSites?: number;
};

export function applyLeverRevealsHiddenPocketPattern(args: {
  rng: PatternRng;
  dungeon: BspDungeonOutputs;

  entranceRoomId: number;
  rooms: BspDungeonOutputs["meta"]["rooms"];

  featureType: Uint8Array;
  featureId: Uint8Array;
  featureParam: Uint8Array;

  secrets: ContentOutputs["meta"]["secrets"];
  levers: ContentOutputs["meta"]["levers"];

  // The generator owns circuit finalization via circuitsById.
  // This pattern inserts its circuit here so it naturally ends up in meta.circuits.
  circuitsById: Map<number, CircuitDef>;

  allocId: () => number; // unique id allocator (1..255)
  options?: LeverHiddenPocketPatternOptions;
}): { ok: true } | { ok: false; reason: string } {
  const {
    rng,
    dungeon,
    entranceRoomId,
    rooms,
    featureType: ft,
    featureId: fid,
    featureParam: fparam,
    secrets,
    levers,
    circuitsById,
    allocId,
  } = args;

  const pocketSize = clampOddAtLeast3(args.options?.pocketSize ?? 3);
  const minLeverToConnectorDist = Math.max(
    0,
    args.options?.minLeverToConnectorDist ?? 6,
  );
  const minConnFromEntranceMan = Math.max(
    0,
    args.options?.minConnectorFromEntranceManhattan ?? 8,
  );
  const maxCandidateSites = Math.max(
    20,
    args.options?.maxCandidateSites ?? 200,
  );

  const W = dungeon.width;
  const H = dungeon.height;

  const solid = dungeon.masks.solid;
  const regionId = dungeon.masks.regionId;

  // Determine a starting floodfill point: any floor in entrance room.
  const entranceRoom = rooms[entranceRoomId - 1] ?? rooms[0];
  if (!entranceRoom) return { ok: false, reason: "No rooms available." };

  const start = findAnyFloorInRect(dungeon, entranceRoom);
  if (!start) return { ok: false, reason: "Entrance room has no floor tiles." };

  const reach0 = computeReachable(dungeon, ft, fid, start, new Set());

  // Candidate connector sites:
  // A (reachable floor) -> C (currently wall; will be carved to floor & hidden) -> pocket.
  const candidates: Array<{
    ax: number;
    ay: number;
    cx: number;
    cy: number;
    dir: { dx: number; dy: number };
    score: number;
  }> = [];

  let considered = 0;

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const ai = idxOf(W, x, y);
      if (!reach0[ai]) continue;
      if (solid[ai] === 255) continue;
      if ((ft[ai] | 0) !== 0) continue; // don't stomp features

      for (const d of cardinalDirs()) {
        const cx = x + d.dx;
        const cy = y + d.dy;
        if (!inBounds(W, H, cx, cy)) continue;

        const ci = idxOf(W, cx, cy);

        // must be a wall right now (we’ll carve it into floor)
        if (solid[ci] !== 255) continue;

        // avoid boundary
        if (cx <= 0 || cy <= 0 || cx >= W - 1 || cy >= H - 1) continue;

        // keep away from entrance
        if (manhattan(start, { x: cx, y: cy }) < minConnFromEntranceMan)
          continue;

        const pocketCenter = {
          x: cx + d.dx * ((pocketSize + 1) / 2),
          y: cy + d.dy * ((pocketSize + 1) / 2),
        };

        if (!pocketFits(W, H, pocketCenter, pocketSize)) continue;

        if (
          !canCarvePocketWithoutAccidentalConnection(
            dungeon,
            ft,
            reach0,
            pocketCenter,
            pocketSize,
          )
        ) {
          continue;
        }

        // Score: prefer farther from entrance + more solid mass in pocket square
        const score =
          manhattan(start, { x: cx, y: cy }) +
          pocketSolidnessScore(dungeon, pocketCenter, pocketSize);

        candidates.push({ ax: x, ay: y, cx, cy, dir: d, score });

        considered++;
        if (considered >= maxCandidateSites) break;
      }
      if (considered >= maxCandidateSites) break;
    }
    if (considered >= maxCandidateSites) break;
  }

  if (!candidates.length) {
    return {
      ok: false,
      reason:
        "No valid connector sites found for lever-hidden-pocket pattern (unable to carve isolated pocket).",
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0]!;

  // Carve connector + pocket into geometry (solid mask).
  // NOTE: this makes distanceToWall stale, but your runtime logic will work.
  const pocketCenter = {
    x: chosen.cx + chosen.dir.dx * ((pocketSize + 1) / 2),
    y: chosen.cy + chosen.dir.dy * ((pocketSize + 1) / 2),
  };
  carveConnectorAndPocket(
    dungeon,
    ft,
    chosen.cx,
    chosen.cy,
    pocketCenter,
    pocketSize,
  );

  // Place hidden connector fixture (featureType 9) on carved connector tile.
  const secretId = allocId();
  const ci = idxOf(W, chosen.cx, chosen.cy);
  ft[ci] = 9; // hidden passage
  fid[ci] = secretId;
  fparam[ci] = 0;

  // Register secret into meta.secrets so runtime initializes secrets[secretId].
  const ridAtA = regionId[idxOf(W, chosen.ax, chosen.ay)] | 0;
  const roomIdGuess = ridAtA !== 0 ? ridAtA : entranceRoomId;

  secrets.push({
    id: secretId,
    x: chosen.cx,
    y: chosen.cy,
    roomId: roomIdGuess,
  });

  // Place lever somewhere reachable and not too close to connector.
  const leverSpot = pickLeverSpot(
    rng,
    dungeon,
    ft,
    reach0,
    start,
    { x: chosen.cx, y: chosen.cy },
    minLeverToConnectorDist,
  );
  if (!leverSpot) {
    return { ok: false, reason: "Unable to find lever placement spot." };
  }

  const leverId = allocId();
  const li = idxOf(W, leverSpot.x, leverSpot.y);
  ft[li] = 6; // lever
  fid[li] = leverId;
  fparam[li] = 0;

  const ridAtLever = regionId[li] | 0;
  levers.push({
    id: leverId,
    x: leverSpot.x,
    y: leverSpot.y,
    roomId: ridAtLever !== 0 ? ridAtLever : entranceRoomId,
  });

  // Emit circuit: LEVER -> HIDDEN(REVEAL), PERSISTENT
  const circuitId = allocId();
  const circuit: CircuitDef = {
    id: circuitId,
    logic: { type: "OR" },
    behavior: { mode: "PERSISTENT" },
    triggers: [{ kind: "LEVER", refId: leverId }],
    targets: [{ kind: "HIDDEN", refId: secretId, effect: "REVEAL" }],
  };
  circuitsById.set(circuitId, circuit);

  // Validate:
  // pick goal tile = pocket center (should be unreachable pre, reachable post)
  const goal = pocketCenter;
  const gi = idxOf(W, goal.x, goal.y);

  const pre = computeReachable(dungeon, ft, fid, start, new Set());
  if (pre[gi]) {
    return {
      ok: false,
      reason:
        "Validation failed: pocket is reachable before reveal (accidental connection).",
    };
  }

  const post = computeReachable(dungeon, ft, fid, start, new Set([secretId]));
  if (!post[gi]) {
    return {
      ok: false,
      reason:
        "Validation failed: pocket is NOT reachable after reveal (connector ineffective).",
    };
  }

  return { ok: true };
}

// -----------------------------
// helpers
// -----------------------------

function idxOf(W: number, x: number, y: number) {
  return y * W + x;
}

function inBounds(W: number, H: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function cardinalDirs() {
  return [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
}

function clampOddAtLeast3(v: number) {
  let n = v | 0;
  if (n < 3) n = 3;
  if (n % 2 === 0) n += 1;
  return n;
}

function manhattan(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pocketFits(W: number, H: number, center: Point, size: number) {
  const r = (size - 1) / 2;
  return (
    inBounds(W, H, center.x - r, center.y - r) &&
    inBounds(W, H, center.x + r, center.y + r)
  );
}

function findAnyFloorInRect(
  dungeon: BspDungeonOutputs,
  rect: { x: number; y: number; w: number; h: number },
): Point | null {
  const W = dungeon.width;
  const solid = dungeon.masks.solid;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = idxOf(W, x, y);
      if (solid[i] !== 255) return { x, y };
    }
  }
  return null;
}

/**
 * Generation-time reachability:
 * - walls block (solid==255)
 * - doors block by default (featureType==4)
 * - hidden blocks unless revealed (featureType==9 and id not in revealed set)
 */
function computeReachable(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  featureId: Uint8Array,
  start: Point,
  hiddenRevealedIds: Set<number>,
): Uint8Array {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  const seen = new Uint8Array(W * H);
  const q: Point[] = [];

  const si = idxOf(W, start.x, start.y);
  if (solid[si] === 255) return seen;

  seen[si] = 1;
  q.push(start);

  while (q.length) {
    const p = q.pop()!;
    for (const d of cardinalDirs()) {
      const nx = p.x + d.dx;
      const ny = p.y + d.dy;
      if (!inBounds(W, H, nx, ny)) continue;
      const ni = idxOf(W, nx, ny);
      if (seen[ni]) continue;

      if (solid[ni] === 255) continue;

      const t = featureType[ni] | 0;
      const id = featureId[ni] | 0;

      // doors: treat closed for validation
      if (t === 4 && id !== 0) continue;

      // hidden: blocks until revealed
      if (t === 9 && id !== 0 && !hiddenRevealedIds.has(id)) continue;

      seen[ni] = 1;
      q.push({ x: nx, y: ny });
    }
  }

  return seen;
}

function pocketSolidnessScore(
  dungeon: BspDungeonOutputs,
  center: Point,
  size: number,
) {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;
  const r = (size - 1) / 2;

  let walls = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (!inBounds(W, H, x, y)) continue;
      const i = idxOf(W, x, y);
      if (solid[i] === 255) walls++;
    }
  }
  return walls;
}

function canCarvePocketWithoutAccidentalConnection(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  reach0: Uint8Array,
  pocketCenter: Point,
  pocketSize: number,
) {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;
  const r = (pocketSize - 1) / 2;

  // Pocket tiles must be currently unreachable & feature-free.
  // Additionally, don’t allow adjacency to reachable tiles (conservative).
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = pocketCenter.x + dx;
      const y = pocketCenter.y + dy;
      if (!inBounds(W, H, x, y)) return false;

      const i = idxOf(W, x, y);
      if ((featureType[i] | 0) !== 0) return false;
      if (reach0[i]) return false;

      // If already floor, ensure not adjacent to reachable floors
      if (solid[i] !== 255) {
        for (const d of cardinalDirs()) {
          const ni = idxOf(W, x + d.dx, y + d.dy);
          if (reach0[ni]) return false;
        }
      }
    }
  }

  // Buffer ring: no reachable tiles within 1 of pocket boundary
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const x = pocketCenter.x + dx;
      const y = pocketCenter.y + dy;
      if (!inBounds(W, H, x, y)) continue;
      const i = idxOf(W, x, y);
      if (reach0[i]) return false;
    }
  }

  return true;
}

function carveConnectorAndPocket(
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  cx: number,
  cy: number,
  pocketCenter: Point,
  pocketSize: number,
) {
  const W = dungeon.width;
  const solid = dungeon.masks.solid;

  // connector becomes floor
  solid[idxOf(W, cx, cy)] = 0;

  const r = (pocketSize - 1) / 2;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = pocketCenter.x + dx;
      const y = pocketCenter.y + dy;
      const i = idxOf(W, x, y);
      if ((featureType[i] | 0) !== 0) continue;
      solid[i] = 0;
    }
  }
}

function pickLeverSpot(
  rng: PatternRng,
  dungeon: BspDungeonOutputs,
  featureType: Uint8Array,
  reach0: Uint8Array,
  start: Point,
  connector: Point,
  minDist: number,
): Point | null {
  const W = dungeon.width;
  const H = dungeon.height;
  const solid = dungeon.masks.solid;

  const candidates: Array<{ x: number; y: number; score: number }> = [];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = idxOf(W, x, y);
      if (!reach0[i]) continue;
      if (solid[i] === 255) continue;
      if ((featureType[i] | 0) !== 0) continue;

      const dc = manhattan({ x, y }, connector);
      if (dc < minDist) continue;

      const score = dc + Math.min(20, manhattan({ x, y }, start));
      candidates.push({ x, y, score });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const topN = Math.min(25, candidates.length);
  const pick = candidates[rng.nextInt(0, topN - 1)]!;
  return { x: pick.x, y: pick.y };
}
