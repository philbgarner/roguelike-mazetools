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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
import { useNavigate } from "react-router-dom";
import styles from "./Objects.module.css";
import { InventoryConfig } from "../../inventory";
import Inventory from "./inventory";

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
  const navigate = useNavigate();
  const [maskOverlay, setMaskOverlay] = useState<MaskOverlay>("all");
  const [ceilingHeight, setCeilingHeight] = useState(3);
  const [debugEdges, setDebugEdges] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

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
  // GLB column model loading
  // ---------------------------------------------------------------------------
  // GLB column dimensions (from the accessor bounds in column.glb).
  // max.y=4 — scale so the cap exactly meets the ceiling; the plinth base
  // (min.y=0.5) will sit just above the floor, which is architecturally correct.
  const COLUMN_MAX_Y = 4;

  const [columnProto, setColumnProto] = useState<THREE.Group | null>(null);
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      "/examples/objects/column.glb",
      (gltf) => {
        const model = gltf.scene;

        // Extract the baked texture from the first mesh so the shader can use it.
        let columnTex: THREE.Texture | null = null;
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && !columnTex) {
            const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const stdMat = src as THREE.MeshStandardMaterial;
            if (stdMat.map) columnTex = stdMat.map;
          }
        });

        // Torchlight shader — same band-lighting as the chest, but samples the
        // column's baked texture instead of a flat base colour.
        const columnMat = new THREE.ShaderMaterial({
          vertexShader: /* glsl */ `
            varying vec3  vNormal;
            varying float vFogDist;
            varying vec2  vWorldPos;
            varying vec2  vUv;
            void main() {
              vUv = uv;
              vec4 worldPos = modelMatrix * vec4(position, 1.0);
              vWorldPos = worldPos.xz;
              vNormal = normalize(normalMatrix * normal);
              vec4 eyePos = viewMatrix * worldPos;
              vFogDist = length(eyePos.xyz);
              gl_Position = projectionMatrix * eyePos;
            }
          `,
          fragmentShader: /* glsl */ `
            uniform vec3      uFogColor;
            uniform float     uFogNear;
            uniform float     uFogFar;
            uniform float     uTime;
            uniform sampler2D uMap;
            varying vec3  vNormal;
            varying float vFogDist;
            varying vec2  vWorldPos;
            varying vec2  vUv;

            float hash(vec2 p) {
              return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            void main() {
              vec4 texColor = texture2D(uMap, vUv);
              if (texColor.a < 0.01) discard;

              vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
              float diffuse = clamp(dot(vNormal, lightDir), 0.0, 1.0);
              float shade = 0.65 + 0.35 * diffuse;

              float raw = sin(uTime * 7.0)  * 0.45
                        + sin(uTime * 13.7) * 0.35
                        + sin(uTime * 3.1)  * 0.20;
              float flicker = (floor(raw * 1.5 + 0.5)) / 6.0;

              float dist = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
              float flickeredDist = clamp(dist + flicker * 0.03, 0.0, 1.0);
              float curved = pow(flickeredDist, 0.75);
              float band = floor(curved * 5.0);

              float timeSlot = floor(uTime * 1.5);
              vec2 cell = floor(vWorldPos * 0.5);
              float spatialNoise = hash(cell + vec2(timeSlot * 7.3, timeSlot * 3.1));
              float turb = (floor(spatialNoise * 3.0) / 3.0) * 0.18;

              float brightness;
              if (band < 1.0) {
                brightness = 1.00 - turb;
              } else if (band < 2.0) {
                brightness = 0.55;
              } else if (band < 3.0) {
                brightness = 0.22;
              } else if (band < 4.0) {
                brightness = 0.10;
              } else {
                brightness = 0.00;
              }

              vec3 lit = texColor.rgb * brightness * shade;
              gl_FragColor = vec4(mix(lit, uFogColor, step(4.0, band)), 1.0);
            }
          `,
          uniforms: {
            uFogColor: { value: new THREE.Color(0, 0, 0) },
            uFogNear:  { value: 4 },
            uFogFar:   { value: 28 },
            uTime:     { value: 0 },
            uMap:      { value: columnTex },
          },
        });

        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) mesh.material = columnMat;
        });

        // Do NOT shift model.position.y here — offsetY in each ObjectPlacement
        // accounts for the min-y offset after the container scale is applied,
        // so the column base stays flush with the floor regardless of scale.
        const container = new THREE.Group();
        container.add(model);
        setColumnProto(container);
      },
      undefined,
      (err) => console.error("Failed to load column.glb", err),
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
    const reg: ObjectRegistry = {};
    if (chestProto) reg.chest = () => chestProto.clone(true);
    if (columnProto) reg.column = () => columnProto.clone(true);
    return reg;
  }, [chestProto, columnProto]);

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

    // Pick a deterministic but varied candidate from each region's wall-adjacent cells
    // Uses seed-based selection to ensure consistency while avoiding conflicts
    function pickFromRegion(regionId: number, existingObjects: ObjectPlacement[] = []): ObjectPlacement | null {
      const arr = candidatesByRegion.get(regionId);
      if (!arr || arr.length === 0) return null;
      
      // Create a simple hash from regionId and existing objects for deterministic randomness
      const seedBase = regionId + existingObjects.length * 1000;
      const index = (seedBase * 9301 + 49297) % 233280;
      const normalizedIndex = Math.floor((index / 233280) * arr.length);
      
      // Try to find a position that doesn't conflict with existing objects
      for (let i = 0; i < arr.length; i++) {
        const tryIndex = (normalizedIndex + i) % arr.length;
        const candidate = arr[tryIndex];
        
        const hasConflict = existingObjects.some(obj => 
          obj.x === candidate.x && obj.z === candidate.z
        );
        
        if (!hasConflict) {
          return { type: "chest", x: candidate.x, z: candidate.z };
        }
      }
      
      return null; // No valid position found
    }

    // End room is guaranteed a chest.
    const endChest = pickFromRegion(dungeon.endRoomId, result.objects);
    if (endChest) result.objects.push(endChest);

    // Start room is also guaranteed a chest.
    const startChest = pickFromRegion(dungeon.startRoomId, result.objects);
    if (startChest) result.objects.push(startChest);

    // Add a second chest in the start room
    const startChest2 = pickFromRegion(dungeon.startRoomId, result.objects);
    if (startChest2) result.objects.push(startChest2);

    // Add chests in up to 3 other rooms (skip start and end rooms).
    let count = 0;
    for (const [id] of dungeon.rooms) {
      if (count >= 3) break;
      if (id === dungeon.endRoomId || id === dungeon.startRoomId) continue;
      const chest = pickFromRegion(id, result.objects);
      if (chest) {
        result.objects.push(chest);
        count++;
      }
    }

    // Add symmetric columns to rooms large enough to warrant them.
    // Columns are always placed in mirrored pairs (or quads) so they match
    // real-world architectural logic: you wouldn't build a single column.
    // Scale so the column cap (local y=4) meets the ceiling exactly.
    // The plinth base (local y=0.5*scale) sits just above the floor — correct for a column.
    const colScale = ceilingHeight / COLUMN_MAX_Y;

    for (const [id, room] of dungeon.rooms) {
      if (id === dungeon.startRoomId) continue; // keep entrance clear
      const { x, y, w, h } = room.rect;

      // Margin = 1/4 of the dimension so columns sit at the 1/4 and 3/4 marks,
      // equidistant from opposite walls.
      const marginX = Math.max(1, Math.floor(w / 4));
      const marginY = Math.max(1, Math.floor(h / 4));
      const leftX  = x + marginX;
      const rightX = x + (w - 1 - marginX);
      const topZ   = y + marginY;
      const botZ   = y + (h - 1 - marginY);
      const midX   = x + Math.floor(w / 2);
      const midZ   = y + Math.floor(h / 2);

      if (w >= 6 && h >= 6) {
        // Large room: 4-column quad, symmetric on both axes.
        result.objects.push({ type: "column", x: leftX,  z: topZ,  scale: colScale });
        result.objects.push({ type: "column", x: rightX, z: topZ,  scale: colScale });
        result.objects.push({ type: "column", x: leftX,  z: botZ,  scale: colScale });
        result.objects.push({ type: "column", x: rightX, z: botZ,  scale: colScale });
      } else if (w >= 6 && h >= 4) {
        // Wide room: 2 columns side by side across the width.
        result.objects.push({ type: "column", x: leftX,  z: midZ, scale: colScale });
        result.objects.push({ type: "column", x: rightX, z: midZ, scale: colScale });
      } else if (h >= 6 && w >= 4) {
        // Tall room: 2 columns along the depth.
        result.objects.push({ type: "column", x: midX, z: topZ, scale: colScale });
        result.objects.push({ type: "column", x: midX, z: botZ, scale: colScale });
      }
    }

    return result;
  }, [dungeon, ceilingHeight]);

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

  // Chest record system - tracks individual chest states
  const [chestRecords, setChestRecords] = useState<Record<string, Array<{ name: string; quantity: number }>>>({});

  // Generate chest content when chest is first opened
  const generateChestContent = (chestX: number, chestZ: number) => {
    const chestId = `${chestX},${chestZ}`;
    
    // If chest already has a record, return existing content
    if (chestRecords[chestId]) {
      return chestRecords[chestId];
    }
    
    // Generate new content for first-time opened chest
    const newContent = [
      { name: "Gold Coins", quantity: Math.floor(Math.random() * 50) + 10 },
      { name: "Health Potion", quantity: Math.floor(Math.random() * 3) + 1 },
      { name: "Mana Potion", quantity: Math.floor(Math.random() * 2) + 1 },
      { name: "Torch", quantity: Math.floor(Math.random() * 4) + 1 },
      { name: "Scroll", quantity: Math.floor(Math.random() * 2) + 1 },
    ].filter(() => Math.random() > 0.3); // 70% chance for each item type
    
    // Store in chest records
    setChestRecords(prev => ({
      ...prev,
      [chestId]: newContent
    }));
    
    return newContent;
  };

  // Default game inventory configuration
  const GameInventoryConfig: InventoryConfig = {
    name: "Inventory",
    slotCount: 6
  };
  

  const [sampleInventory, setSampleInventory] = useState([
    { name: "Torch", quantity: 3 },
    { name: "Health Potion", quantity: 2 },
    { name: "Key", quantity: 1 },
    { name: "Gold Coins", quantity: 50 },
    { name: "Rations", quantity: 5 },
  ]);

  const [showChestInventory, setShowChestInventory] = useState(false);
  const [currentChestItems, setCurrentChestItems] = useState<Array<{ name: string; quantity: number }>>([]);

  // Handle using items from inventory
  const handleUseItem = (item: any, quantity: number) => {
    setSampleInventory(prev => {
      const existingItem = prev.find(invItem => invItem.name === item.name);
      if (existingItem && existingItem.quantity >= quantity) {
        const updatedInventory = prev.map(invItem => 
          invItem.name === item.name 
            ? { ...invItem, quantity: invItem.quantity - quantity }
            : invItem
        ).filter(invItem => invItem.quantity > 0);
        
        console.log(`Used ${quantity}x ${item.name}`);
        return updatedInventory;
      }
      return prev;
    });
  };

  // Handle removing items from inventory
  const handleRemoveItem = (item: any, quantity: number) => {
    setSampleInventory(prev => {
      const existingItem = prev.find(invItem => invItem.name === item.name);
      if (existingItem && existingItem.quantity >= quantity) {
        const updatedInventory = prev.map(invItem => 
          invItem.name === item.name 
            ? { ...invItem, quantity: invItem.quantity - quantity }
            : invItem
        ).filter(invItem => invItem.quantity > 0);
        
        console.log(`Removed ${quantity}x ${item.name} from inventory`);
        return updatedInventory;
      }
      return prev;
    });
  };
  const handleTakeItem = (itemName: string, quantity: number) => {
    // Define item types with max stack sizes (same as in inventory component)
    const ITEM_TYPES: Record<string, { maxStack: number }> = {
      "Gold Coins": { maxStack: 999 },
      "Health Potion": { maxStack: 20 },
      "Mana Potion": { maxStack: 20 },
      "Torch": { maxStack: 10 },
      "Scroll": { maxStack: 5 },
      "Key": { maxStack: 1 },
      "Rations": { maxStack: 50 }
    };

    // Add item to player inventory
    setSampleInventory(prev => {
      const itemType = ITEM_TYPES[itemName] || { maxStack: 99 };
      
      // Find existing item of same type
      const existingItem = prev.find(item => item.name === itemName);
      
      let transferAmount = 0;
      
      if (existingItem) {
        // Stack with existing item
        const currentStack = existingItem.quantity;
        const canAdd = Math.min(quantity, itemType.maxStack - currentStack);
        
        if (canAdd > 0) {
          transferAmount = canAdd;
        }
      } else {
        // Check if we have an empty slot (less than 6 items in inventory)
        if (prev.length < 6) {
          transferAmount = Math.min(quantity, itemType.maxStack);
        }
      }
      
      // If no space, don't transfer anything
      if (transferAmount === 0) {
        console.log(`Cannot take ${quantity}x ${itemName} - no available space`);
        return prev;
      }
      
      if (existingItem) {
        // Stack with existing item
        const updatedInventory = prev.map(item => 
          item.name === itemName 
            ? { ...item, quantity: item.quantity + transferAmount }
            : item
        );
        
        // Update chest records and remove item from chest
        setCurrentChestItems(chestPrev => {
          const updatedChest = chestPrev.map(item => 
            item.name === itemName 
              ? { ...item, quantity: item.quantity - transferAmount }
              : item
          ).filter(item => item.quantity > 0);
          
          // Update chest records with new content
          // Find which chest is currently open and update its record
          const playerTileX = Math.floor(camera.x);
          const playerTileZ = Math.floor(camera.z);
          const chestId = `${playerTileX},${playerTileZ}`;
          
          setChestRecords(prev => ({
            ...prev,
            [chestId]: updatedChest
          }));
          
          return updatedChest;
        });
        
        console.log(`Taking ${transferAmount}x ${itemName} from chest (stacked with existing)`);
        return updatedInventory;
      } else {
        // Add new item to empty slot
        const newItem = { 
          name: itemName, 
          quantity: transferAmount 
        };
        const updatedInventory = [...prev, newItem];
        
        // Update chest records and remove item from chest
        setCurrentChestItems(chestPrev => {
          const updatedChest = chestPrev.map(item => 
            item.name === itemName 
              ? { ...item, quantity: item.quantity - transferAmount }
              : item
          ).filter(item => item.quantity > 0);
          
          // Update chest records with new content
          const playerTileX = Math.floor(camera.x);
          const playerTileZ = Math.floor(camera.z);
          const chestId = `${playerTileX},${playerTileZ}`;
          
          setChestRecords(prev => ({
            ...prev,
            [chestId]: updatedChest
          }));
          
          return updatedChest;
        });
        
        console.log(`Taking ${transferAmount}x ${itemName} from chest (new slot)`);
        return updatedInventory;
      }
    });
  };

  // Keyboard input for inventory toggle and chest interaction
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyI") {
        e.preventDefault();
        setShowInventory(prev => !prev);
      } else if (e.code === "KeyE") {
        e.preventDefault();
        
        // If chest inventory is already open, close it
        if (showChestInventory) {
          setShowChestInventory(false);
          return;
        }
        
        // Check if player is on same tile as a chest
        const playerTileX = Math.floor(camera.x);
        const playerTileZ = Math.floor(camera.z);

        const chest = content.objects.find(obj =>
          obj.type === 'chest' && obj.x === playerTileX && obj.z === playerTileZ
        );

        if (chest) {
          // Generate or get chest content from records
          const items = generateChestContent(chest.x, chest.z);
          setCurrentChestItems(items);
          setShowChestInventory(true);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [camera, content.objects, showChestInventory, chestRecords]);

  // Check if player is still on chest tile and close inventory if moved away
  useEffect(() => {
    if (!showChestInventory) return;

    const playerTileX = Math.floor(camera.x);
    const playerTileZ = Math.floor(camera.z);

    const chest = content.objects.find(obj =>
      obj.type === 'chest' && obj.x === playerTileX && obj.z === playerTileZ
    );

    if (!chest) {
      setShowChestInventory(false);
    }
  }, [camera, content.objects, showChestInventory]);

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.uiHeaderBar}>
        <span className={styles.title}>Object Spawning</span>
        <span className={styles.seed}>seed: {DUNGEON_SEED}</span>
        <button className={styles.backBtn} onClick={() => navigate("/")}>← Menu</button>
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
          {/* Fixed Controls Area */}
          <div className={styles.fixedControls}>
            {/* Minimap Controls */}
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

          {/* Scrollable Inventory Area */}
          <div className={styles.scrollableInventoryArea}>
            {/* ── Inventory Panel ── */}
            <Inventory
              inventory={sampleInventory}
              config={GameInventoryConfig}
              isOpen={showInventory}
              onToggle={() => setShowInventory(prev => !prev)}
              onUseItem={handleUseItem}
              onRemoveItem={handleRemoveItem}
            />

            {/* ── Chest Inventory Panel ── */}
            {showChestInventory && (
              <div className={styles.chestPanel}>
                <div className={styles.chestPanelHeader}>
                  <h3>Chest</h3>
                </div>
                <div className={styles.chestPanelContent}>
                  {currentChestItems.length === 0 ? (
                    <p className={styles.chestPanelEmpty}>This chest is empty.</p>
                  ) : (
                    <div className={styles.chestInventoryGrid}>
                      {currentChestItems.map((item, index) => (
                        <div key={index} className={styles.chestInventoryItem}>
                          <div className={styles.chestItemInfo}>
                            <span className={styles.itemName}>{item.name}</span>
                            <span className={styles.itemQuantity}>×{item.quantity}</span>
                          </div>
                          <div className={styles.chestItemActions}>
                            <button
                              className={styles.chestTakeButton}
                              onClick={() => handleTakeItem(item.name, item.quantity)}
                            >
                              Take
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status panel ── */}
      <div className={styles.statusPanel}>
        <span>
          ({Math.floor(camera.x)}, {Math.floor(camera.z)})&nbsp;&nbsp; Facing:{" "}
          {cardinalDir(camera.yaw)}
        </span>
        <span className={styles.controls}>
          W/S — move &nbsp;|&nbsp; A/D — turn 90° &nbsp;|&nbsp; I — inventory &nbsp;|&nbsp; E — open chest
        </span>
      </div>
    </div>
  );
}
