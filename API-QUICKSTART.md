# API Quickstart

Minimal guide to generating dungeons with the mazegen public API.

---

## 1. Import

All public symbols are exported from `src/api/index.ts`:

```typescript
import {
  generateDungeon,
  getAllThemeIds,
  getAllBandIds,
  getAllBudgetIds,
  getAllPacingIds,
} from "./src/api";
```

Three default themes are auto-registered on import:
- `"medieval_keep"` — fantasy dungeon
- `"babylon_ziggurat"` — ancient temple
- `"surgical_suite"` — clinical horror

Three sets of authorial presets are also auto-registered:
- Difficulty bands: `"easy"`, `"medium"`, `"hard"`
- Content budgets: `"minimal"`, `"balanced"`, `"rich"`
- Pacing targets: `"relaxed"`, `"standard"`, `"intense"`

---

## 2. Generate a Dungeon

### Minimal call

```typescript
const result = generateDungeon({
  seed: 42,
  level: 1,
});
```

This produces geometry + content with default parameters. Since no `themeId`
is provided, `result.resolved` and `result.theme` will be `null`.

### With theme resolution

```typescript
const result = generateDungeon({
  seed: 42,
  level: 1,
  themeId: "medieval_keep",
});
```

Now `result.resolved` contains theme-picked spawnables (monsters, loot, props,
bosses) and `result.theme` contains render uniforms and per-room theme data.

### With authorial controls (preset IDs)

```typescript
const result = generateDungeon({
  seed: 42,
  level: 1,
  themeId: "medieval_keep",
  difficultyBandId: "medium",
  budgetId: "balanced",
  pacingId: "standard",
});
```

### With inline authorial controls

```typescript
const result = generateDungeon({
  seed: 42,
  level: 1,
  themeId: "babylon_ziggurat",
  difficultyBand: {
    totalRooms: { min: 6, max: 14 },
    criticalPathLength: { min: 3, max: 10 },
    maxGateDepth: { max: 3 },
  },
  contentBudget: {
    doors: { min: 1, max: 6 },
    monsters: { min: 1, max: 8 },
    chests: { min: 1, max: 5 },
  },
  pacingTargets: {
    firstGateDistance: { min: 1, max: 5 },
    rewardAfterGate: { enabled: true, maxDistance: 3 },
    rampProfile: { target: "linear" },
  },
});
```

Inline values take precedence over preset IDs. Omitting a control (or passing
`null`) skips that validation — the seed is never rejected, but
`result.validation` will report pass/fail so you can filter downstream.

---

## 3. Read the Result

```typescript
const {
  bsp,          // geometry: solid mask, regionId, distanceToWall, room list
  content,      // abstract placements: monsters, chests, doors, levers, hazards, etc.
  resolved,     // theme-resolved spawnables (or null if no themeId)
  theme,        // render uniforms + room tags/themes (or null if no themeId)
  validation,   // { budget, difficulty, pacing, inclusion }
  diagnostics,  // { patterns, circuitRoles }
  meta,         // { seedUsed }
} = result;
```

### Geometry (bsp)

- `bsp.solid` — `Uint8Array` grid: `1` = wall, `0` = floor
- `bsp.regionId` — `Uint8Array` grid: room ID per cell (0 = corridor/wall)
- `bsp.distanceToWall` — `Uint8Array` grid: Manhattan distance to nearest wall
- `bsp.rooms` — room metadata (bounds, center, connections)
- `bsp.meta.seedUsed` — the numeric seed actually used

### Content

`content.meta` contains arrays of abstract placements:
- `monsters` — `{ x, y, roomId, danger }`
- `chests` — `{ x, y, roomId, tier }`
- `doors` — `{ x, y, roomId, kind, depth }`
- `levers` — `{ x, y, roomId }`
- `secrets` — `{ x, y, roomId, kind }`
- `hazards` — `{ x, y, roomId }`
- `plates`, `blocks`, `keys` — puzzle mechanic placements

### Resolved Spawns

When a `themeId` is provided, `resolved` maps each abstract placement to a
concrete theme identifier:

```typescript
if (resolved) {
  for (const m of resolved.monsters) {
    // m.entityId  — "monster:3:0" (stable across runs)
    // m.spawnId   — "skeleton_warrior" (from theme spawn table)
    // m.x, m.y    — grid position
    // m.roomId    — room the monster is in
    // m.danger    — difficulty rating
  }

  for (const l of resolved.loot) {
    // l.spawnId — "gold_chalice", "rusted_sword", etc.
  }

  for (const b of resolved.bosses) {
    // b.spawnId — "lich_king", etc.
  }
}
```

