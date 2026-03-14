# BSP Dungeon Generator Lab

A small in-browser **TypeScript + React** project for experimenting with BSP-based dungeon generation (inspired by the RogueBasin write-up).

The project focuses on **data-first dungeon generation** with strong debugging tools:
- byte-based grid masks
- GPU-friendly `THREE.DataTexture` outputs
- ASCII and PNG-style visualizations for inspection

This repo is intended as a **generator playground**, not a finished game.

---

## Features

- BSP dungeon generation (rooms + corridors)
- Deterministic generation via seed
- Multiple output layers:
  - **solid** — wall / floor mask
  - **regionId** — room identifiers
  - **distanceToWall** — Manhattan distance field
- Interactive parameter UI
- Pixel-perfect canvas preview
- Export:
  - ASCII map
  - PNG image per layer

---

## Public API

The generator exposes a single entry point for game integration:

```typescript
import { generateDungeon } from "./src/api";

const result = generateDungeon({
  seed: 42,
  level: 1,
  themeId: "medieval_keep",
  difficultyBandId: "medium",
  budgetId: "balanced",
  pacingId: "standard",
});
```

Returns geometry, content placements, theme-resolved spawnables, render
uniforms, and validation diagnostics — all deterministic for a given seed.

See:
- **[API-QUICKSTART.md](API-QUICKSTART.md)** — usage examples, render uniforms, seed curation workflow
- **[RUNTIME-FILE-MANIFEST.md](RUNTIME-FILE-MANIFEST.md)** — files to copy for standalone use

---

## Tech Stack

- **TypeScript** 5.9
- **React** 19
- **Vite** 7
- **Three.js** 0.182 (dev harness rendering only — runtime API has zero external deps)

---

## Running the project

Install dependencies:

```bash
npm install
