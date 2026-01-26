// src/rendering/DungeonRenderView.tsx
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import { buildCharMask, maskToTileTextureR8 } from "./tiles";
import { tileFrag, tileVert } from "./tileShader";

type Props = {
  bsp: BspDungeonOutputs;
  content: ContentOutputs;

  // tileset atlas image URL (PNG) and layout
  atlasUrl: string;
  atlasCols: number;
  atlasRows: number;

  // which tiles to use for floor/wall; everything else comes from char mask
  wallTile: number;
  floorTile: number;

  // if your atlas origin is top-left, set true (shader handles flip)
  flipAtlasY?: boolean;

  doorTile?: number;
  keyTile?: number;
  leverTile?: number;
  plateTile?: number;
  blockTile?: number;
  chestTile?: number;
  monsterTile?: number;
  secretDoorTile?: number;
  hiddenPassageTile?: number;

  hazardDefaultTile?: number;
  hazardTilesByType?: Partial<Record<number, number>>;

  playerX?: number;
  playerY?: number;
  playerTile?: number;

  // camera target (typically player coords)
  focusX: number;
  focusY: number;

  // pixels per cell (world units are pixels)
  zoom?: number;

  onCameraSettled?: (cell: { x: number; y: number }) => void;

  // grid orientation fixes (defaults true/true to match your current convention)
  flipGridX?: boolean;
  flipGridY?: boolean;
};

// -------------------------------
// Canvas-internal scene
// -------------------------------

function cellToWorldPx(
  x: number,
  y: number,
  w: number,
  h: number,
  pxPerCell: number,
  flipGridX: boolean,
) {
  // X flip still applies (mirroring)
  const fx = flipGridX ? w - 1 - x : x;

  // IMPORTANT:
  // DO NOT flip Y here.
  // y is already top-left–origin, y-down.
  const fy = y;

  const worldX = (fx + 0.5 - w / 2) * pxPerCell;
  const worldY = (h / 2 - (fy + 0.5)) * pxPerCell;

  return { worldX, worldY };
}