Entity IDs follow the format `{kind}:{roomId}:{indexInRoom}` and are stable
for any given `(seed, level, themeId)` combination.

---

## 4. Apply Render Uniforms

`result.theme.uniforms` contains shader-ready color values as `[r, g, b, a]`
tuples (values in 0-1 range, strength-multiplied):

```typescript
if (theme) {
  const u = theme.uniforms;
  // u.uFloorColor   — [r, g, b, a]
  // u.uWallColor    — [r, g, b, a]
  // u.uPlayerColor  — [r, g, b, a]
  // u.uItemColor    — [r, g, b, a]
  // u.uHazardColor  — [r, g, b, a]
  // u.uEnemyColor   — [r, g, b, a]
}
```

### Three.js example

```typescript
import * as THREE from "three";

if (theme) {
  const u = theme.uniforms;
  material.uniforms.uFloorColor.value = new THREE.Vector4(...u.uFloorColor);
  material.uniforms.uWallColor.value = new THREE.Vector4(...u.uWallColor);
  material.uniforms.uPlayerColor.value = new THREE.Vector4(...u.uPlayerColor);
  material.uniforms.uItemColor.value = new THREE.Vector4(...u.uItemColor);
  material.uniforms.uHazardColor.value = new THREE.Vector4(...u.uHazardColor);
  material.uniforms.uEnemyColor.value = new THREE.Vector4(...u.uEnemyColor);
}
```

### Custom engine

The uniform values are plain number tuples — no Three.js dependency required.
Feed them directly to your shader as `vec4` uniforms.

### Room themes

Per-room theme data is available for rendering variation:

```typescript
if (theme) {
  for (const [roomId, roomTheme] of theme.roomThemesByRoomId) {
    // roomTheme.id    — "armory", "library", "throne_room", etc.
    // roomTheme.label — human-readable label
  }

  for (const [roomId, tags] of theme.roomTagsByRoomId) {
    // tags — Set<RoomTag>: "entrance", "boss", "has_monsters", "large", etc.
  }
}
```

---

## 5. Seed Curation Workflow

The generation pipeline is deterministic and best-effort: it never throws on
invalid seeds. Instead, use the validation output to filter seeds that meet
your quality bar.

### Step 1: Batch generate

```typescript
const BATCH_SIZE = 300;
const results = [];

for (let i = 0; i < BATCH_SIZE; i++) {
  const result = generateDungeon({
    seed: `batch-${i}`,
    level: 1,
    themeId: "medieval_keep",
    difficultyBandId: "medium",
    budgetId: "balanced",
    pacingId: "standard",
  });
  results.push({ seed: `batch-${i}`, result });
}
```

### Step 2: Classify seeds

```typescript
const classified = results.map(({ seed, result }) => {
  const { budget, difficulty, pacing, inclusion } = result.validation;
  const allPass =
    (budget === null || budget.pass) &&
    difficulty.pass &&
    pacing.pass &&
    inclusion.pass;

  return {
    seed,
    pass: allPass,
    budgetOk: budget === null || budget.pass,
    difficultyOk: difficulty.pass,
    pacingOk: pacing.pass,
    inclusionOk: inclusion.pass,
    metrics: difficulty.metrics,  // totalRooms, criticalPathLength, etc.
  };
});

const goodSeeds = classified.filter((s) => s.pass);
console.log(`${goodSeeds.length}/${BATCH_SIZE} seeds passed all checks`);
```

### Step 3: Inspect failures

```typescript
for (const entry of classified.filter((s) => !s.pass)) {
  const v = results.find((r) => r.seed === entry.seed)!.result.validation;

  if (!entry.budgetOk && v.budget) {
    console.log(`${entry.seed}: budget violations`, v.budget.violations);
    // e.g. [{ category: "monsters", actual: 12, min: undefined, max: 8 }]
  }

  if (!entry.difficultyOk) {
    console.log(`${entry.seed}: difficulty violations`, v.difficulty.violations);
  }

  if (!entry.pacingOk) {
    console.log(`${entry.seed}: pacing violations`, v.pacing.violations);
  }

  if (!entry.inclusionOk) {
    console.log(`${entry.seed}: inclusion violations`, v.inclusion.violations);
  }
}
```

### Step 4: Check pattern diagnostics

```typescript
for (const { seed, result } of results) {
  for (const p of result.diagnostics.patterns) {
    if (!p.ok) {
      console.log(`${seed}: pattern "${p.name}" failed — ${p.detail ?? "no detail"}`);
    }
  }
}
```

