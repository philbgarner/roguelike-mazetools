// src/rendering/DungeonRenderView.tsx
import React, { useMemo } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import { buildCharMask, maskToTileTextureR8 } from "./tiles";
import { tileFrag, tileVert } from "./tileShader";

type Props = {
  bsp: BspDungeonOutputs;
  content: ContentOutputs;

  // camera focus in cell coords
  focusX: number;
  focusY: number;

  // tileset atlas image URL (PNG) and layout
  atlasUrl: string;
  atlasCols: number;
  atlasRows: number;

  // which tiles to use for floor/wall; everything else comes from char mask
  wallTile: number;
  floorTile: number;

  // controls how many cells fit on screen; higher zoom = closer
  zoom?: number;

  // if your atlas origin is top-left, set true
  flipAtlasY?: boolean;
};

function OrthoRig({
  focusX,
  focusY,
  zoom = 32,
}: {
  focusX: number;
  focusY: number;
  zoom?: number;
}) {
  const { camera } = useThree();

  useFrame(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = zoom;

    // Center on the selected cell center
    cam.position.set(focusX + 0.5, focusY + 0.5, 10);
    cam.up.set(0, 1, 0);
    cam.lookAt(focusX + 0.5, focusY + 0.5, 0);
    cam.updateProjectionMatrix();
  });

  return null;
}

function PlaneScene({
  bsp,
  content,
  atlasUrl,
  atlasCols,
  atlasRows,
  wallTile,
  floorTile,
  flipAtlasY,
}: Omit<Props, "focusX" | "focusY" | "zoom">) {
  const W = bsp.width;
  const H = bsp.height;

  const atlas = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const t = loader.load(atlasUrl);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }, [atlasUrl]);

  const charTex = useMemo(() => {
    const mask = buildCharMask(bsp, content, { wallTile, floorTile });
    return maskToTileTextureR8(mask, W, H, "char_tile_index_r8");
  }, [bsp, content, W, H, wallTile, floorTile]);

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
  ]);

  return (
    <mesh position={[W / 2, H / 2, 0]}>
      {/* 1 unit = 1 cell */}
      <planeGeometry args={[W, H, 1, 1]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

export default function DungeonRenderView(props: Props) {
  const { bsp, content, focusX, focusY, zoom } = props;

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Canvas
        orthographic
        camera={{
          position: [0, 0, 10],
          zoom: zoom ?? 32,
          near: 0.1,
          far: 1000,
        }}
        gl={{ antialias: false, alpha: false }}
      >
        <OrthoRig focusX={focusX} focusY={focusY} zoom={zoom} />
        <PlaneScene {...props} />
      </Canvas>
    </div>
  );
}
