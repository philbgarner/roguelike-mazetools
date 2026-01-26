// src/rendering/DungeonRenderView.tsx
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import { buildCharMask, buildTintMask, maskToTileTextureR8 } from "./tiles";
import { tileFrag, tileVert } from "./tileShader";
import type { RenderTheme } from "./renderTheme";
import { THEME_DEFAULT } from "./renderTheme";

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

  // camera target (typically player coords)
  focusX: number;
  focusY: number;

  // CLICK -> set focus target (camera only)
  onCellFocus?: (cell: { x: number; y: number }) => void;

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

  // R2 groundwork: tint colors (multiply atlas RGB)
  floorColor?: [number, number, number, number]; // rgba 0..1
  wallColor?: [number, number, number, number];
  playerColor?: [number, number, number, number];
  itemColor?: [number, number, number, number];
  hazardColor?: [number, number, number, number];

  // pixels per cell (world units are pixels)
  zoom?: number;

  onCameraSettled?: (cell: { x: number; y: number }) => void;

  // grid orientation fixes (defaults true/true to match your current convention)
  flipGridX?: boolean;
  flipGridY?: boolean;

  theme?: RenderTheme;
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

  const theme = props.theme ?? THEME_DEFAULT;

  // Convert "#RRGGBB" + alpha to vec4 0..1
  const hexToVec4 = (hex: string, a = 1) => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b, a] as [number, number, number, number];
  };

  // Apply strength as a "mix from white" (same semantics as: rgb *= mix(1, tint, strength))
  // This keeps strength intuitive without needing shader changes.
  const applyStrength = (
    rgba: [number, number, number, number],
    strength: number,
  ): [number, number, number, number] => {
    const s = Math.max(0, Math.min(1.5, strength)); // allow mild >1 boost; clamp for safety
    const r = 1 + (rgba[0] - 1) * s;
    const g = 1 + (rgba[1] - 1) * s;
    const b = 1 + (rgba[2] - 1) * s;
    return [r, g, b, rgba[3]];
  };

  // Theme-first colors (preferred)
  const themeFloor = applyStrength(
    hexToVec4(theme.colors.floor, 1),
    theme.strength.floor,
  );
  const themeWall = applyStrength(
    hexToVec4(theme.colors.wallEdge, 1),
    theme.strength.wallEdge,
  );
  const themePlayer = applyStrength(
    hexToVec4(theme.colors.player, 1),
    theme.strength.player,
  );
  const themeItem = applyStrength(
    hexToVec4(theme.colors.interactable, 1),
    theme.strength.interactable,
  );
  const themeHazard = applyStrength(
    hexToVec4(theme.colors.hazard, 1),
    theme.strength.hazard,
  );

  // Backward-compatible overrides (props win only if explicitly provided)
  const floorColor = props.floorColor ?? themeFloor;
  const wallColor = props.wallColor ?? themeWall;
  const playerColor = props.playerColor ?? themePlayer;
  const itemColor = props.itemColor ?? themeItem;
  const hazardColor = props.hazardColor ?? themeHazard;

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

  // tint channel texture (R8)
  const tintTex = useMemo(() => {
    const mask = buildTintMask(bsp, content, {
      playerX: props.playerX,
      playerY: props.playerY,
    });
    return maskToTileTextureR8(mask, W, H, "tint_channel_r8");
  }, [bsp, content, W, H, props.playerX, props.playerY]);

  // --- Shader material ---
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: tileVert,
      fragmentShader: tileFrag,
      uniforms: {
        uSolid: { value: bsp.textures.solid },
        uChar: { value: charTex },
        uTint: { value: tintTex },
        uAtlas: { value: atlas },
        uGridSize: { value: new THREE.Vector2(W, H) },
        uAtlasGrid: { value: new THREE.Vector2(atlasCols, atlasRows) },
        uWallTile: { value: wallTile },
        uFloorTile: { value: floorTile },
        uFlipAtlasY: { value: flipAtlasY ? 1 : 0 },
        uFlipGridX: { value: flipGridX ? 1 : 0 },
        uFlipGridY: { value: flipGridY ? 1 : 0 },
        uFloorColor: { value: new THREE.Vector4(...floorColor) },
        uWallColor: { value: new THREE.Vector4(...wallColor) },
        uPlayerColor: { value: new THREE.Vector4(...playerColor) },
        uItemColor: { value: new THREE.Vector4(...itemColor) },
        uHazardColor: { value: new THREE.Vector4(...hazardColor) },
      },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }, [
    bsp.textures.solid,
    charTex,
    tintTex,
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
    floorColor,
    wallColor,
    playerColor,
    itemColor,
    hazardColor,
    props.theme,
  ]);

  // -------------------------------
  // Smooth camera rig (inside Canvas)
  // -------------------------------

  const { camera } = useThree();
  const { size } = useThree();

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
    const cam = camera as THREE.OrthographicCamera;

    camWorld.current.set(worldX, worldY, 10);
    targetWorld.current.set(worldX, worldY, 10);

    // Clamp target to map bounds (account for viewport size in world px)
    const halfViewW = (size.width * 0.5) / cam.zoom;
    const halfViewH = (size.height * 0.5) / cam.zoom;
    const halfMapW = W * pxPerCell * 0.5;
    const halfMapH = H * pxPerCell * 0.5;

    const minX = -halfMapW + halfViewW;
    const maxX = halfMapW - halfViewW;
    const minY = -halfMapH + halfViewH;
    const maxY = halfMapH - halfViewH;

    targetWorld.current.x = Math.min(
      maxX,
      Math.max(minX, targetWorld.current.x),
    );
    targetWorld.current.y = Math.min(
      maxY,
      Math.max(minY, targetWorld.current.y),
    );

    camera.position.set(worldX, worldY, 10);

    cam.zoom = 1;
    cam.updateProjectionMatrix();

    // baseline for change detection
    lastFocus.current = { x: focusX, y: focusY };

    // clear any in-flight chase (map/zoom swap)
    targetCellRef.current = null;
    settlingRef.current = null;
  }, [
    W,
    H,
    pxPerCell,
    camera,
    flipGridX,
    focusX,
    focusY,
    size.width,
    size.height,
  ]);

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
    <mesh
      position={[0, 0, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        // uv is 0..1 across the plane
        const uv = e.uv;
        if (!uv) return;

        // Apply grid flips same as shader.
        // We do this so click mapping matches what the user sees.
        let u = uv.x;
        let v = uv.y;

        if (flipGridX) u = 1 - u;
        if (flipGridY) v = 1 - v;

        // numeric safety
        u = Math.min(0.999999, Math.max(0, u));
        v = Math.min(0.999999, Math.max(0, v));

        const cx = Math.floor(u * W);
        const cy = Math.floor(v * H);

        if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;

        // Camera-only: set focus target, do NOT move player.
        props.onCellFocus?.({ x: cx, y: cy });
      }}
    >
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