### Step 5: Iterate constraints

If too few seeds pass, loosen your constraints. If too many weak seeds pass,
tighten them. Adjust preset values or provide inline overrides and re-run the
batch.

---

## 6. Register Custom Themes & Presets

### Custom theme

```typescript
import { registerThemes } from "./src/api";
import type { DungeonTheme } from "./src/api";

const myTheme: DungeonTheme = {
  id: "haunted_manor",
  label: "Haunted Manor",
  render: {
    colors: {
      floor: "#1A1A2E",
      wallEdge: "#533483",
      player: "#00D2FF",
      interactable: "#FFD700",
      hazard: "#FF4444",
      enemy: "#FF00FF",
    },
    strength: {
      floor: 0.6, wallEdge: 1.0, player: 1.1,
      interactable: 1.0, hazard: 1.2, enemy: 1.1,
    },
  },
  roomThemes: [
    { id: "foyer", label: "Foyer" },
    { id: "crypt", label: "Crypt" },
    { id: "ballroom", label: "Ballroom" },
  ],
  spawnTables: {
    monsters: [
      { value: "ghost", weight: 3 },
      { value: "zombie", weight: 2 },
      { value: "vampire_bat", weight: 1 },
    ],
    loot: [
      { value: "cursed_amulet", weight: 2 },
      { value: "silver_mirror", weight: 1 },
    ],
    props: [
      { value: "cobweb_cluster", weight: 3 },
      { value: "dusty_portrait", weight: 2 },
    ],
    npcs: [],
    bosses: [
      { value: "vampire_lord", weight: 1 },
    ],
  },
};

registerThemes([myTheme]);
```

### Custom authorial presets

```typescript
import { registerBands, registerBudgets, registerPacingPresets } from "./src/api";

registerBands([{
  id: "tutorial",
  label: "Tutorial",
  value: {
    totalRooms: { min: 3, max: 5 },
    criticalPathLength: { min: 2, max: 3 },
    maxGateDepth: { max: 1 },
  },
}]);

registerBudgets([{
  id: "sparse",
  label: "Sparse",
  value: {
    doors: { max: 2 },
    monsters: { max: 2 },
    chests: { max: 1 },
  },
}]);

// Then use by ID:
const result = generateDungeon({
  seed: 99,
  level: 1,
  themeId: "haunted_manor",
  difficultyBandId: "tutorial",
  budgetId: "sparse",
});
```

---

## 7. Quick Reference

### GenerateDungeonRequest fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `seed` | `number \| string` | *required* | Deterministic seed |
| `level` | `number` | *required* | Dungeon depth (used in spawn resolution) |
| `themeId` | `string?` | `undefined` | Theme ID; enables resolved spawns + uniforms |
| `width` | `number?` | `96` | Grid width in cells |
| `height` | `number?` | `96` | Grid height in cells |
| `bsp` | `Partial<BspDungeonOptions>?` | defaults | BSP tree overrides |
| `pattern` | `Partial<PatternConfig>?` | defaults | Pattern placement overrides |
| `contentStrategy` | `"atomic" \| "patterns"` | `"patterns"` | Skip puzzle patterns with `"atomic"` |
| `difficultyBandId` | `string?` | — | Preset ID (e.g. `"medium"`) |
| `difficultyBand` | `DifficultyBand?` | — | Inline override (takes precedence over ID) |
| `budgetId` | `string?` | — | Preset ID (e.g. `"balanced"`) |
| `contentBudget` | `ContentBudget?` | — | Inline override |
| `pacingId` | `string?` | — | Preset ID (e.g. `"standard"`) |
| `pacingTargets` | `PacingTargets?` | — | Inline override |
| `inclusionRules` | `InclusionRules?` | — | Pattern exclusion/inclusion rules |

### Default themes

| ID | Label | Flavor |
|----|-------|--------|
| `"medieval_keep"` | Medieval Keep | Fantasy dungeon (armory, library, throne room) |
| `"babylon_ziggurat"` | Babylon Ziggurat | Ancient temple (offering hall, scribe chamber) |
| `"surgical_suite"` | Surgical Suite | Clinical horror (operating room, storage) |

### Default presets

| Registry | IDs |
|----------|-----|
| Difficulty bands | `"easy"`, `"medium"`, `"hard"` |
| Content budgets | `"minimal"`, `"balanced"`, `"rich"` |
| Pacing targets | `"relaxed"`, `"standard"`, `"intense"` |