function DungeonRenderScene(props: Props) {
  const {
    bsp,
    content,
    atlasUrl,
    atlasCols,
    atlasRows,
    wallTile,
    floorTile,
    flipAtlasY,

    focusX,
    focusY,
    zoom,

    onCameraSettled,
  } = props;

  console.log("dungeon render scene focus x/y", focusX, focusY);
  const W = bsp.width;
  const H = bsp.height;

  const pxPerCell = zoom ?? 32;

  const flipGridX = props.flipGridX ?? true;
  const flipGridY = props.flipGridY ?? true;

  // --- Load atlas texture (inside Canvas tree = safe) ---
  const atlas = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const t = loader.load(atlasUrl);

    // Pixel art correctness
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;

    // IMPORTANT: do not double-flip; shader handles optional flip
    t.flipY = false;

    // Atlas is color
    t.colorSpace = THREE.SRGBColorSpace;

    return t;
  }, [atlasUrl]);

  // --- Build char texture (R8) ---
  const charTex = useMemo(() => {
    const mask = buildCharMask(bsp, content, {
      wallTile,
      floorTile,

      doorTile: props.doorTile,
      keyTile: props.keyTile,
      leverTile: props.leverTile,
      plateTile: props.plateTile,
      blockTile: props.blockTile,
      chestTile: props.chestTile,
      monsterTile: props.monsterTile,
      secretDoorTile: props.secretDoorTile,
      hiddenPassageTile: props.hiddenPassageTile,

      hazardDefaultTile: props.hazardDefaultTile,
      hazardTilesByType: props.hazardTilesByType,

      playerX: props.playerX,
      playerY: props.playerY,
      playerTile: props.playerTile,
    });

    return maskToTileTextureR8(mask, W, H, "char_tile_index_r8");
  }, [
    bsp,
    content,
    W,
    H,
    wallTile,
    floorTile,
    props.doorTile,
    props.keyTile,
    props.leverTile,
    props.plateTile,
    props.blockTile,
    props.chestTile,
    props.monsterTile,
    props.secretDoorTile,
    props.hiddenPassageTile,
    props.hazardDefaultTile,
    props.hazardTilesByType,
    props.playerX,
    props.playerY,
    props.playerTile,
  ]);

  // --- Shader material ---
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: tileVert,
      fragmentShader: tileFrag,
      uniforms: {
        uSolid: { value: bsp.textures.solid },
        uChar: { value: charTex },
        uAtlas: { value: atlas },
        uGridSize: { value: new THREE.Vector2(W, H) },
        uAtlasGrid: { value: new THREE.Vector2(atlasCols, atlasRows) },
        uWallTile: { value: wallTile },
        uFloorTile: { value: floorTile },
        uFlipAtlasY: { value: flipAtlasY ? 1 : 0 },
        uFlipGridX: { value: flipGridX ? 1 : 0 },
        uFlipGridY: { value: flipGridY ? 1 : 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }, [
    bsp.textures.solid,
    charTex,
    atlas,
    W,
    H,
    atlasCols,
    atlasRows,
    wallTile,
    floorTile,
    flipAtlasY,
    flipGridX,
    flipGridY,
  ]);

  // -------------------------------
  // Smooth camera rig (inside Canvas)
  // -------------------------------

  const { camera } = useThree();

  // camera current + target positions in world pixels
  const camWorld = useRef(new THREE.Vector3(0, 0, 10));
  const targetWorld = useRef(new THREE.Vector3(0, 0, 10));

  // Track last focus to detect changes
  const lastFocus = useRef<{ x: number; y: number } | null>(null);

  // Stable target tracking (refs, not state)
  const targetCellRef = useRef<{ x: number; y: number } | null>(null);
  const settlingRef = useRef<{ x: number; y: number; frames: number } | null>(
    null,
  );

  // Initialize camera when map size / zoom changes (NOT on focus changes)
  useEffect(() => {
    const { worldX, worldY } = cellToWorldPx(
      focusX,
      focusY,
      W,
      H,
      pxPerCell,
      flipGridX,
    );

    camWorld.current.set(worldX, worldY, 10);
    targetWorld.current.set(worldX, worldY, 10);
    camera.position.set(worldX, worldY, 10);

    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = 1;
    cam.updateProjectionMatrix();

    // baseline for change detection
    lastFocus.current = { x: focusX, y: focusY };

    // clear any in-flight chase (map/zoom swap)
    targetCellRef.current = null;
    settlingRef.current = null;
  }, [W, H, pxPerCell, camera, flipGridX]);

  // When focus changes, set a new target cell (without spam)
  useEffect(() => {
    const prev = lastFocus.current;
    if (!prev || prev.x !== focusX || prev.y !== focusY) {
      lastFocus.current = { x: focusX, y: focusY };

      const curTarget = targetCellRef.current;
      if (!curTarget || curTarget.x !== focusX || curTarget.y !== focusY) {
        targetCellRef.current = { x: focusX, y: focusY };
        settlingRef.current = { x: focusX, y: focusY, frames: 0 };
      }
    }
  }, [focusX, focusY]);

  useFrame((_state, delta) => {
    const cam = camera as THREE.OrthographicCamera;
    const targetCell = targetCellRef.current;

    if (!targetCell) {
      cam.position.copy(camWorld.current);
      cam.updateProjectionMatrix();
      return;
    }

    const { worldX, worldY } = cellToWorldPx(
      targetCell.x,
      targetCell.y,
      W,
      H,
      pxPerCell,
      flipGridX,
    );
    targetWorld.current.set(worldX, worldY, 10);

    // frame-rate independent smoothing
    const speed = 14; // 10-20 range
    const t = 1 - Math.exp(-speed * delta);
    camWorld.current.lerp(targetWorld.current, t);

    cam.position.copy(camWorld.current);
    cam.updateProjectionMatrix();

    // stop within a few pixels (world units are pixels)
    const dx = camWorld.current.x - targetWorld.current.x;
    const dy = camWorld.current.y - targetWorld.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // increment frames for this chase
    const s = settlingRef.current;
    if (s && s.x === targetCell.x && s.y === targetCell.y) {
      s.frames += 1;
    }

    const stopPx = 3;
    const maxFrames = 90; // ~1.5s @ 60fps
    const shouldForceSettle = !!s && s.frames >= maxFrames;

    if (dist <= stopPx || shouldForceSettle) {
      camWorld.current.set(targetWorld.current.x, targetWorld.current.y, 10);
      cam.position.copy(camWorld.current);
      cam.updateProjectionMatrix();

      console.log(
        "camera settled on",
        { x: targetCell.x, y: targetCell.y },
        {
          dist,
          forced: shouldForceSettle,
          frames: s?.frames,
        },
      );

      onCameraSettled?.({ x: targetCell.x, y: targetCell.y });

      targetCellRef.current = null;
      settlingRef.current = null;
    }
  });

  // -------------------------------
  // Draw the plane (pixel-world units)
  // -------------------------------
  return (
    <mesh position={[0, 0, 0]}>
      {/* World is pixels: plane is W*pxPerCell by H*pxPerCell */}
      <planeGeometry args={[W * pxPerCell, H * pxPerCell, 1, 1]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

// -------------------------------
// Wrapper (NO R3F hooks here)
// -------------------------------

export default function DungeonRenderView(props: Props) {
  const pxPerCell = props.zoom ?? 32;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas
        orthographic
        // camera parameters here are just defaults; the rig positions it
        camera={{
          position: [0, 0, 10],
          zoom: 1,
          near: 0.1,
          far: 1000,
        }}
        gl={{ antialias: false, alpha: false }}
      >
        {/* Set a fixed ortho frustum in pixel-world units */}
        <OrthoFrustum pxPerCell={pxPerCell} />
        <DungeonRenderScene {...props} />
      </Canvas>
    </div>
  );
}

// Keeps ortho frustum stable and sized in “pixel world units”
function OrthoFrustum({ pxPerCell }: { pxPerCell: number }) {
  const { camera, size } = useThree();

  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;

    // We want 1 world unit == 1 pixel, so frustum matches canvas pixel size.
    const halfW = size.width / 2;
    const halfH = size.height / 2;

    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;

    cam.near = 0.1;
    cam.far = 1000;

    cam.zoom = 1;
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, pxPerCell]);

  return null;
}
