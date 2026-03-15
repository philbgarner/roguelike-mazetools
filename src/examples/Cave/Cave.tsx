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
import { useEffect, useMemo, useRef, useState } from "react";
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

type MaskOverlay = "all" | "solid" | "regionId" | "distanceToWall" | "hazards";

// Map each non-zero regionId to a stable hue for coloring
function regionHue(id: number): string {
  // Spread hues by multiplying by a large prime
  const hue = (id * 137) % 360;
  return `hsl(${hue},70%,45%)`;
}

function drawMinimap(
  canvas: HTMLCanvasElement,
  solidData: Uint8Array,
  width: number,
  height: number,
  playerX: number,
  playerZ: number,
  yaw: number,
  overlay: MaskOverlay,
  overlayData: Record<Exclude<MaskOverlay, "all">, Uint8Array>,
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
      const idx = cz * width + cx;
      const solid = solidData[idx] > 0;

      if (overlay === "all") {
        ctx.fillStyle = solid ? "#333" : "#888";
      } else if (overlay === "solid") {
        const v = overlayData.solid[idx];
        const brightness = Math.round((v / 255) * 200 + 28);
        ctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
      } else if (overlay === "regionId") {
        const id = overlayData.regionId[idx];
        ctx.fillStyle = id === 0 ? "#222" : regionHue(id);
      } else if (overlay === "distanceToWall") {
        const v = overlayData.distanceToWall[idx];
        const g = Math.round((v / 255) * 220);
        ctx.fillStyle = solid ? "#222" : `rgb(0,${g},${Math.round(g * 0.6)})`;
      } else if (overlay === "hazards") {
        const v = overlayData.hazards[idx];
        if (v > 0) {
          ctx.fillStyle = `rgb(${Math.round((v / 255) * 255)},40,40)`;
        } else {
          ctx.fillStyle = solid ? "#333" : "#888";
        }
      }

      ctx.fillRect(cx * cellW, cz * cellH, cellW, cellH);
    }
  }

  // Overlay mask tint on top of base solid view (for non-"all", non-"solid" modes)
  if (overlay !== "all" && overlay !== "solid") {
    for (let cz = 0; cz < height; cz++) {
      for (let cx = 0; cx < width; cx++) {
        const idx = cz * width + cx;
        const solid = solidData[idx] > 0;
        // Already drawn the overlay color above; add a faint solid-wall darkening pass
        if (solid && overlay !== "regionId") {
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(cx * cellW, cz * cellH, cellW, cellH);
        }
      }
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

const MASK_OPTIONS: { value: MaskOverlay; label: string }[] = [
  { value: "all", label: "All (default)" },
  { value: "solid", label: "Solid" },
  { value: "regionId", label: "Region ID" },
  { value: "distanceToWall", label: "Distance to Wall" },
  { value: "hazards", label: "Hazards" },
];

export default function Cave() {
  const [maskOverlay, setMaskOverlay] = useState<MaskOverlay>("all");
  const [ceilingHeight, setCeilingHeight] = useState(1.5);
  const [debugEdges, setDebugEdges] = useState(false);

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

  // All mask data arrays keyed by name
  const overlayData = useMemo(
    () => ({
      solid: dungeon.textures.solid.image.data as Uint8Array,
      regionId: dungeon.textures.regionId.image.data as Uint8Array,
      distanceToWall: dungeon.textures.distanceToWall.image.data as Uint8Array,
      hazards: dungeon.textures.hazards.image.data as Uint8Array,
    }),
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
      maskOverlay,
      overlayData,
    );
  }, [solidData, camera, maskOverlay, overlayData]);

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
            ceilingHeight={ceilingHeight}
            wallTile={TILE_WALL}
            renderRadius={28}
            fov={60}
            fogNear={4}
            fogFar={28}
            tileSize={3}
            debugEdges={debugEdges}
            style={{ width: "100%", height: "100%" }}
          />
        </div>

        {/* Minimap */}
        <div className={styles.miniMapView}>
          <label className={styles.minimapLabel}>
            Ceiling height: {ceilingHeight.toFixed(1)}
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={ceilingHeight}
              onChange={(e) => setCeilingHeight(parseFloat(e.target.value))}
              className={styles.minimapSlider}
            />
          </label>
          <label className={styles.minimapLabel}>
            <input
              type="checkbox"
              checked={debugEdges}
              onChange={(e) => setDebugEdges(e.target.checked)}
            />
            {" "}Debug edges
          </label>
          <select
            className={styles.minimapSelect}
            value={maskOverlay}
            onChange={(e) => setMaskOverlay(e.target.value as MaskOverlay)}
          >
            {MASK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
