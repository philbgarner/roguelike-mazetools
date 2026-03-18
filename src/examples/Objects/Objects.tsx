/**
 * EotB — Eye of the Beholder style dungeon viewer.
 *
 * Movement is grid-locked:
 *   W / ArrowUp    — step forward one cell (lerp animated)
 *   S / ArrowDown  — step backward one cell (lerp animated)
 *   A              — turn left 90° (lerp animated)
 *   D              — turn right 90° (lerp animated)
 *
 * Dungeon generated via BSP (rectangular rooms + corridors).
 *
 * Layout
 * ──────
 *   ┌──────────────────────────────┐
 *   │       uiHeaderBar            │  40 px
 *   ├─────────────────────┬────────┤
 *   │   perspectiveView   │miniMap │  flex-grow
 *   ├─────────────────────┴────────┤
 *   │         statusPanel          │  56 px
 *   └──────────────────────────────┘
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { generateBspDungeon } from "../../bsp";
import { buildTileAtlas } from "../../rendering/tileAtlas";
import {
  PerspectiveDungeonView,
  type ObjectRegistry,
} from "../../rendering/PerspectiveDungeonView";
import {
  generateContent,
  type ContentOutputs,
  type ObjectPlacement,
} from "../../content";
import styles from "./Objects.module.css";

// ---------------------------------------------------------------------------
// Extended content outputs — developers can add more typed fields here.
// ---------------------------------------------------------------------------
export interface ObjectsContentOutputs extends ContentOutputs {
  // extensible: add typed fields as needed
}

// ---------------------------------------------------------------------------
// Tile atlas — padded sheet: tiles are 16×16 px, first tile at (16,16),
// step = 24px (16px tile + 8px gap).
// We repack the 3 needed tiles into a clean 3×1 atlas at load time.
// ---------------------------------------------------------------------------
const TILE_PX = 16;
const TILE_STEP = 24; // 16 + 8px gap
const TILE_OFF = 16; // first tile origin

// pixel coords of each tile's top-left in the padded sheet
const SRC_FLOOR = { x: 136, y: 328 };
const SRC_CEILING = { x: 136, y: 400 };
const SRC_WALL = { x: 208, y: 304 };

// tile IDs in the repacked 3×1 atlas
const TILE_FLOOR = 0;
const TILE_CEILING = 1;
const TILE_WALL = 2;

// Sanity-check: verify coords align to the padded grid
function assertAligned(label: string, x: number, y: number) {
  if ((x - TILE_OFF) % TILE_STEP !== 0 || (y - TILE_OFF) % TILE_STEP !== 0) {
    console.warn(
      `Objects: ${label} (${x},${y}) not aligned to padded tile grid`,
    );
  }
}
assertAligned("floor", SRC_FLOOR.x, SRC_FLOOR.y);
assertAligned("ceiling", SRC_CEILING.x, SRC_CEILING.y);
assertAligned("wall", SRC_WALL.x, SRC_WALL.y);

/**
 * Load the padded tileset and repack the 3 needed tiles into a clean
 * 48×16 canvas texture (3 tiles side by side).
 */
function loadRepackedAtlasTexture(
  sources: Array<{ x: number; y: number }>,
): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TILE_PX * sources.length;
      canvas.height = TILE_PX;
      const ctx = canvas.getContext("2d")!;
      sources.forEach(({ x, y }, i) => {
        ctx.drawImage(
          img,
          x,
          y,
          TILE_PX,
          TILE_PX,
          i * TILE_PX,
          0,
          TILE_PX,
          TILE_PX,
        );
      });
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      resolve(tex);
    };
    img.onerror = reject;
    img.src = "/examples/eotb/tileset.png";
  });
}

// ---------------------------------------------------------------------------
// Minimap renderer
// ---------------------------------------------------------------------------

type MaskOverlay = "all" | "solid" | "regionId" | "distanceToWall" | "hazards";

