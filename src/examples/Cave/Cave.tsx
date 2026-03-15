/**
 * Cave
 *
 * Eye-of-the-Beholder-style first-person dungeon viewer.
 *
 * Layout
 * ──────
 *   ┌──────────────────────────────┐
 *   │       uiHeaderBar            │  40 px
 *   ├─────────────────────┬────────┤
 *   │   perspectiveView   │miniMap │  flex-grow
 *   ├─────────────────────┴────────┤
 *   │         statusPanel          │  64 px
 *   └──────────────────────────────┘
 *
 * The perspective view is a react-three-fiber Canvas rendered with instanced
 * quads (floors/ceilings/walls) textured from a tile atlas.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { generateCellularDungeon } from "../../cellular";
import { buildTileAtlas } from "../../rendering/tileAtlas";
import { PerspectiveDungeonView } from "../../rendering/PerspectiveDungeonView";
import { useDungeonCamera } from "../../rendering/useDungeonCamera";
import styles from "./Cave.module.css";

// ---------------------------------------------------------------------------
// Tile IDs
// ---------------------------------------------------------------------------
const TILE_FLOOR = 0;
const TILE_WALL = 1;
const TILE_CEILING = 2;

// ---------------------------------------------------------------------------
// Procedural placeholder tilesheet
//
// 3×1 tiles, each 32×32 px → 96×32 sheet.
// Tile 0 = floor   (dark warm stone)
// Tile 1 = wall    (rough grey rock)
// Tile 2 = ceiling (pale cool stone)
// ---------------------------------------------------------------------------
const TILE_PX = 32;
const SHEET_W = TILE_PX * 3;
const SHEET_H = TILE_PX;

function buildPlaceholderTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = SHEET_W;
  canvas.height = SHEET_H;
  const ctx = canvas.getContext("2d")!;

  type TileDef = { base: string; noise: string; lines?: string };
  const tiles: TileDef[] = [
    { base: "#3d3028", noise: "#2a1e14", lines: "#251810" }, // floor
    { base: "#4a4845", noise: "#333130", lines: "#222020" }, // wall
    { base: "#5a5860", noise: "#3e3d45", lines: "#2c2c35" }, // ceiling
  ];

  const rng = mulberry(0xdeadbeef);

  tiles.forEach(({ base, noise, lines }, i) => {
    const ox = i * TILE_PX;
    // Base fill
    ctx.fillStyle = base;
    ctx.fillRect(ox, 0, TILE_PX, TILE_PX);

    // Random speckle noise
    for (let n = 0; n < 80; n++) {
      const px = ox + Math.floor(rng() * TILE_PX);
      const py = Math.floor(rng() * TILE_PX);
      const sz = 1 + Math.floor(rng() * 3);
      ctx.fillStyle = noise;
      ctx.fillRect(px, py, sz, sz);
    }

    // Stone-crack lines
    if (lines) {
      ctx.strokeStyle = lines;
      ctx.lineWidth = 1;
      for (let l = 0; l < 3; l++) {
        ctx.beginPath();
        ctx.moveTo(ox + rng() * TILE_PX, rng() * TILE_PX);
        ctx.lineTo(ox + rng() * TILE_PX, rng() * TILE_PX);
        ctx.stroke();
      }
    }
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Minimap renderer
// ---------------------------------------------------------------------------

function drawMinimap(
  canvas: HTMLCanvasElement,
  solidData: Uint8Array,
  width: number,
  height: number,
  playerX: number,
  playerZ: number,
  yaw: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const cellW = cw / width;
  const cellH = ch / height;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, cw, ch);

  for (let cz = 0; cz < height; cz++) {
    for (let cx = 0; cx < width; cx++) {
      const solid = solidData[cz * width + cx] > 0;
      ctx.fillStyle = solid ? "#333" : "#888";
      ctx.fillRect(cx * cellW, cz * cellH, cellW, cellH);
    }
  }

  // Player dot
  const px = playerX * cellW;
  const pz = playerZ * cellH;
  const arrowLen = Math.max(cellW * 2, 6);

  ctx.fillStyle = "#f80";
  ctx.beginPath();
  ctx.arc(px, pz, Math.max(cellW * 0.6, 3), 0, Math.PI * 2);
  ctx.fill();

  // Direction arrow
  ctx.strokeStyle = "#ff0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(px - Math.sin(yaw) * arrowLen, pz - Math.cos(yaw) * arrowLen);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Cardinal direction label
// ---------------------------------------------------------------------------

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function cardinalDir(yaw: number): string {
  const norm = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx = Math.round((norm / (Math.PI * 2)) * 8) % 8;
  return DIRS[idx];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DUNGEON_SEED = 42;
const DUNGEON_W = 60;
const DUNGEON_H = 60;

export default function Cave() {
  // Generate dungeon once
  const dungeon = useMemo(
    () =>
      generateCellularDungeon({
        width: DUNGEON_W,
        height: DUNGEON_H,
        seed: DUNGEON_SEED,
      }),
    [],
  );

  // Extract raw solid byte array from DataTexture (RedFormat → 1 byte/pixel)
  const solidData = useMemo(
    () => dungeon.textures.solid.image.data as Uint8Array,
    [dungeon],
  );

  // Derive player spawn from start room centre
  const { spawnX, spawnZ } = useMemo(
    () => ({
      spawnX: dungeon.startPos.x + 0.5,
      spawnZ: dungeon.startPos.y + 0.5,
    }),
    [dungeon],
  );

  // Tile atlas (3 tiles wide, 1 tile tall)
  const atlas = useMemo(
    () => buildTileAtlas(SHEET_W, SHEET_H, TILE_PX, TILE_PX),
    [],
  );
  const texture = useMemo(() => buildPlaceholderTexture(), []);

  // Camera
  const { camera, containerRef } = useDungeonCamera(
    solidData,
    DUNGEON_W,
    DUNGEON_H,
    spawnX,
    spawnZ,
  );

  // Minimap
  const minimapRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!minimapRef.current) return;
    drawMinimap(
      minimapRef.current,
      solidData,
      DUNGEON_W,
      DUNGEON_H,
      camera.x,
      camera.z,
      camera.yaw,
    );
  }, [solidData, camera]);

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.uiHeaderBar}>
        <span className={styles.title}>CAVE</span>
        <span className={styles.seed}>seed: {DUNGEON_SEED}</span>
      </div>

      {/* ── Main area ── */}
      <div className={styles.mainArea}>
        {/* Perspective 3-D view */}
        <div ref={containerRef} className={styles.perspectiveView} tabIndex={0}>
          <PerspectiveDungeonView
            solidData={solidData}
            width={DUNGEON_W}
            height={DUNGEON_H}
            cameraX={camera.x}
            cameraZ={camera.z}
            yaw={camera.yaw}
            atlas={atlas}
            texture={texture}
            floorTile={TILE_FLOOR}
            ceilingTile={TILE_CEILING}
            wallTile={TILE_WALL}
            renderRadius={18}
            fogNear={1}
            fogFar={4}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* Minimap */}
        <div className={styles.miniMapView}>
          <canvas
            ref={minimapRef}
            width={200}
            height={200}
            className={styles.minimapCanvas}
          />
        </div>
      </div>

      {/* ── Status panel ── */}
      <div className={styles.statusPanel}>
        <span>
          ({camera.x.toFixed(1)}, {camera.z.toFixed(1)})&nbsp;&nbsp; Facing:{" "}
          {cardinalDir(camera.yaw)}
        </span>
        <span className={styles.controls}>
          WASD / Arrows — move &nbsp;|&nbsp; Q/E / ←/→ — turn &nbsp;|&nbsp; drag
          — look
        </span>
      </div>
    </div>
  );
}
