/**
 * PerspectiveDungeonView
 *
 * A self-contained react-three-fiber Canvas that renders a first-person
 * dungeon view in the style of Eye of the Beholder.
 *
 * The dungeon is tessellated into instanced quads (one InstancedTileMesh per
 * surface type: floors, ceilings, walls).  Only cells within `renderRadius`
 * of the camera are included, and only the faces that border open space are
 * emitted (hidden-surface removal at build time).
 *
 * Props
 * ─────
 * solidData     Uint8Array, 1 byte per cell, row-major (z * width + x).
 *               Value > 0 means solid/wall.
 * width/height  Grid dimensions in cells.
 * cameraX/Z     Camera world position (cell-centre = n + 0.5).
 * yaw           Camera yaw in radians (0 = facing -Z / "north").
 * atlas         TileAtlas describing the tilesheet layout.
 * texture       THREE.Texture pointing at the tilesheet image.
 * floorTile     Tile ID for floor faces.
 * ceilingTile   Tile ID for ceiling faces.
 * wallTile      Tile ID for wall faces.
 * renderRadius   How many cells from the camera to include (default 16).
 * ceilingHeight  World-space height of the ceiling (default 1).  Walls scale
 *                to fill floor→ceiling; camera eye sits at ceilingHeight/2.
 * tileSize       World-space width (and depth) of each tile (default 1).
 *                cameraX/Z are in cell units; world positions = cell * tileSize.
 */
import { useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { InstancedTileMesh, type TileInstance } from "./InstancedTileMesh";
import type { TileAtlas } from "./tileAtlas";
import type { ObjectPlacement, MobilePlacement } from "../content";

// ---------------------------------------------------------------------------
// Speech bubble type (exported so App can build the array)
// ---------------------------------------------------------------------------

export type SpeechBubbleData = {
  id: string;
  x: number; // cell coordinate
  z: number; // cell coordinate
  text: string;
  speakerName?: string;
};

// ---------------------------------------------------------------------------
// SpeechBubbleSprite — renders a single speech bubble via drei Html
// ---------------------------------------------------------------------------

function SpeechBubbleSprite({
  bubble,
  tileSize = 1,
  ceilingHeight = 1.5,
  fogNear = 4,
  fogFar = 28,
}: {
  bubble: SpeechBubbleData;
  tileSize?: number;
  ceilingHeight?: number;
  fogNear?: number;
  fogFar?: number;
}) {
  const [displayed, setDisplayed] = useState("");
  const divRef = useRef<HTMLDivElement>(null);

  // Character-by-character typewriter animation
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(bubble.text.slice(0, i));
      if (i >= bubble.text.length) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [bubble.text]);

  const wx = (bubble.x + 0.5) * tileSize;
  const wy = ceilingHeight + 0.5; // above the sprite (which sits at ceilingHeight/2)
  const wz = (bubble.z + 0.5) * tileSize;

  // Update opacity each frame based on distance — fades like fog, min 0.35 so
  // it stays legible even when the speaker is deep in shadow / behind geometry.
  useFrame(({ camera }) => {
    if (!divRef.current) return;
    const dx = camera.position.x - wx;
    const dz = camera.position.z - wz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const t = Math.max(
      0,
      Math.min(1, (dist - fogNear) / Math.max(1, fogFar - fogNear)),
    );
    const opacity = Math.max(0.35, 1.0 - t * 0.65);
    divRef.current.style.opacity = String(opacity);
  });

  return (
    <Html
      position={[wx, wy, wz]}
      center
      distanceFactor={tileSize * 4}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div
        ref={divRef}
        style={{
          position: "relative",
          background: "rgba(6, 4, 18, 0.90)",
          border: "1.5px solid rgba(200, 185, 110, 0.75)",
          borderRadius: 8,
          padding: "6px 10px",
          maxWidth: 320,
          minWidth: 200,
          fontSize: 12,
          color: "#f2e6b8",
          fontFamily: "monospace",
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          textAlign: "left",
          filter: "drop-shadow(0 0 6px rgba(0,0,0,0.95))",
          transition: "opacity 0.25s ease",
        }}
      >
        {bubble.speakerName && (
          <div
            style={{
              fontSize: 10,
              color: "#88aaff",
              marginBottom: 3,
              fontWeight: "bold",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {bubble.speakerName}
          </div>
        )}
        {displayed}
        {/* Tail border (outline colour) */}
        <div
          style={{
            position: "absolute",
            bottom: -10,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: "10px solid rgba(200, 185, 110, 0.75)",
          }}
        />
        {/* Tail fill (bubble background colour) */}
        <div
          style={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "5.5px solid transparent",
            borderRight: "5.5px solid transparent",
            borderTop: "8.5px solid rgba(6, 4, 18, 0.90)",
          }}
        />
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Object registry
// ---------------------------------------------------------------------------

export type ObjectFactory = () => THREE.Object3D;
export type ObjectRegistry = Record<string, ObjectFactory>;

// ---------------------------------------------------------------------------
// Sprite atlas for mobiles
// ---------------------------------------------------------------------------

export type SpriteAtlas = {
  texture: THREE.Texture;
  columns: number;
  rows: number;
};

// ---------------------------------------------------------------------------
// SceneObjects — renders placed objects via factory registry
// ---------------------------------------------------------------------------

function SceneObjects({
  registry,
  placements,
  tileSize = 1,
  fogNear,
  fogFar,
  fogColor,
  occupiedKeys,
  tintColors,
}: {
  registry: ObjectRegistry;
  placements: ObjectPlacement[];
  tileSize?: number;
  fogNear?: number;
  fogFar?: number;
  fogColor?: THREE.Color;
  occupiedKeys?: Set<string>;
  tintColors?: THREE.Color[];
}) {
  // Per-placement current animated yaw (for doors)
  const doorYawsRef = useRef<Float32Array | null>(null);

  const objects = useMemo(() => {
    const yaws = new Float32Array(placements.length);
    doorYawsRef.current = yaws;
    return placements.map((p, i) => {
      const factory = registry[p.type];
      if (!factory) return null;
      const obj = factory();
      const wx = (p.x + 0.5 + (p.offsetX ?? 0)) * tileSize;
      const wy = p.offsetY ?? 0;
      const wz = (p.z + 0.5 + (p.offsetZ ?? 0)) * tileSize;
      obj.position.set(wx, wy, wz);
      const baseYaw = p.yaw ?? 0;
      yaws[i] = baseYaw;
      obj.rotation.set(0, baseYaw, 0);
      if (p.scale !== undefined) obj.scale.setScalar(p.scale);
      // Initialise fog uniforms on any ShaderMaterials in this object.
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.ShaderMaterial)) continue;
          if (mat.uniforms.uFogNear) mat.uniforms.uFogNear.value = fogNear ?? 4;
          if (mat.uniforms.uFogFar) mat.uniforms.uFogFar.value = fogFar ?? 10;
          if (mat.uniforms.uFogColor && fogColor)
            mat.uniforms.uFogColor.value = fogColor;
          if (mat.uniforms.uTint0 && tintColors?.[0]) mat.uniforms.uTint0.value = tintColors[0];
          if (mat.uniforms.uTint1 && tintColors?.[1]) mat.uniforms.uTint1.value = tintColors[1];
          if (mat.uniforms.uTint2 && tintColors?.[2]) mat.uniforms.uTint2.value = tintColors[2];
          if (mat.uniforms.uTint3 && tintColors?.[3]) mat.uniforms.uTint3.value = tintColors[3];
        }
      });
      return obj;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, placements, tileSize]);

  // Reactively update tint uniforms on all ShaderMaterials when tintColors changes.
  useEffect(() => {
    if (!tintColors) return;
    for (const obj of objects) {
      if (!obj) continue;
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.ShaderMaterial)) continue;
          if (mat.uniforms.uTint0 && tintColors[0]) mat.uniforms.uTint0.value = tintColors[0];
          if (mat.uniforms.uTint1 && tintColors[1]) mat.uniforms.uTint1.value = tintColors[1];
          if (mat.uniforms.uTint2 && tintColors[2]) mat.uniforms.uTint2.value = tintColors[2];
          if (mat.uniforms.uTint3 && tintColors[3]) mat.uniforms.uTint3.value = tintColors[3];
        }
      });
    }
  }, [tintColors, objects]);

  // Update uTime each frame on all ShaderMaterials; animate door rotations.
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const yaws = doorYawsRef.current;
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj) continue;

      // Animate door open/close based on occupancy
      if (yaws && placements[i].type === "door") {
        const p = placements[i];
        const isOccupied = occupiedKeys?.has(`${p.x}_${p.z}`) ?? false;
        const baseYaw = p.yaw ?? 0;
        const targetYaw = isOccupied ? baseYaw + Math.PI / 2 : baseYaw;
        // Lerp toward target (shortest path)
        let delta = targetYaw - yaws[i];
        delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
        yaws[i] += delta * 0.15;
        obj.rotation.y = yaws[i];
      }

      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const mat of mats) {
          if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uTime) {
            mat.uniforms.uTime.value = t;
          }
        }
      });
    }
  });

  return (
    <>
      {objects.map((obj, i) =>
        obj ? <primitive key={i} object={obj} /> : null,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SceneMobiles — renders billboard sprites via InstancedMesh
// ---------------------------------------------------------------------------

const MOBILE_VERT = /* glsl */ `
attribute float aTileId;
attribute float aTintRed;
varying vec2 vUv;
varying float vTileId;
varying float vFogDist;
varying vec2 vWorldPos;
varying float vTintRed;

void main() {
  vUv = uv;
  vTileId = aTileId;
  vTintRed = aTintRed;
  vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xz;
  vec4 eyePos = viewMatrix * worldPos;
  vFogDist = length(eyePos.xyz);
  gl_Position = projectionMatrix * eyePos;
}
`;

const MOBILE_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uColumns;
uniform float uRows;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform vec3  uTint0;
uniform vec3  uTint1;
uniform vec3  uTint2;
uniform vec3  uTint3;
varying vec2  vUv;
varying float vTileId;
varying float vFogDist;
varying vec2  vWorldPos;
varying float vTintRed;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float col = mod(vTileId, uColumns);
  float row = floor(vTileId / uColumns);
  vec2 uvMin = vec2(col / uColumns, 1.0 - (row + 1.0) / uRows);
  vec2 uvSize = vec2(1.0 / uColumns, 1.0 / uRows);
  vec2 atlasUv = uvMin + vUv * uvSize;
  vec4 color = texture2D(uAtlas, atlasUv);
  if (color.a < 0.5) discard;

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
  vec3  tint;
  if (band < 1.0) {
    brightness = 1.00 - turb; tint = uTint0;
  } else if (band < 2.0) {
    brightness = 0.55; tint = uTint1;
  } else if (band < 3.0) {
    brightness = 0.22; tint = uTint2;
  } else if (band < 4.0) {
    brightness = 0.10; tint = uTint3;
  } else {
    brightness = 0.00; tint = vec3(1.0);
  }

  vec3 lit = color.rgb * tint * brightness;
  lit = mix(lit, vec3(brightness, 0.0, 0.0), vTintRed * 0.85);
  gl_FragColor = vec4(mix(lit, uFogColor, step(4.0, band)), color.a);
}`;

// Reusable temporaries to avoid per-frame allocation.
const _mbMat4 = new THREE.Matrix4();
const _mbPos = new THREE.Vector3();
const _mbQuat = new THREE.Quaternion();
const _mbScale = new THREE.Vector3();
const _mbEuler = new THREE.Euler();

function SceneMobiles({
  placements,
  atlas,
  tileSize = 1,
  ceilingHeight = 1.5,
  fogNear = 4,
  fogFar = 10,
  fogColor,
  flash,
  tintColors,
}: {
  placements: MobilePlacement[];
  atlas: SpriteAtlas;
  tileSize?: number;
  ceilingHeight?: number;
  fogNear?: number;
  fogFar?: number;
  fogColor?: THREE.Color;
  flash?: boolean[];
  tintColors?: THREE.Color[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tintRedRef = useRef<THREE.InstancedBufferAttribute | null>(null);
  const count = placements.length;

  const { geo, mat } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);

    const tileIds = new Float32Array(count);
    placements.forEach((p, i) => {
      tileIds[i] = p.tileId;
    });
    geo.setAttribute("aTileId", new THREE.InstancedBufferAttribute(tileIds, 1));

    const tintRed = new Float32Array(count);
    const tintRedAttr = new THREE.InstancedBufferAttribute(tintRed, 1);
    geo.setAttribute("aTintRed", tintRedAttr);
    tintRedRef.current = tintRedAttr;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas.texture },
        uColumns: { value: atlas.columns },
        uRows: { value: atlas.rows },
        uFogColor: { value: fogColor ?? new THREE.Color(0, 0, 0) },
        uFogNear: { value: fogNear },
        uFogFar: { value: fogFar },
        uTime: { value: 0 },
        uTint0: { value: tintColors?.[0] ?? new THREE.Color(1.00, 0.90, 0.68) },
        uTint1: { value: tintColors?.[1] ?? new THREE.Color(1.00, 0.94, 0.76) },
        uTint2: { value: tintColors?.[2] ?? new THREE.Color(0.60, 0.55, 0.80) },
        uTint3: { value: tintColors?.[3] ?? new THREE.Color(0.30, 0.25, 0.60) },
      },
      vertexShader: MOBILE_VERT,
      fragmentShader: MOBILE_FRAG,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    return { geo, mat };
  }, [placements, atlas, count, fogNear, fogFar, fogColor]);

  useEffect(() => {
    if (tintColors?.[0]) mat.uniforms.uTint0.value = tintColors[0];
    if (tintColors?.[1]) mat.uniforms.uTint1.value = tintColors[1];
    if (tintColors?.[2]) mat.uniforms.uTint2.value = tintColors[2];
    if (tintColors?.[3]) mat.uniforms.uTint3.value = tintColors[3];
  }, [tintColors, mat]);

  useFrame(({ camera, clock }) => {
    if (!meshRef.current || count === 0) return;
    mat.uniforms.uTime.value = clock.getElapsedTime();

    // Update per-instance flash tint
    if (tintRedRef.current && flash) {
      const arr = tintRedRef.current.array as Float32Array;
      let changed = false;
      for (let i = 0; i < count; i++) {
        const v = flash[i] ? 1.0 : 0.0;
        if (arr[i] !== v) {
          arr[i] = v;
          changed = true;
        }
      }
      if (changed) tintRedRef.current.needsUpdate = true;
    }

    const camPos = camera.position;

    _mbScale.set(tileSize, ceilingHeight, 1);
    placements.forEach((p, i) => {
      const wx = (p.x + 0.5) * tileSize;
      const wz = (p.z + 0.5) * tileSize;
      const wy = ceilingHeight / 2;
      _mbPos.set(wx, wy, wz);
      const angle = Math.atan2(camPos.x - wx, camPos.z - wz);
      _mbEuler.set(0, angle, 0);
      _mbQuat.setFromEuler(_mbEuler);
      _mbMat4.compose(_mbPos, _mbQuat, _mbScale);
      meshRef.current!.setMatrixAt(i, _mbMat4);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return <instancedMesh ref={meshRef} args={[geo, mat, count]} />;
}

// ---------------------------------------------------------------------------
// Face geometry helpers
// ---------------------------------------------------------------------------

const _q = new THREE.Quaternion();

const CAMERA_Y_FACTOR = 0.5;

function faceMatrix(
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number,
  scaleY = 1,
  scaleX = 1,
): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  _q.setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ"));
  m.compose(
    new THREE.Vector3(px, py, pz),
    _q,
    new THREE.Vector3(scaleX, scaleY, 1),
  );
  return m;
}

// PlaneGeometry default normal is +Z.  These rotations point each face type
// toward open space so it is visible from inside the dungeon.
//
//   floor    → normal +Y : Euler(-π/2, 0, 0)
//   ceiling  → normal -Y : Euler(+π/2, 0, 0)
//   north wall (at z=cz)    → normal +Z (into cell) : Euler(0,0,0)
//   south wall (at z=cz+1)  → normal -Z (into cell) : Euler(0,π,0)
//   west wall  (at x=cx)    → normal +X (into cell) : Euler(0,π/2,0)
//   east wall  (at x=cx+1)  → normal -X (into cell) : Euler(0,-π/2,0)

const HALF_PI = Math.PI / 2;

function buildFaceInstances(
  solidData: Uint8Array,
  width: number,
  height: number,
  camX: number,
  camZ: number,
  radius: number,
  floorTile: number,
  ceilTile: number,
  wallTile: number,
  ceilingHeight: number,
  tileSize: number,
  floorData?: Uint8Array,
  wallData?: Uint8Array,
  floorTileMap?: number[],
  wallTileMap?: number[],
): {
  floors: TileInstance[];
  ceilings: TileInstance[];
  walls: TileInstance[];
} {
  const floors: TileInstance[] = [];
  const ceilings: TileInstance[] = [];
  const walls: TileInstance[] = [];

  const minCX = Math.max(0, Math.floor(camX - radius));
  const maxCX = Math.min(width - 1, Math.floor(camX + radius));
  const minCZ = Math.max(0, Math.floor(camZ - radius));
  const maxCZ = Math.min(height - 1, Math.floor(camZ + radius));

  const r2 = radius * radius;

  function solid(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= width || cz >= height) return true;
    return solidData[cz * width + cx] > 0;
  }

  for (let cz = minCZ; cz <= maxCZ; cz++) {
    for (let cx = minCX; cx <= maxCX; cx++) {
      if (solid(cx, cz)) continue;

      // Range check (circular)
      const dx = cx + 0.5 - camX;
      const dz = cz + 0.5 - camZ;
      if (dx * dx + dz * dz > r2) continue;

      const wx = (cx + 0.5) * tileSize;
      const wz = (cz + 0.5) * tileSize;

      const wallMidY = ceilingHeight / 2;

      // Floor & ceiling always
      const cellFloorType = floorData ? floorData[cz * width + cx] : 0;
      const resolvedFloorTile =
        floorData && floorTileMap && cellFloorType > 0
          ? (floorTileMap[cellFloorType] ?? floorTile)
          : floorTile;
      floors.push({
        matrix: faceMatrix(wx, 0, wz, -HALF_PI, 0, 0, tileSize, tileSize),
        tileId: resolvedFloorTile,
        cellX: cx,
        cellZ: cz,
      });
      ceilings.push({
        matrix: faceMatrix(
          wx,
          ceilingHeight,
          wz,
          HALF_PI,
          0,
          0,
          tileSize,
          tileSize,
        ),
        tileId: ceilTile,
      });

      // Wall faces: emit only where neighbour is solid.
      // cellX/cellZ on wall instances point to the solid neighbour cell so that
      // per-cell data (passage tint, etc.) can be looked up for that solid cell.

      function resolveWallTile(wcx: number, wcz: number): number {
        if (!wallData || !wallTileMap) return wallTile;
        const wt = wallData[wcz * width + wcx];
        return wt > 0 ? (wallTileMap[wt] ?? wallTile) : wallTile;
      }

      // North wall: between this cell (cz) and cell (cz-1). Face at z=cz, normal +Z.
      if (solid(cx, cz - 1))
        walls.push({
          matrix: faceMatrix(
            wx,
            wallMidY,
            cz * tileSize,
            0,
            0,
            0,
            ceilingHeight,
            tileSize,
          ),
          tileId: resolveWallTile(cx, cz - 1),
          cellX: cx,
          cellZ: cz - 1,
        });

      // South wall: at z=cz+1, normal -Z.
      if (solid(cx, cz + 1))
        walls.push({
          matrix: faceMatrix(
            wx,
            wallMidY,
            (cz + 1) * tileSize,
            0,
            Math.PI,
            0,
            ceilingHeight,
            tileSize,
          ),
          tileId: resolveWallTile(cx, cz + 1),
          cellX: cx,
          cellZ: cz + 1,
        });

      // West wall: at x=cx, normal +X.
      if (solid(cx - 1, cz))
        walls.push({
          matrix: faceMatrix(
            cx * tileSize,
            wallMidY,
            wz,
            0,
            HALF_PI,
            0,
            ceilingHeight,
            tileSize,
          ),
          tileId: resolveWallTile(cx - 1, cz),
          cellX: cx - 1,
          cellZ: cz,
        });

      // East wall: at x=cx+1, normal -X.
      if (solid(cx + 1, cz))
        walls.push({
          matrix: faceMatrix(
            (cx + 1) * tileSize,
            wallMidY,
            wz,
            0,
            -HALF_PI,
            0,
            ceilingHeight,
            tileSize,
          ),
          tileId: resolveWallTile(cx + 1, cz),
          cellX: cx + 1,
          cellZ: cz,
        });
    }
  }

  return { floors, ceilings, walls };
}

// ---------------------------------------------------------------------------
// Inner scene (runs inside Canvas, can use R3F hooks)
// ---------------------------------------------------------------------------

type SceneProps = {
  solidData: Uint8Array;
  width: number;
  height: number;
  cameraX: number;
  cameraZ: number;
  yaw: number;
  atlas: TileAtlas;
  texture: THREE.Texture;
  floorTile: number;
  ceilingTile: number;
  wallTile: number;
  renderRadius: number;
  ceilingHeight?: number;
  tileSize?: number;
  fogNear?: number;
  fogFar?: number;
  fogColor?: string;
  fov?: number;
  debugEdges?: boolean;
  /** Static placed objects resolved via objectRegistry. */
  objects?: ObjectPlacement[];
  objectRegistry?: ObjectRegistry;
  /** Occupied cell keys ("x_z") — objects whose type is "door" will animate open. */
  objectOccupiedKeys?: Set<string>;
  /** Billboard sprite mobiles. */
  mobiles?: MobilePlacement[];
  spriteAtlas?: SpriteAtlas;
  /** Per-mobile flash state (parallel array to mobiles). */
  mobileFlash?: boolean[];
  /** Per-cell highlight mask: 0=none, 1=targeting preview, 2=fire, 3=lightning. */
  highlightMask?: Uint8Array;
  /** Per-cell passage mask: 0=none, 1=disabled, 2=enabled. Applied to wall faces. */
  passageMask?: Uint8Array;
  /** Active speech bubbles to render above speakers in 3-D space. */
  speechBubbles?: SpeechBubbleData[];
  /** Four torchlight tint band colours as CSS hex strings (bands 0–3, near→far). */
  tintColors?: string[];
  /** Per-cell floor type IDs (from atlas floorTypes). Used with floorTileMap. */
  floorData?: Uint8Array;
  /** Per-cell wall type IDs (from atlas wallTypes). Used with wallTileMap. */
  wallData?: Uint8Array;
  /** Maps atlas floorType id → row-major tile ID. Index 0 = fallback to floorTile. */
  floorTileMap?: number[];
  /** Maps atlas wallType id → row-major tile ID. Index 0 = fallback to wallTile. */
  wallTileMap?: number[];
};

function DungeonScene({
  solidData,
  width,
  height,
  cameraX,
  cameraZ,
  yaw,
  atlas,
  texture,
  floorTile,
  ceilingTile,
  wallTile,
  renderRadius,
  ceilingHeight = 1.5,
  tileSize = 1,
  fov = 75,
  fogNear,
  fogFar,
  fogColor,
  debugEdges,
  objects,
  objectRegistry,
  objectOccupiedKeys,
  mobiles,
  spriteAtlas,
  mobileFlash,
  highlightMask,
  passageMask,
  speechBubbles,
  tintColors,
  floorData,
  wallData,
  floorTileMap,
  wallTileMap,
}: SceneProps) {
  const fogColorObj = useMemo(
    () => (fogColor ? new THREE.Color(fogColor) : undefined),
    [fogColor],
  );
  const tintColorObjs = useMemo(
    () => tintColors?.map((c) => new THREE.Color(c)),
    [tintColors],
  );
  const { camera } = useThree();

  // Snap to integer cell to avoid rebuilding every sub-cell movement
  const cellX = Math.floor(cameraX);
  const cellZ = Math.floor(cameraZ);

  const { floors, ceilings, walls } = useMemo(
    () =>
      buildFaceInstances(
        solidData,
        width,
        height,
        cellX + 0.5,
        cellZ + 0.5,
        renderRadius,
        floorTile,
        ceilingTile,
        wallTile,
        ceilingHeight,
        tileSize,
        floorData,
        wallData,
        floorTileMap,
        wallTileMap,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      solidData,
      width,
      height,
      cellX,
      cellZ,
      renderRadius,
      floorTile,
      ceilingTile,
      wallTile,
      ceilingHeight,
      tileSize,
      floorData,
      wallData,
      floorTileMap,
      wallTileMap,
    ],
  );

  // Update camera every render
  useEffect(() => {
    // Pull camera back to the rear of the cell (0.5 units opposite facing direction).
    // Forward = (-sin(yaw), 0, -cos(yaw)), so back = (+sin(yaw), 0, +cos(yaw)).
    camera.position.set(
      (cameraX + 0.5 * Math.sin(yaw)) * tileSize,
      ceilingHeight * CAMERA_Y_FACTOR,
      (cameraZ + 0.5 * Math.cos(yaw)) * tileSize,
    );
    (camera as THREE.PerspectiveCamera).fov = fov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  });

  useEffect(() => {
    camera.rotation.set(0, yaw, 0, "YXZ");
  });

  return (
    <>
      <color attach="background" args={["#000000"]} />
      {/* Ambient + directional light so tiles aren't pitch-black */}
      <ambientLight intensity={0.6} />
      <pointLight
        position={[cameraX * tileSize, ceilingHeight / 2, cameraZ * tileSize]}
        intensity={4}
        distance={12}
        decay={2}
        color="#ffe8c0"
      />

      <InstancedTileMesh
        instances={floors}
        atlas={atlas}
        texture={texture}
        fogNear={fogNear}
        fogFar={fogFar}
        fogColor={fogColorObj}
        debugEdges={debugEdges}
        highlightData={highlightMask}
        gridWidth={width}
        tintColors={tintColorObjs}
      />
      <InstancedTileMesh
        instances={ceilings}
        atlas={atlas}
        texture={texture}
        fogNear={fogNear}
        fogFar={fogFar}
        fogColor={fogColorObj}
        debugEdges={debugEdges}
        tintColors={tintColorObjs}
      />
      <InstancedTileMesh
        instances={walls}
        atlas={atlas}
        texture={texture}
        fogNear={fogNear}
        fogFar={fogFar}
        fogColor={fogColorObj}
        debugEdges={debugEdges}
        passageData={passageMask}
        gridWidth={width}
        tintColors={tintColorObjs}
      />

      {objects && objects.length > 0 && objectRegistry && (
        <SceneObjects
          registry={objectRegistry}
          placements={objects}
          tileSize={tileSize}
          fogNear={fogNear}
          fogFar={fogFar}
          fogColor={fogColorObj}
          occupiedKeys={objectOccupiedKeys}
          tintColors={tintColorObjs}
        />
      )}

      {mobiles && mobiles.length > 0 && spriteAtlas && (
        <SceneMobiles
          placements={mobiles}
          atlas={spriteAtlas}
          tileSize={tileSize}
          ceilingHeight={ceilingHeight}
          fogNear={fogNear}
          fogFar={fogFar}
          fogColor={fogColorObj}
          flash={mobileFlash}
          tintColors={tintColorObjs}
        />
      )}

      {speechBubbles &&
        speechBubbles.map((b) => (
          <SpeechBubbleSprite
            key={b.id}
            bubble={b}
            tileSize={tileSize}
            ceilingHeight={ceilingHeight}
            fogNear={fogNear ?? 4}
            fogFar={fogFar ?? 28}
          />
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export type PerspectiveDungeonViewProps = SceneProps & {
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  // speechBubbles is already part of SceneProps; re-listed here for clarity
};

export function PerspectiveDungeonView({
  className,
  style,
  fov,
  children,
  ...sceneProps
}: PerspectiveDungeonViewProps) {
  return (
    <Canvas
      className={className}
      style={style}
      camera={{ fov: fov, near: 0.05, far: 64 }}
      gl={{ antialias: false }}
    >
      <DungeonScene {...sceneProps} fov={fov} />
      {children}
    </Canvas>
  );
}
