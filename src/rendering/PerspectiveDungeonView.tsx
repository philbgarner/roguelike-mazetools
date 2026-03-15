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
 * renderRadius  How many cells from the camera to include (default 16).
 */
import { useMemo, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { InstancedTileMesh, type TileInstance } from "./InstancedTileMesh";
import type { TileAtlas } from "./tileAtlas";

// ---------------------------------------------------------------------------
// Face geometry helpers
// ---------------------------------------------------------------------------

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);

function faceMatrix(
  px: number, py: number, pz: number,
  rx: number, ry: number, rz: number,
): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  _q.setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ"));
  m.compose(new THREE.Vector3(px, py, pz), _q, _s);
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

      const wx = cx + 0.5;
      const wz = cz + 0.5;

      // Floor & ceiling always
      floors.push({ matrix: faceMatrix(wx, 0, wz, -HALF_PI, 0, 0), tileId: floorTile });
      ceilings.push({ matrix: faceMatrix(wx, 1, wz, HALF_PI, 0, 0), tileId: ceilTile });

      // Wall faces: emit only where neighbour is solid
      // North wall: between this cell (cz) and cell (cz-1). Face at z=cz, normal +Z.
      if (solid(cx, cz - 1))
        walls.push({ matrix: faceMatrix(wx, 0.5, cz, 0, 0, 0), tileId: wallTile });

      // South wall: at z=cz+1, normal -Z.
      if (solid(cx, cz + 1))
        walls.push({ matrix: faceMatrix(wx, 0.5, cz + 1, 0, Math.PI, 0), tileId: wallTile });

      // West wall: at x=cx, normal +X.
      if (solid(cx - 1, cz))
        walls.push({ matrix: faceMatrix(cx, 0.5, wz, 0, HALF_PI, 0), tileId: wallTile });

      // East wall: at x=cx+1, normal -X.
      if (solid(cx + 1, cz))
        walls.push({ matrix: faceMatrix(cx + 1, 0.5, wz, 0, -HALF_PI, 0), tileId: wallTile });
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
};

function DungeonScene({
  solidData, width, height,
  cameraX, cameraZ, yaw,
  atlas, texture,
  floorTile, ceilingTile, wallTile,
  renderRadius,
}: SceneProps) {
  const { camera } = useThree();

  // Snap to integer cell to avoid rebuilding every sub-cell movement
  const cellX = Math.floor(cameraX);
  const cellZ = Math.floor(cameraZ);

  const { floors, ceilings, walls } = useMemo(
    () => buildFaceInstances(
      solidData, width, height,
      cellX + 0.5, cellZ + 0.5,
      renderRadius,
      floorTile, ceilingTile, wallTile,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [solidData, width, height, cellX, cellZ, renderRadius, floorTile, ceilingTile, wallTile],
  );

  // Update camera every render
  useEffect(() => {
    camera.position.set(cameraX, 0.5, cameraZ);
    (camera as THREE.PerspectiveCamera).fov = 75;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  });

  useEffect(() => {
    camera.rotation.set(0, yaw, 0, "YXZ");
  });

  return (
    <>
      {/* Ambient + directional light so tiles aren't pitch-black */}
      <ambientLight intensity={0.6} />
      <pointLight
        position={[cameraX, 0.5, cameraZ]}
        intensity={4}
        distance={12}
        decay={2}
        color="#ffe8c0"
      />

      <InstancedTileMesh instances={floors} atlas={atlas} texture={texture} />
      <InstancedTileMesh instances={ceilings} atlas={atlas} texture={texture} />
      <InstancedTileMesh instances={walls} atlas={atlas} texture={texture} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export type PerspectiveDungeonViewProps = SceneProps & {
  className?: string;
  style?: React.CSSProperties;
};

export function PerspectiveDungeonView({
  className,
  style,
  ...sceneProps
}: PerspectiveDungeonViewProps) {
  return (
    <Canvas
      className={className}
      style={style}
      camera={{ fov: 75, near: 0.05, far: 64 }}
      gl={{ antialias: false }}
    >
      <DungeonScene {...sceneProps} />
    </Canvas>
  );
}
