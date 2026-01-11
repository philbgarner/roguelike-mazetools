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

## Tech Stack

- **TypeScript**
- **React 18**
- **Vite**
- **Three.js** (for `DataTexture` outputs only — no 3D scene)

---

## Running the project

Install dependencies:

```bash
npm install
