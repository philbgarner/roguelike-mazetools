// src/rendering/DungeonRenderView.tsx
import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import { buildCharMask, buildTintMask, maskToTileTextureR8 } from "./tiles";
import { createVisExploredRGBA, updateVisExploredRGBA } from "./visibility";
import { forestFrag, tileFrag, tileVert } from "./tileShader";
import type { RenderTheme } from "./renderTheme";
import { THEME_DEFAULT } from "./renderTheme";

function featureTypeName(ft: number) {
  switch (ft | 0) {
    case 0:
      return "none";
    case 3:
      return "secret door";
    case 4:
      return "door";
    case 5:
      return "key";
    case 6:
      return "lever";
    case 7:
      return "plate";
    case 8:
      return "block";
    case 9:
      return "hidden passage";
    case 10:
      return "hazard";
    default:
      return `feature(${ft})`;
  }
}

function buildTooltipLines(
  bsp: BspDungeonOutputs,
  content: ContentOutputs,
  x: number,
  y: number,
  visData?: Uint8Array | null,
) {
  const w = bsp.width;
  const i = y * w + x;

  // M7 vis/explored
  const visA = visData ? visData[i * 4 + 3] : -1;
  const exploredG = visData ? visData[i * 4 + 1] : -1;

  // --- BSP masks ---
  const solid = (bsp.masks?.solid?.[i] ?? 0) ? 1 : 0;
  const regionId = (bsp.masks?.regionId?.[i] ?? 0) | 0;
  const dist = (bsp.masks?.distanceToWall?.[i] ?? 0) | 0;

  // --- content masks ---
  const ft = (content.masks?.featureType?.[i] ?? 0) | 0;
  const fid = (content.masks?.featureId?.[i] ?? 0) | 0;
  const fp = (content.masks?.featureParam?.[i] ?? 0) | 0;

  const danger = (content.masks?.danger?.[i] ?? 0) | 0;
  const loot = (content.masks?.lootTier?.[i] ?? 0) | 0;
  const hz = (content.masks?.hazardType?.[i] ?? 0) | 0;

  const lines: string[] = [];

  // --- raw (matches InspectionShell style) ---
  lines.push(`(${x},${y})  region=${regionId}  dist=${dist}  solid=${solid}`);
  if (visA >= 0) lines.push(`visA=${visA}  explored=${exploredG}`);
  if (ft !== 0) lines.push(`featureType=${ft} featureId=${fid} param=${fp}`);
  if (hz !== 0) lines.push(`hazardType=${hz}`);
  if (danger !== 0) lines.push(`danger=${danger}`);
  if (loot !== 0) lines.push(`lootTier=${loot}`);

  // --- readable section ---
  if (ft !== 0) {
    lines.push(""); // spacer
    lines.push(`• ${featureTypeName(ft)}${fid ? ` #${fid}` : ""}`);

    // Circuit membership (no diagnostics here)
    const circuits: any[] = (content.meta as any)?.circuits ?? [];
    const memberships: string[] = [];

    const triggerKind =
      ft === 6 ? "LEVER" : ft === 5 ? "KEY" : ft === 7 ? "PLATE" : null;

    const targetKind =
      ft === 4 ? "DOOR" : ft === 10 ? "HAZARD" : ft === 9 ? "HIDDEN" : null;

    for (let ci = 0; ci < circuits.length; ci++) {
      const c: any = circuits[ci];
      const cid = (c?.id ?? ci) | 0;

      // triggers
      if (triggerKind && Array.isArray(c?.triggers)) {
        for (const t of c.triggers) {
          if (t?.kind === triggerKind && ((t?.refId ?? -1) | 0) === (fid | 0)) {
            memberships.push(`• circuit[${ci}] id=${cid}: trigger ${t.kind}`);
            break;
          }
        }
      }

      // targets
      if (targetKind && Array.isArray(c?.targets)) {
        for (const t of c.targets) {
          if (t?.kind === targetKind && ((t?.refId ?? -1) | 0) === (fid | 0)) {
            const eff = t?.effect ? ` ${t.effect}` : "";
            memberships.push(
              `• circuit[${ci}] id=${cid}: target ${t.kind}${eff}`,
            );
            break;
          }
        }
      }
    }

    if (memberships.length) lines.push(...memberships);
    else lines.push(`• circuits: none`);
  }

  return { lines, ft, fid };
}

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
  suppressBlocks?: boolean;
  // Runtime block positions for dynamic tint (metallic sheen follows the block)
  blockPositions?: { x: number; y: number }[];
  chestTile?: number;
  monsterTile?: number;
  secretDoorTile?: number;
  hiddenPassageTile?: number;

  hazardDefaultTile?: number;
  hazardTilesByType?: Partial<Record<number, number>>;

  playerX?: number;
  playerY?: number;
  playerTile?: number;

  // Exit glyph (stairs at centre of farthest room). If exitX/exitY are omitted,
  // the component derives them from content.meta.farthestRoomId automatically.
  exitTile?: number;
  exitX?: number;
  exitY?: number;

  selectedX?: number;
  selectedY?: number;

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

  onCellHover?: (info: {
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  }) => void;
  onCellHoverEnd?: () => void;

  // Return true if you handled the click (interaction), false to fall back to camera focus.
  onCellClick?: (cell: { x: number; y: number }) => boolean;

  handleHoverCell?: (x: number, y: number) => void;

  // M7: internal — populated by DungeonRenderScene so the wrapper tooltip can read vis data.
  _visDataRef?: React.MutableRefObject<Uint8Array | null>;

  // M8: path mask texture (RGBA8 — R=enemy, G=npc, B=player, A=step index)
  pathMaskTex?: THREE.DataTexture;
  pathStrength?: number;
  pathAnimSpeed?: number;

  // Actor overlay: runtime monster glyphs stamped into R8 DataTexture
  actorCharTex?: THREE.DataTexture | null;

  shaderVariant?: "dungeon" | "forest";
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

    handleHoverCell,
  } = props;

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

  // --- Derive exit cell from farthestRoomId when not explicitly provided ---
  const exitCell = useMemo(() => {
    if (props.exitX !== undefined && props.exitY !== undefined) {
      return { x: props.exitX, y: props.exitY };
    }
    const exitRoomId = (content.meta.farthestRoomId ?? 0) | 0;
    if (exitRoomId <= 0) return null;
    const regionId = bsp.masks.regionId;
    let minX = 1e9,
      minY = 1e9,
      maxX = -1,
      maxY = -1,
      found = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((regionId[y * W + x] | 0) === exitRoomId) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    return {
      x: Math.floor((minX + maxX) / 2),
      y: Math.floor((minY + maxY) / 2),
    };
  }, [bsp, content, W, H, props.exitX, props.exitY]);

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
      suppressBlocks: props.suppressBlocks,
      chestTile: props.chestTile,
      monsterTile: props.monsterTile,
      secretDoorTile: props.secretDoorTile,
      hiddenPassageTile: props.hiddenPassageTile,

      hazardDefaultTile: props.hazardDefaultTile,
      hazardTilesByType: props.hazardTilesByType,

      exitTile: props.exitTile,
      exitX: exitCell?.x,
      exitY: exitCell?.y,

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
    props.suppressBlocks,
    props.chestTile,
    props.monsterTile,
    props.secretDoorTile,
    props.hiddenPassageTile,
    props.hazardDefaultTile,
    props.hazardTilesByType,
    props.exitTile,
    exitCell,
    props.playerX,
    props.playerY,
    props.playerTile,
  ]);

  // tint channel texture (R8)
  const tintTex = useMemo(() => {
    //Enemies/monsters are currently detected by tile == monsterTile and shaded via uEnemyColor (not a tint ID)
    // Tint channel remains reserved for player/items/hazards.
    const mask = buildTintMask(bsp, content, {
      playerX: props.playerX,
      playerY: props.playerY,
      suppressBlocks: !!props.blockPositions,
    });
    // Stamp runtime block positions with tintId=2 so sheen follows the block.
    if (props.blockPositions) {
      const solid = bsp.masks.solid;
      for (const b of props.blockPositions) {
        if (b.x < 0 || b.x >= W || b.y < 0 || b.y >= H) continue;
        const i = b.y * W + b.x;
        if (solid[i] !== 255) mask[i] = 2;
      }
    }
    return maskToTileTextureR8(mask, W, H, "tint_channel_r8");
  }, [bsp, content, W, H, props.playerX, props.playerY, props.blockPositions]);

  // M8: 1×1 transparent fallback for uPathMask when no prop is supplied
  const fallbackPathTex = useMemo(() => {
    const d = new Uint8Array(4); // all zeros
    const t = new THREE.DataTexture(
      d,
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    t.name = "path_mask_fallback";
    t.needsUpdate = true;
    return t;
  }, []);

  // 1×1 zero R8 fallback for uActorChar when no actor overlay exists
  const fallbackActorCharTex = useMemo(() => {
    const d = new Uint8Array([0]);
    const t = new THREE.DataTexture(
      d,
      1,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    t.name = "actor_char_fallback";
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }, []);

  // M7: visibility + explored RGBA8 texture (stable ref; re-created only when W/H change)
  const visRef = useRef<{ data: Uint8Array; tex: THREE.DataTexture } | null>(
    null,
  );
  const visTex = useMemo(() => {
    if (visRef.current) visRef.current.tex.dispose();
    const vr = createVisExploredRGBA(W, H, "vis_explored_rgba");
    visRef.current = vr;
    // Expose the data buffer to the wrapper via the shared ref
    if (props._visDataRef) props._visDataRef.current = vr.data;
    return vr.tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H]);

  // --- Shader material ---
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: tileVert,
      fragmentShader: props.shaderVariant === "forest" ? forestFrag : tileFrag,
      uniforms: {
        uSolid: { value: bsp.textures.solid },
        uChar: { value: charTex },
        uActorChar: { value: props.actorCharTex ?? fallbackActorCharTex },
        uTint: { value: tintTex },
        uAtlas: { value: atlas },
        uGridSize: { value: new THREE.Vector2(W, H) },
        uAtlasGrid: { value: new THREE.Vector2(atlasCols, atlasRows) },
        uWallTile: { value: wallTile },
        uFloorTile: { value: floorTile },
        uDoorTile: { value: props.doorTile ?? 0 },
        uFlipAtlasY: { value: flipAtlasY ? 1 : 0 },
        uFlipGridX: { value: flipGridX ? 1 : 0 },
        uFlipGridY: { value: flipGridY ? 1 : 0 },
        uFloorColor: { value: new THREE.Vector4(...floorColor) },
        uWallColor: { value: new THREE.Vector4(...wallColor) },
        uPlayerColor: { value: new THREE.Vector4(...playerColor) },
        uItemColor: { value: new THREE.Vector4(...itemColor) },
        uHazardColor: { value: new THREE.Vector4(...hazardColor) },
        // R1.5 shader effects
        uTime: { value: 0 },
        uHazardOmega: { value: 6.0 },
        uInteractOmega: { value: 2.0 },
        uOutlineStrength: { value: 0.65 },
        uAoStrength: { value: 0.35 },
        uLightDir: { value: new THREE.Vector2(-1, -1) },
        uEnemyColor: { value: new THREE.Vector4(1.0, 0.35, 0.35, 1.0) },
        uEnemyBreathOmega: { value: 5.0 }, // try 2.0–4.0
        uEnemyBreathAmp: { value: 0.06 }, // try 0.02–0.06
        uMonsterTile: { value: props.monsterTile ?? 0 },
        // R1.5 affordances: hover outline (inspection-only)
        uHoverCell: { value: new THREE.Vector2(-1, -1) },
        uHoverEnabled: { value: 0 },
        uHoverStrength: { value: 0.25 },
        uSelectedCell: { value: new THREE.Vector2(-1, -1) },
        uSelectedEnabled: { value: 0 },
        uSelectedStrength: { value: 0.55 }, // stronger than hover
        // M7 visibility + explored
        uVisExplored: { value: visTex },
        uExploredDim: { value: 0.25 },
        uVisFgBoost: { value: 0.15 },
        uVisBgBoost: { value: 0.08 },
        // M8 path mask
        uPathMask: { value: props.pathMaskTex ?? fallbackPathTex },
        uPathStrength: { value: props.pathStrength ?? 0.7 },
        uPathAnimSpeed: { value: props.pathAnimSpeed ?? 0.5 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }, [
    bsp.textures.solid,
    charTex,
    tintTex,
    visTex,
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
    props.shaderVariant,
  ]);

  // -------------------------------
  // Smooth camera rig (inside Canvas)
  // -------------------------------

  const { camera, size, viewport, gl } = useThree();
  const lastHoverRef = useRef<{ x: number; y: number } | null>(null);

  // --- Hover stability fix (frame-driven raycast) ---
  const meshRef = useRef<THREE.Mesh | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerNdcRef = useRef(new THREE.Vector2(0, 0)); // [-1,+1]
  const pointerInsideRef = useRef(false);

  // We still want tooltip anchoring while mouse is stationary.
  const lastClientRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );

  // Avoid spamming hover end when we momentarily miss.
  const hoverActiveRef = useRef(false);

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

    // Clamp during chase so we never pan beyond dungeon extents.
    const planeW = W * pxPerCell;
    const planeH = H * pxPerCell;

    const halfVw = viewport.width / 2;
    const halfVh = viewport.height / 2;

    // If viewport is larger than plane, lock to center (0,0).
    const minX = Math.min(-planeW / 2 + halfVw, 0);
    const maxX = Math.max(planeW / 2 - halfVw, 0);
    const minY = Math.min(-planeH / 2 + halfVh, 0);
    const maxY = Math.max(planeH / 2 - halfVh, 0);

    targetWorld.current.x = Math.max(
      minX,
      Math.min(maxX, targetWorld.current.x),
    );
    targetWorld.current.y = Math.max(
      minY,
      Math.min(maxY, targetWorld.current.y),
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

  useEffect(() => {
    const rawX = props.selectedX ?? -1;
    const rawY = props.selectedY ?? -1;

    if (rawX < 0 || rawY < 0) {
      mat.uniforms.uSelectedEnabled.value = 0;
      mat.uniforms.uSelectedCell.value.set(-1, -1);
      return;
    }

    // Convert logical grid coords -> shader cell coords (which are flipped when flipGridX/Y are true)
    const sx = flipGridX ? W - 1 - rawX : rawX;
    const sy = flipGridY ? H - 1 - rawY : rawY;

    mat.uniforms.uSelectedCell.value.set(sx, sy);
    mat.uniforms.uSelectedEnabled.value = 1;
  }, [mat, props.selectedX, props.selectedY, flipGridX, flipGridY, W, H]);

  useEffect(() => {
    return () => {
      atlas.dispose();
    };
  }, [atlas]);

  // M7: recompute visibility every time the player moves (or W/H change).
  useEffect(() => {
    const vr = visRef.current;
    if (!vr) return;
    updateVisExploredRGBA(
      vr.data,
      W,
      H,
      props.playerX ?? 0,
      props.playerY ?? 0,
      {
        radius: 6,
        innerRadius: 1.5,
        exploredOnVisible: true,
      },
    );
    vr.tex.needsUpdate = true;
    mat.uniforms.uVisExplored.value = vr.tex;
    // Keep wrapper tooltip data in sync
    if (props._visDataRef) props._visDataRef.current = vr.data;
  }, [mat, W, H, props.playerX, props.playerY, props._visDataRef]);

  // M8: update path mask uniform when prop changes
  useEffect(() => {
    mat.uniforms.uPathMask.value = props.pathMaskTex ?? fallbackPathTex;
  }, [mat, props.pathMaskTex, fallbackPathTex]);

  // Actor overlay: update uActorChar uniform when prop changes
  useEffect(() => {
    mat.uniforms.uActorChar.value = props.actorCharTex ?? fallbackActorCharTex;
  }, [mat, props.actorCharTex, fallbackActorCharTex]);

  useFrame((_state, delta) => {
    const cam = camera as THREE.OrthographicCamera;
    const targetCell = targetCellRef.current;

    if ((mat as any).uniforms?.uTime) {
      (mat as any).uniforms.uTime.value = _state.clock.getElapsedTime();
    }

    if (!targetCell) {
      cam.position.copy(camWorld.current);
      cam.updateProjectionMatrix();
    } else {
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

        onCameraSettled?.({ x: targetCell.x, y: targetCell.y });

        targetCellRef.current = null;
        settlingRef.current = null;
      }
    }

    // -------------------------------
    // Hover (frame-driven raycast)
    // -------------------------------
    if (!pointerInsideRef.current || !meshRef.current) {
      // If pointer is not inside, ensure hover is cleared once.
      if (hoverActiveRef.current) {
        hoverActiveRef.current = false;
        lastHoverRef.current = null;
        mat.uniforms.uHoverEnabled.value = 0;
        props.onCellHoverEnd?.();
      }
      mat.uniforms.uSelectedCell.value.copy(mat.uniforms.uHoverCell.value);
      mat.uniforms.uSelectedEnabled.value = 1;
      mat.uniforms.uSelectedStrength.value = 1.0;
      return;
    }

    const rc = raycasterRef.current;
    rc.setFromCamera(pointerNdcRef.current, camera);

    const hits = rc.intersectObject(meshRef.current, false);
    if (hits.length === 0 || !hits[0].uv) {
      // Pointer is inside canvas but ray missed this frame.
      // Clear hover once, but do NOT thrash.
      if (hoverActiveRef.current) {
        hoverActiveRef.current = false;
        lastHoverRef.current = null;
        mat.uniforms.uHoverEnabled.value = 0;
        props.onCellHoverEnd?.();
      }
      mat.uniforms.uSelectedCell.value.copy(mat.uniforms.uHoverCell.value);
      mat.uniforms.uSelectedEnabled.value = 1;
      mat.uniforms.uSelectedStrength.value = 1.0;
      return;
    }

    let u = hits[0].uv.x;
    let v = hits[0].uv.y;

    // IMPORTANT: match click mapping (flip fixes)
    if (flipGridX) u = 1 - u;
    if (flipGridY) v = 1 - v;

    u = Math.min(0.999999, Math.max(0, u));
    v = Math.min(0.999999, Math.max(0, v));

    const cx = Math.floor(u * W);
    const cy = Math.floor(v * H);
    if (cx < 0 || cx >= W || cy < 0 || cy >= H) {
      if (hoverActiveRef.current) {
        hoverActiveRef.current = false;
        lastHoverRef.current = null;
        mat.uniforms.uHoverEnabled.value = 0;
        props.onCellHoverEnd?.();
      }
      mat.uniforms.uSelectedCell.value.copy(mat.uniforms.uHoverCell.value);
      mat.uniforms.uSelectedEnabled.value = 1;
      mat.uniforms.uSelectedStrength.value = 1.0;
      return;
    }

    const last = lastHoverRef.current;
    const sameCell = !!last && last.x === cx && last.y === cy;

    // Always keep hover “on” when we have a valid hit.
    hoverActiveRef.current = true;
    mat.uniforms.uHoverEnabled.value = 1;

    // Only update the hover cell uniform + callbacks when it changes.
    if (!sameCell) {
      lastHoverRef.current = { x: cx, y: cy };
      mat.uniforms.uHoverCell.value.set(cx, cy);

      const cc = lastClientRef.current;
      if (cc) {
        props.onCellHover?.({
          x: cx,
          y: cy,
          clientX: cc.clientX,
          clientY: cc.clientY,
        });
      }
    }

    // --- OPTIONAL DEBUG: mirror hover -> selected continuously (sanity test) ---
    mat.uniforms.uSelectedCell.value.copy(mat.uniforms.uHoverCell.value);
    mat.uniforms.uSelectedEnabled.value = 1;
    mat.uniforms.uSelectedStrength.value = 0.7;

    // New hovered cell
    lastHoverRef.current = { x: cx, y: cy };
    hoverActiveRef.current = true;

    mat.uniforms.uHoverCell.value.set(cx, cy);
    mat.uniforms.uHoverEnabled.value = 1;

    const cc = lastClientRef.current;
    if (cc) {
      props.onCellHover?.({
        x: cx,
        y: cy,
        clientX: cc.clientX,
        clientY: cc.clientY,
      });
    }
  });

  // -------------------------------
  // Draw the plane (pixel-world units)
  // -------------------------------
  return (
    <mesh
      ref={meshRef}
      position={[0, 0, 0]}
      onPointerEnter={(e) => {
        pointerInsideRef.current = true;

        // initialize tooltip anchor + NDC immediately on enter
        lastClientRef.current = { clientX: e.clientX, clientY: e.clientY };

        const rect = gl.domElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        pointerNdcRef.current.set(x * 2 - 1, -(y * 2 - 1));
      }}
      onPointerMove={(e) => {
        e.stopPropagation();

        // mark pointer inside canvas/mesh
        pointerInsideRef.current = true;

        // tooltip anchor needs stable client coords even while stationary
        lastClientRef.current = { clientX: e.clientX, clientY: e.clientY };

        // compute NDC from domElement rect (authoritative fix)
        const rect = gl.domElement.getBoundingClientRect();

        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        pointerNdcRef.current.set(x * 2 - 1, -(y * 2 - 1));
      }}
      onPointerOut={() => {
        pointerInsideRef.current = false;
        lastClientRef.current = null;

        // Clear hover once (frame loop will also guard, but do it immediately)
        if (hoverActiveRef.current) {
          hoverActiveRef.current = false;
          lastHoverRef.current = null;
          mat.uniforms.uHoverEnabled.value = 0;
          props.onCellHoverEnd?.();
        }
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        const uv = e.uv;
        if (!uv) return;

        let u = uv.x;
        let v = uv.y;
        if (flipGridX) u = 1 - u;
        if (flipGridY) v = 1 - v;

        u = Math.min(0.999999, Math.max(0, u));
        v = Math.min(0.999999, Math.max(0, v));

        const cx = Math.floor(u * W);
        const cy = Math.floor(v * H);
        if (cx < 0 || cx >= W || cy < 0 || cy >= H) return;

        // 1) Let inspection logic handle interactables first.
        const handled = props.onCellClick?.({ x: cx, y: cy }) ?? false;
        if (handled) return;

        // 2) Otherwise, camera-only focus.
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

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  // M7: shared ref populated by DungeonRenderScene so tooltip can read vis data.
  const visDataRef = useRef<Uint8Array | null>(null);

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    visible: boolean;
    pending: boolean;
    lines: string[];
    clientX: number | null;
    clientY: number | null;
  }>({
    visible: false,
    pending: false,
    x: 0,
    y: 0,
    lines: [],
    clientX: null,
    clientY: null,
  });

  // ---- Debounce / delay ----
  const TOOLTIP_DELAY_MS = 120;
  const hoverTimerRef = useRef<number | null>(null);
  const lastHoverKeyRef = useRef<string | null>(null);

  function clearHoverTimer() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => clearHoverTimer();
  }, []);

  // ---- Tooltip positioning (your adapted version) ----
  function getTooltipStyle(): React.CSSProperties {
    const wrap = canvasWrapRef.current;
    if (!wrap) return { left: 0, top: 0 };

    const rect = wrap.getBoundingClientRect();
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;

    const pad = 24;
    const estTipW = 320;
    const estTipH = 140;

    const anchorX = tooltip.clientX != null ? tooltip.clientX - rect.left : pad;
    const anchorY = tooltip.clientY != null ? tooltip.clientY - rect.top : pad;

    let left = anchorX;
    let top = anchorY + pad;

    left = Math.max(pad, Math.min(left, wrapW - estTipW - pad));
    if (top + estTipH > wrapH - pad) {
      top = Math.max(pad, anchorY - estTipH - pad);
    }
    return { left, top, zIndex: 999 };
  }

  // ---- Your buildTooltipLines, adapted to THIS component (no runtime/diagnostics) ----
  function buildTooltipLines(x: number, y: number) {
    const dungeon = props.bsp;
    const content = props.content;

    const w = dungeon.width;
    const i = y * w + x;

    const solid = dungeon.masks.solid[i] ? 1 : 0;
    const regionId = dungeon.masks.regionId[i] | 0;
    const dist = dungeon.masks.distanceToWall[i] | 0;

    const ft = content.masks.featureType[i] | 0;
    const fid = content.masks.featureId[i] | 0;
    const fp = content.masks.featureParam[i] | 0;

    const danger = content.masks.danger[i] | 0;
    const loot = content.masks.lootTier[i] | 0;
    const hz = content.masks.hazardType[i] | 0; // meaningful when ft==10 per repomix

    // M7 vis/explored
    const vd = visDataRef.current;
    const visA = vd ? vd[i * 4 + 3] : -1;
    const exploredG = vd ? vd[i * 4 + 1] : -1;

    const lines: string[] = [];

    // --- raw (keep) ---
    lines.push(`(${x},${y})  region=${regionId}  dist=${dist}  solid=${solid}`);
    if (visA >= 0) lines.push(`visA=${visA}  explored=${exploredG}`);
    if (ft !== 0) lines.push(`featureType=${ft} featureId=${fid} param=${fp}`);
    if (hz !== 0) lines.push(`hazardType=${hz}`);
    if (danger !== 0) lines.push(`danger=${danger}`);
    if (loot !== 0) lines.push(`lootTier=${loot}`);

    // --- readable section ---
    if (ft !== 0) {
      lines.push(""); // spacer line
      lines.push(`• ${featureTypeName(ft)}${fid ? ` #${fid}` : ""}`);

      // --- circuit membership (no diagnostics in render view) ---
      const circuits = props.content.meta?.circuits ?? [];
      const memberships: string[] = [];

      const triggerKind =
        ft === 6 ? "LEVER" : ft === 5 ? "KEY" : ft === 7 ? "PLATE" : null;

      const targetKind =
        ft === 4 ? "DOOR" : ft === 10 ? "HAZARD" : ft === 9 ? "HIDDEN" : null;

      for (let ci = 0; ci < circuits.length; ci++) {
        const c: any = circuits[ci];
        const cid = (c?.id ?? ci) | 0;

        if (triggerKind && Array.isArray(c?.triggers)) {
          for (const t of c.triggers) {
            if (
              t?.kind === triggerKind &&
              ((t?.refId ?? -1) | 0) === (fid | 0)
            ) {
              memberships.push(`• circuit[${ci}] id=${cid}: trigger ${t.kind}`);
              break;
            }
          }
        }

        if (targetKind && Array.isArray(c?.targets)) {
          for (const t of c.targets) {
            if (
              t?.kind === targetKind &&
              ((t?.refId ?? -1) | 0) === (fid | 0)
            ) {
              const eff = t?.effect ? ` ${t.effect}` : "";
              memberships.push(
                `• circuit[${ci}] id=${cid}: target ${t.kind}${eff}`,
              );
              break;
            }
          }
        }
      }

      //lines.push(memberships.length ? ...memberships : `• circuits: none`);
      if (memberships.length > 0) {
        lines.push(...memberships);
      } else {
        lines.push("• circuits: none");
      }
    }

    return { lines, ft, fid };
  }

  return (
    <div
      ref={canvasWrapRef}
      style={{
        width: "100vw",
        height: "100vh",
        position: "absolute",
        left: 0,
        top: 0,
      }}
    >
      <Canvas
        orthographic
        camera={{
          position: [0, 0, 10],
          zoom: 1,
          near: 0.1,
          far: 1000,
        }}
        gl={{ antialias: false, alpha: false }}
      >
        {/*<OrthoFrustum pxPerCell={pxPerCell} />*/}
        <DungeonRenderScene
          {...props}
          _visDataRef={visDataRef}
          onCellHover={({ x, y, clientX, clientY }) => {
            const key = `${x},${y}`;

            // If we're still hovering the same cell, just keep the anchor fresh.
            // DO NOT clear/re-arm the timer (or you'll starve the debounce forever).
            if (lastHoverKeyRef.current === key) {
              setTooltip((t) => ({
                ...t,
                clientX,
                clientY,
              }));
              return;
            }

            // New hovered cell
            lastHoverKeyRef.current = key;

            props.onCellHover?.({
              x: x,
              y: y,
              clientX: clientX,
              clientY: clientY,
            });

            // Arm tooltip (but do not show yet)
            setTooltip((t) => ({
              ...t,
              x,
              y,
              clientX,
              clientY,
              pending: true,
              visible: false,
            }));

            clearHoverTimer();

            hoverTimerRef.current = window.setTimeout(() => {
              // still on same cell?
              if (lastHoverKeyRef.current !== key) return;

              const { lines } = buildTooltipLines(x, y);

              setTooltip((t) => ({
                ...t,
                x,
                y,
                clientX,
                clientY,
                lines,
                pending: false,
                visible: true,
              }));
            }, TOOLTIP_DELAY_MS);
          }}
          onCellHoverEnd={() => {
            lastHoverKeyRef.current = null;
            clearHoverTimer();
            setTooltip((t) => ({
              ...t,
              visible: false,
              pending: false,
              clientX: null,
              clientY: null,
            }));
          }}
        />
      </Canvas>

      <div
        className="maze-tooltip"
        style={{
          position: "absolute",
          ...getTooltipStyle(),
          pointerEvents: "none",
          opacity: tooltip.visible ? 1.0 : 0.0,
        }}
      >
        {tooltip.lines.map((ln, idx) => (
          <div key={idx}>{ln === "" ? "\u00A0" : ln}</div>
        ))}
      </div>
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