function regionHue(id: number): string {
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
  objectPositions?: Array<{ x: number; z: number }>,
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

  if (overlay !== "all" && overlay !== "solid") {
    for (let cz = 0; cz < height; cz++) {
      for (let cx = 0; cx < width; cx++) {
        const idx = cz * width + cx;
        const solid = solidData[idx] > 0;
        if (solid && overlay !== "regionId") {
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fillRect(cx * cellW, cz * cellH, cellW, cellH);
        }
      }
    }
  }

  const px = playerX * cellW;
  const pz = playerZ * cellH;
  const arrowLen = Math.max(cellW * 2, 6);

  ctx.fillStyle = "#f80";
  ctx.beginPath();
  ctx.arc(px, pz, Math.max(cellW * 0.6, 3), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ff0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(px - Math.sin(yaw) * arrowLen, pz - Math.cos(yaw) * arrowLen);
  ctx.stroke();

  // Yellow dots for object placements
  if (objectPositions) {
    ctx.fillStyle = "#ff0";
    for (const { x, z } of objectPositions) {
      const ox = (x + 0.5) * cellW;
      const oz = (z + 0.5) * cellH;
      ctx.beginPath();
      ctx.arc(ox, oz, Math.max(cellW * 0.5, 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
// EotB camera hook — grid-locked movement with lerp animation
// ---------------------------------------------------------------------------

type CameraState = { x: number; z: number; yaw: number };

const LERP_DURATION_MS = 150; // milliseconds per move/turn

function useObjectsCamera(
  solidData: Uint8Array | null,
  width: number,
  height: number,
  startX: number,
  startZ: number,
): {
  camera: CameraState;
  containerRef: React.RefObject<HTMLDivElement>;
} {
  // Logical (target) state — always grid-aligned
  const logicalRef = useRef<CameraState>({ x: startX, z: startZ, yaw: 0 });

  // Animation state
  const animRef = useRef({
    fromX: startX,
    fromZ: startZ,
    fromYaw: 0,
    toX: startX,
    toZ: startZ,
    toYaw: 0,
    startTime: 0,
    animating: false,
  });

  const [camera, setCamera] = useState<CameraState>({
    x: startX,
    z: startZ,
    yaw: 0,
  });

  const solidRef = useRef(solidData);
  useEffect(() => {
    solidRef.current = solidData;
  }, [solidData]);

  const containerRef = useRef<HTMLDivElement>(null!);

  // Reset when spawn changes
  useEffect(() => {
    const state = { x: startX, z: startZ, yaw: 0 };
    logicalRef.current = state;
    animRef.current = {
      fromX: startX,
      fromZ: startZ,
      fromYaw: 0,
      toX: startX,
      toZ: startZ,
      toYaw: 0,
      startTime: 0,
      animating: false,
    };
    setCamera(state);
  }, [startX, startZ]);

  // Keyboard input — only accepts input when not animating
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (animRef.current.animating) return;

      const { x, z, yaw } = logicalRef.current;
      const solid = solidRef.current;

      // Forward unit vector — yaw is always a multiple of π/2 so sin/cos ≈ 0 or ±1
      const fdx = Math.round(-Math.sin(yaw));
      const fdz = Math.round(-Math.cos(yaw));

      const gx = Math.floor(x);
      const gz = Math.floor(z);

      function walkable(cx: number, cz: number): boolean {
        if (!solid) return false;
        if (cx < 0 || cz < 0 || cx >= width || cz >= height) return false;
        return solid[cz * width + cx] === 0;
      }

      function beginAnim(toX: number, toZ: number, toYaw: number) {
        animRef.current = {
          fromX: x,
          fromZ: z,
          fromYaw: yaw,
          toX,
          toZ,
          toYaw,
          startTime: performance.now(),
          animating: true,
        };
        logicalRef.current = { x: toX, z: toZ, yaw: toYaw };
      }

      if (e.code === "KeyW" || e.code === "ArrowUp") {
        e.preventDefault();
        const ngx = gx + fdx;
        const ngz = gz + fdz;
        if (walkable(ngx, ngz)) beginAnim(ngx + 0.5, ngz + 0.5, yaw);
      } else if (e.code === "KeyS" || e.code === "ArrowDown") {
        e.preventDefault();
        const ngx = gx - fdx;
        const ngz = gz - fdz;
        if (walkable(ngx, ngz)) beginAnim(ngx + 0.5, ngz + 0.5, yaw);
      } else if (e.code === "KeyA") {
        e.preventDefault();
        beginAnim(x, z, yaw + Math.PI / 2);
      } else if (e.code === "KeyD") {
        e.preventDefault();
        beginAnim(x, z, yaw - Math.PI / 2);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [width, height]);

  // Animation loop
  useEffect(() => {
    let rafId: number;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const anim = animRef.current;
      if (!anim.animating) return;

      const raw = (now - anim.startTime) / LERP_DURATION_MS;
      const t = Math.min(raw, 1);
      // Smoothstep easing
      const s = t * t * (3 - 2 * t);

      const x = anim.fromX + (anim.toX - anim.fromX) * s;
      const z = anim.fromZ + (anim.toZ - anim.fromZ) * s;
      const yaw = anim.fromYaw + (anim.toYaw - anim.fromYaw) * s;

      setCamera({ x, z, yaw });

      if (t >= 1) {
        animRef.current.animating = false;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return { camera, containerRef };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DUNGEON_SEED = 42;
const DUNGEON_W = 80;
const DUNGEON_H = 60;

const MASK_OPTIONS: { value: MaskOverlay; label: string }[] = [
  { value: "all", label: "All (default)" },
  { value: "solid", label: "Solid" },
  { value: "regionId", label: "Region ID" },
  { value: "distanceToWall", label: "Distance to Wall" },
  { value: "hazards", label: "Hazards" },
];

export default function Objects() {
  const [maskOverlay, setMaskOverlay] = useState<MaskOverlay>("all");
  const [ceilingHeight, setCeilingHeight] = useState(3);
  const [debugEdges, setDebugEdges] = useState(false);

  const dungeon = useMemo(
    () =>
      generateBspDungeon({
        width: DUNGEON_W,
        height: DUNGEON_H,
        seed: DUNGEON_SEED,
      }),
    [],
  );

  const solidData = useMemo(
    () => dungeon.textures.solid.image.data as Uint8Array,
    [dungeon],
  );

  const overlayData = useMemo(
    () => ({
      solid: dungeon.textures.solid.image.data as Uint8Array,
      regionId: dungeon.textures.regionId.image.data as Uint8Array,
      distanceToWall: dungeon.textures.distanceToWall.image.data as Uint8Array,
      hazards: dungeon.textures.hazards.image.data as Uint8Array,
    }),
    [dungeon],
  );

  // Spawn at centre of start room
  const { spawnX, spawnZ } = useMemo(() => {
    const room = dungeon.rooms.get(dungeon.startRoomId);
    if (!room) return { spawnX: 1.5, spawnZ: 1.5 };
    return {
      spawnX: room.rect.x + Math.floor(room.rect.w / 2) + 0.5,
      spawnZ: room.rect.y + Math.floor(room.rect.h / 2) + 0.5,
    };
  }, [dungeon]);

  // Repacked atlas: 3 tiles side-by-side, each TILE_PX wide
  const atlas = useMemo(
    () => buildTileAtlas(TILE_PX * 3, TILE_PX, TILE_PX, TILE_PX),
    [],
  );
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    loadRepackedAtlasTexture([SRC_FLOOR, SRC_CEILING, SRC_WALL]).then(
      setTexture,
    );
  }, []);

  // ---------------------------------------------------------------------------
  // FBX chest model loading
  // ---------------------------------------------------------------------------
  const [chestProto, setChestProto] = useState<THREE.Group | null>(null);
  useEffect(() => {
    const CHEST_SCALE = 0.015;
    const loader = new FBXLoader();
    loader.load(
      "/examples/objects/chest-1.fbx",
      (fbx) => {
        // Custom shader material matching the wall torchlight effect.
        const chestMat = new THREE.ShaderMaterial({
          vertexShader: /* glsl */ `
            varying vec3 vNormal;
            varying float vFogDist;
            varying vec2 vWorldPos;
            void main() {
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldPos = worldPos.xz;
              vNormal = normalize(normalMatrix * normal);
              vec4 eyePos = viewMatrix * worldPos;
              vFogDist = length(eyePos.xyz);
              gl_Position = projectionMatrix * eyePos;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform vec3  uFogColor;
            uniform float uFogNear;
            uniform float uFogFar;
            uniform float uTime;
            uniform vec3  uBaseColor;
            varying vec3  vNormal;
            varying float vFogDist;
            varying vec2  vWorldPos;

            float hash(vec2 p) {
              return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            void main() {
              // Diffuse shading from a warm overhead-ish light direction.
              vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
              float diffuse = clamp(dot(vNormal, lightDir), 0.0, 1.0);
              float shade = 0.65 + 0.35 * diffuse;

              // Candlelight flicker — same co-prime sines as the wall shader.
              float raw = sin(uTime * 7.0)  * 0.45
                        + sin(uTime * 13.7) * 0.35
                        + sin(uTime * 3.1)  * 0.20;
              float flicker = (floor(raw * 1.5 + 0.5)) / 6.0;

              float dist = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
              float flickeredDist = clamp(dist + flicker * 0.03, 0.0, 1.0);
              float curved = pow(flickeredDist, 0.75);
              float band = floor(curved * 5.0);

              // Spatial turbulence — snaps like the wall tiles.
              float timeSlot = floor(uTime * 1.5);
              vec2 cell = floor(vWorldPos * 0.5);
              float spatialNoise = hash(cell + vec2(timeSlot * 7.3, timeSlot * 3.1));
              float turb = (floor(spatialNoise * 3.0) / 3.0) * 0.18;

              float brightness;
              vec3  tint;
              if (band < 1.0) {
                brightness = 1.00 - turb; tint = vec3(1.00, 0.90, 0.68);
              } else if (band < 2.0) {
                brightness = 0.55; tint = vec3(1.00, 0.94, 0.76);
              } else if (band < 3.0) {
                brightness = 0.22; tint = vec3(0.60, 0.55, 0.80);
              } else if (band < 4.0) {
                brightness = 0.10; tint = vec3(0.30, 0.25, 0.60);
              } else {
                brightness = 0.00; tint = vec3(1.0);
              }

              vec3 lit = uBaseColor * tint * brightness * shade;
              gl_FragColor = vec4(mix(lit, uFogColor, step(4.0, band)), 1.0);
            }
          `,
          uniforms: {
            uFogColor: { value: new THREE.Color(0, 0, 0) },
            uFogNear: { value: 4 },
            uFogFar: { value: 28 },
            uTime: { value: 0 },
            uBaseColor: { value: new THREE.Color(0xf2e5d2) },
          },
        });
        fbx.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = chestMat;
          }
        });

        // Apply scale so bounding box reflects actual world-space size.
        fbx.scale.setScalar(CHEST_SCALE);
        fbx.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(fbx);
        const size = box.getSize(new THREE.Vector3());
        const yLift = -box.min.y; // shift up so the model's bottom sits at y=0

        console.log("[Objects] chest-1.fbx loaded", {
          worldSize: size.toArray().map((v) => +v.toFixed(3)),
          yLift: +yLift.toFixed(3),
        });

        fbx.position.y = yLift;

        // Wrap in a neutral container; SceneObjects will position the container.
        const container = new THREE.Group();
        container.add(fbx);
        setChestProto(container);
      },
      undefined,
      (err) => console.error("Failed to load chest-1.fbx", err),
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Object registry & placements — chests in end room + a few other rooms
  // ---------------------------------------------------------------------------
  const objectRegistry = useMemo<ObjectRegistry>(() => {
    if (!chestProto) return {} as ObjectRegistry;
    return {
      chest: () => chestProto.clone(true),
    };
  }, [chestProto]);

  // Use generateContent to collect wall-adjacent floor candidates per room,
  // then pick one chest location per selected room.
  const content = useMemo<ObjectsContentOutputs>(() => {
    // Collect wall-adjacent floor cells grouped by region (room) ID.
    const candidatesByRegion = new Map<
      number,
      Array<{ x: number; z: number }>
    >();

    const result = generateContent(dungeon, {
      seed: DUNGEON_SEED,
      callback: ({ x, y, masks }) => {
        if (masks.getSolid(x, y) !== "floor") return;
        if (masks.getDistanceToWall(x, y) !== 1) return;
        const rid = masks.getRegionId(x, y);
        if (rid === 0) return;
        let arr = candidatesByRegion.get(rid);
        if (!arr) {
          arr = [];
          candidatesByRegion.set(rid, arr);
        }
        arr.push({ x, z: y });
      },
    });

    // Pick a deterministic candidate from each region's wall-adjacent cells
    // (use the middle index so the choice is stable across renders).
    function pickFromRegion(regionId: number): ObjectPlacement | null {
      const arr = candidatesByRegion.get(regionId);
      if (!arr || arr.length === 0) return null;
      const picked = arr[Math.floor(arr.length / 2)];
      return { type: "chest", x: picked.x, z: picked.z };
    }

    // End room is guaranteed a chest.
    const endChest = pickFromRegion(dungeon.endRoomId);
    if (endChest) result.objects.push(endChest);

    // Add chests in up to 3 other rooms (skip start and end rooms).
    let count = 0;
    for (const [id] of dungeon.rooms) {
      if (count >= 3) break;
      if (id === dungeon.endRoomId || id === dungeon.startRoomId) continue;
      const chest = pickFromRegion(id);
      if (chest) {
        result.objects.push(chest);
        count++;
      }
    }

    return result;
  }, [dungeon]);

  const { camera, containerRef } = useObjectsCamera(
    solidData,
    DUNGEON_W,
    DUNGEON_H,
    spawnX,
    spawnZ,
  );

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
      content.objects,
    );
  }, [solidData, camera, maskOverlay, overlayData, content.objects]);

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.uiHeaderBar}>
        <span className={styles.title}>Object Spawning</span>
        <span className={styles.seed}>seed: {DUNGEON_SEED}</span>
      </div>

      {/* ── Main area ── */}
      <div className={styles.mainArea}>
        {/* Perspective 3-D view */}
        <div ref={containerRef} className={styles.perspectiveView} tabIndex={0}>
          {texture && (
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
              objects={content.objects}
              objectRegistry={objectRegistry}
              style={{ width: "100%", height: "100%" }}
            />
          )}
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
            />{" "}
            Debug edges
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
          ({Math.floor(camera.x)}, {Math.floor(camera.z)})&nbsp;&nbsp; Facing:{" "}
          {cardinalDir(camera.yaw)}
        </span>
        <span className={styles.controls}>
          W/S — move &nbsp;|&nbsp; A/D — turn 90°
        </span>
      </div>
    </div>
  );
}
