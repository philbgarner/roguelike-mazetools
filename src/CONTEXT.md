# Dungeon BSP Lab — Context

## What this repo is
A small in-browser TypeScript + React project that generates a BSP-style dungeon (RogueBasin-inspired) and previews the results.

Primary goal: quickly iterate on dungeon generation logic while having strong debug outputs (ASCII + PNG-like previews + GPU-friendly data textures).

## Current UX
The React UI (App.tsx) provides:
- parameter controls (map size, BSP params, room params, corridor params)
- a canvas preview with layer tabs:
  - `solid` (walls/floor)
  - `regionId` (room IDs)
  - `distanceToWall` (distance field)
- “Download ASCII” and “Download PNG” for debugging/export
- scale slider for pixelated zoom (canvas display size)

Styling is in `styles.css`, with App using classNames (minimal inline style only for CSS variables that drive canvas scaling).

## Generator outputs (mazeGen.ts)
The generator exposes `generateBspDungeon(options)` returning:
- `masks` (Uint8Array, width*height):
  - `solid`: 0=floor, 255=wall
  - `regionId`: 0=not room, 1..255 room id (corridors default to 0)
  - `distanceToWall`: 0 at walls, increases into open space (Manhattan), clamped to 255
- `textures` (THREE.DataTexture, R8 single-channel):
  - `solid`, `regionId`, `distanceToWall`
- `debug`:
  - `ascii`: string map (# = wall, . = floor)
  - `imageData`: ImageData per layer for canvas preview + PNG export

Design choice: keep masks and textures single-channel (R8) for flexibility and easier debugging.

## Coordinate system & conventions
- grid origin: (0,0) = top-left
- x increases right, y increases down
- “wall” is 255, “floor” is 0 (byte-based)
- textures use `THREE.RedFormat` + `THREE.UnsignedByteType`, nearest filtering, clamp wrap, no mipmaps

## Key files
- `src/mazeGen.ts` — dungeon generation + masks/textures + debug helpers
- `src/App.tsx` — “Dungeon Lab” UI and preview wiring
- `src/styles.css` — all layout styling, includes MazeLab class names
- `src/main.tsx` — React entry point (React 18) mounting into `#app`

## Common gotchas (already fixed)
- React entry must mount into `#app` (matches index.html)
- JSX requires `tsconfig.json` to include `"jsx": "react-jsx"`
- React 18 needs `react@latest` + `react-dom@latest` (and types)

## Next ideas (likely future work)
- Add more textures (separate, not packed):
  - corridorId, feature flags, door placement, spawn heatmap
  - distance-to-room-center, distance-to-corridor, or signed distance field
- Let corridors inherit nearest roomId (optional)
- Add “validate connectivity” and “find path between rooms” debug overlay
- Add “render colored preview” (palette by roomId) for easier differentiation

## What to tell ChatGPT if you’re resuming later
“I have a TS+React dungeon BSP lab. The generator is in src/mazeGen.ts returning Uint8 masks + THREE R8 DataTextures + ImageData/ASCII debug. App.tsx is a parameter UI + canvas preview with layer tabs. styles.css holds layout. We’re using bytes (0 floor, 255 wall).”
