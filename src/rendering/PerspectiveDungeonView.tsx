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
import { useMemo, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { InstancedTileMesh, type TileInstance } from "./InstancedTileMesh";
import type { TileAtlas } from "./tileAtlas";
import type { ObjectPlacement, MobilePlacement } from "../content";

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
}: {
  registry: ObjectRegistry;
  placements: ObjectPlacement[];
  tileSize?: number;
  fogNear?: number;
  fogFar?: number;
  fogColor?: THREE.Color;
}) {
  const objects = useMemo(() => {
    return placements.map((p) => {
      const factory = registry[p.type];
      if (!factory) return null;
      const obj = factory();
      const wx = (p.x + 0.5 + (p.offsetX ?? 0)) * tileSize;
      const wy = p.offsetY ?? 0;
      const wz = (p.z + 0.5 + (p.offsetZ ?? 0)) * tileSize;
      obj.position.set(wx, wy, wz);
      obj.rotation.set(0, p.yaw ?? 0, 0);
      if (p.scale !== undefined) obj.scale.setScalar(p.scale);
      // Initialise fog uniforms on any ShaderMaterials in this object.
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.ShaderMaterial)) continue;
          if (mat.uniforms.uFogNear) mat.uniforms.uFogNear.value = fogNear ?? 4;
          if (mat.uniforms.uFogFar) mat.uniforms.uFogFar.value = fogFar ?? 10;
          if (mat.uniforms.uFogColor && fogColor) mat.uniforms.uFogColor.value = fogColor;
        }
      });
      return obj;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, placements, tileSize]);

  // Update uTime each frame on all ShaderMaterials contained in placed objects.
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (const obj of objects) {
      if (!obj) continue;
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
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
      {objects.map((obj, i) => (obj ? <primitive key={i} object={obj} /> : null))}
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
}: {
  placements: MobilePlacement[];
  atlas: SpriteAtlas;
  tileSize?: number;
  ceilingHeight?: number;
  fogNear?: number;
  fogFar?: number;
  fogColor?: THREE.Color;
  flash?: boolean[];
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
      },
      vertexShader: MOBILE_VERT,
      fragmentShader: MOBILE_FRAG,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    return { geo, mat };
  }, [placements, atlas, count, fogNear, fogFar, fogColor]);

  useFrame(({ camera, clock }) => {
    if (!meshRef.current || count === 0) return;
    mat.uniforms.uTime.value = clock.getElapsedTime();

    // Update per-instance flash tint
    if (tintRedRef.current && flash) {
      const arr = tintRedRef.current.array as Float32Array;
      let changed = false;
      for (let i = 0; i < count; i++) {
        const v = flash[i] ? 1.0 : 0.0;
        if (arr[i] !== v) { arr[i] = v; changed = true; }
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
      floors.push({
        matrix: faceMatrix(wx, 0, wz, -HALF_PI, 0, 0, tileSize, tileSize),
        tileId: floorTile,
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

      // Wall faces: emit only where neighbour is solid
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
          tileId: wallTile,
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
          tileId: wallTile,
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
          tileId: wallTile,
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
          tileId: wallTile,
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
  /** Billboard sprite mobiles. */
  mobiles?: MobilePlacement[];
  spriteAtlas?: SpriteAtlas;
  /** Per-mobile flash state (parallel array to mobiles). */
  mobileFlash?: boolean[];
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
  mobiles,
  spriteAtlas,
  mobileFlash,
}: SceneProps) {
  const fogColorObj = useMemo(
    () => (fogColor ? new THREE.Color(fogColor) : undefined),
    [fogColor],
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
      />
      <InstancedTileMesh
        instances={ceilings}
        atlas={atlas}
        texture={texture}
        fogNear={fogNear}
        fogFar={fogFar}
        fogColor={fogColorObj}
        debugEdges={debugEdges}
      />
      <InstancedTileMesh
        instances={walls}
        atlas={atlas}
        texture={texture}
        fogNear={fogNear}
        fogFar={fogFar}
        fogColor={fogColorObj}
        debugEdges={debugEdges}
      />

      {objects && objects.length > 0 && objectRegistry && (
        <SceneObjects
          registry={objectRegistry}
          placements={objects}
          tileSize={tileSize}
          fogNear={fogNear}
          fogFar={fogFar}
          fogColor={fogColorObj}
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
        />
      )}
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
