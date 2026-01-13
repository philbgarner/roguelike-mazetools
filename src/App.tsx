// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  generateBspDungeon,
  generateDungeonContent,
  imageDataToPngDataUrl,
} from "./mazeGen";
import {
  initDungeonRuntimeState,
  collectKey,
  toggleLever,
  togglePlate,
  resetRuntimeState,
  derivePlatesFromBlocks,
  tryPushBlock,
  type DungeonRuntimeState,
} from "./dungeonState";

import { evaluateCircuits, type CircuitEvalResult } from "./evaluateCircuits";

import "./styles.css";

type Layer =
  | "solid"
  | "regionId"
  | "distanceToWall"
  | "content"
  | "featureType"
  | "featureId"
  | "featureParam"
  | "danger"
  | "lootTier"
  | "hazardType";

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function drawToCanvas(
  canvas: HTMLCanvasElement | null,
  imageData: ImageData | null,
) {
  if (!canvas || !imageData) return;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(imageData, 0, 0);
}

function idxOf(W: number, x: number, y: number) {
  return y * W + x;
}

function featureName(ft: number) {
  switch (ft) {
    case 1:
      return "Monster Spawn";
    case 2:
      return "Chest";
    case 3:
      return "Secret Door";
    case 4:
      return "Door";
    case 5:
      return "Key";
    case 6:
      return "Lever";
    case 7:
      return "Pressure Plate";
    case 8:
      return "Push Block";
    case 9:
      return "Hidden Passage";
    case 10:
      return "Hazard";
    default:
      return "None";
  }
}

function doorKindName(param: number) {
  // Matches Milestone 2 plan:
  // 1 = locked door, 2 = lever-controlled door
  switch (param) {
    case 1:
      return "Locked";
    case 2:
      return "Lever";
    default:
      return "Unknown";
  }
}

/**
 * Shared door-state derivation used by:
 * - content composite rendering (door color overlay)
 * - tooltips
 *
 * IMPORTANT: door "locked" is derived from runtime key/lever state.
 */
function readDoorState(
  runtime: DungeonRuntimeState,
  doorId: number,
): { isOpen: boolean; isLocked: boolean; kind: number } {
  const door = runtime.doors?.[doorId];
  if (!door) return { isOpen: false, isLocked: false, kind: 0 };

  // Your DoorKind is numeric: 1 locked, 2 lever.
  const kind = (door.kind as any) | 0;

  // Derive gated state by matching “circuit id” (doorId) convention.
  const hasKey = !!runtime.keys?.[doorId]?.collected;
  const leverOn = !!runtime.levers?.[doorId]?.toggled;

  const isLocked = kind === 1 ? !hasKey : kind === 2 ? !leverOn : false;

  const isOpen = !!(door.isOpen || (door as any).forcedOpen);

  return { kind, isOpen, isLocked };
}

function makeContentCompositeImageData(
  dungeon: ReturnType<typeof generateBspDungeon>,
  content: ReturnType<typeof generateDungeonContent>,
  runtime: DungeonRuntimeState | null,
  showStateOverlay: boolean,
  selectedBlockId: number | null,
): ImageData {
  const W = dungeon.width;
  const H = dungeon.height;

  const solid = dungeon.masks.solid; // 255 wall, 0 floor
  const ft = content.masks.featureType; // 0..n
  const fid = content.masks.featureId;
  const hzType = content.masks.hazardType;

  const img = new ImageData(W, H);
  const data = img.data;

  // Runtime blocks overlay (blocks move; masks do not)
  const blockOcc = new Uint8Array(W * H);
  const selectedOcc = new Uint8Array(W * H);
  if (runtime) {
    for (const [idStr, b] of Object.entries(runtime.blocks ?? {})) {
      const id = Number(idStr);
      const bi = idxOf(W, b.x, b.y);
      if (bi >= 0 && bi < blockOcc.length) blockOcc[bi] = 1;
      if (selectedBlockId != null && id === selectedBlockId) {
        if (bi >= 0 && bi < selectedOcc.length) selectedOcc[bi] = 1;
      }
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idxOf(W, x, y);
      const o = i * 4;

      const isWall = solid[i] === 255;

      // Base: walls dark, floors light
      let r = isWall ? 25 : 235;
      let g = isWall ? 25 : 235;
      let b = isWall ? 25 : 235;
      const a = 255;

      // Overlay by feature type
      const t = ft[i] | 0;
      if (t !== 0) {
        // Slightly darken base first so overlay pops
        r = Math.max(0, r - 40);
        g = Math.max(0, g - 40);
        b = Math.max(0, b - 40);

        if (t === 1) {
          // monster
          r = 220;
          g = 60;
          b = 60;
        } else if (t === 2) {
          // chest
          r = 70;
          g = 200;
          b = 90;
        } else if (t === 3 || t === 4) {
          // secret door OR door
          // Default (no runtime overlay): brown
          r = 150;
          g = 105;
          b = 60;

          // Milestone 3 overlay for doors only (featureType == 4)
          if (t === 4 && showStateOverlay && runtime) {
            const doorId = fid[i] | 0;
            const { isOpen, isLocked } = readDoorState(runtime, doorId);

            if (isOpen) {
              // OPEN door: lighter tan
              r = 205;
              g = 170;
              b = 120;
            } else if (isLocked) {
              // CLOSED + LOCKED: darker brown
              r = 105;
              g = 70;
              b = 40;
            } else {
              // CLOSED but not locked
              r = 145;
              g = 95;
              b = 55;
            }
          }

          // Optional: make secret doors distinct when overlay is enabled
          if (t === 3 && showStateOverlay) {
            r = 135;
            g = 90;
            b = 50;
          }
        } else if (t === 7) {
          // pressure plate (milestone 3)
          // neutral stone-grey
          r = 150;
          g = 150;
          b = 150;
          // stone-grey; brighten when pressed (derived)
          r = 150;
          g = 150;
          b = 150;
          if (runtime && showStateOverlay) {
            const plateId = fid[i] | 0;
            const pressed = !!runtime.plates?.[plateId]?.pressed;
            if (pressed) {
              r = 205;
              g = 205;
              b = 205;
            }
          }
        } else if (t === 9) {
          // hidden passage (featureType 9)
          // unrevealed: dark “masonry” (wall-ish), revealed: pale teal (floor-ish)
          const secretId = fid[i] | 0;

          // IMPORTANT: revealed-ness should reflect runtime even if showStateOverlay is off.
          // showStateOverlay can still govern OTHER overlays, but not whether the tile exists.
          const revealed = !!(runtime && runtime.secrets?.[secretId]?.revealed);

          if (revealed) {
            r = 150;
            g = 210;
            b = 210;
          } else {
            r = 55;
            g = 55;
            b = 60;
          }
        } else if (t === 10) {
          // hazard (featureType 10) — consequence-only (walkable), but visually clear
          const ht = hzType[i] | 0;

          // Base by hazardType
          if (ht === 1) {
            // lava
            r = 220;
            g = 90;
            b = 35;
          } else if (ht === 2) {
            // poison gas
            r = 90;
            g = 220;
            b = 90;
          } else if (ht === 3) {
            // water
            r = 80;
            g = 140;
            b = 230;
          } else if (ht === 4) {
            // spikes
            r = 180;
            g = 180;
            b = 180;
          } else {
            // unknown hazard
            r = 230;
            g = 80;
            b = 200;
          }

          // Overlay enabled/disabled state
          if (runtime && showStateOverlay) {
            const hazardId = fid[i] | 0;
            const enabled = !!runtime.hazards?.[hazardId]?.enabled;

            if (!enabled) {
              // muted when disabled
              r = Math.round(r * 0.55);
              g = Math.round(g * 0.55);
              b = Math.round(b * 0.55);
            }
          }
        } else {
          // key / lever / unknown future
          r = 230;
          g = 200;
          b = 70;
        }

        // Draw blocks on top (they move)
        if (runtime && blockOcc[i]) {
          // warm “wood” tone
          r = 140;
          g = 105;
          b = 60;
          if (selectedOcc[i]) {
            // highlight selected
            r = 210;
            g = 170;
            b = 90;
          }
        }

        // Keep walls visible if a feature is on a wall (secret doors are walls)
        if (isWall) {
          const br = 25,
            bg = 25,
            bb = 25;
          r = Math.round(br * 0.4 + r * 0.6);
          g = Math.round(bg * 0.4 + g * 0.6);
          b = Math.round(bb * 0.4 + b * 0.6);
        }
      }

      data[o + 0] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }

  return img;
}

const App: React.FC = () => {
  // --- Inputs ---
  const [width, setWidth] = useState(96);
  const [height, setHeight] = useState(64);
  const [seed, setSeed] = useState("seed-1234");

  const [maxDepth, setMaxDepth] = useState(9);
  const [minLeafSize, setMinLeafSize] = useState(16);
  const [maxLeafSize, setMaxLeafSize] = useState(26);
  const [splitPadding, setSplitPadding] = useState(1);

  const [roomPadding, setRoomPadding] = useState(2);
  const [minRoomSize, setMinRoomSize] = useState(6);
  const [maxRoomSize, setMaxRoomSize] = useState(18);
  const [roomFillLeafChance, setRoomFillLeafChance] = useState(0.08);

  const [corridorWidth, setCorridorWidth] = useState(1);
  const [keepOuterWalls, setKeepOuterWalls] = useState(true);

  const [layer, setLayer] = useState<Layer>("content");
  const [scale, setScale] = useState(6);

  // --- Output ---
  const [ascii, setAscii] = useState<string>("");

  const [content, setContent] = useState<ReturnType<
    typeof generateDungeonContent
  > | null>(null);
  const [runtime, setRuntime] = useState<DungeonRuntimeState | null>(null);
  const [circuitDebug, setCircuitDebug] = useState<CircuitEvalResult["debug"]>(
    {},
  );
  const [showStateOverlay, setShowStateOverlay] = useState(true);

  const [imageDataByLayer, setImageDataByLayer] = useState<{
    solid: ImageData | null;
    regionId: ImageData | null;
    distanceToWall: ImageData | null;

    content: ImageData | null;

    featureType: ImageData | null;
    featureId: ImageData | null;
    featureParam: ImageData | null;
    danger: ImageData | null;
    lootTier: ImageData | null;

    hazardType: ImageData | null;
  }>({
    solid: null,
    regionId: null,
    distanceToWall: null,

    content: null,

    featureType: null,
    featureId: null,
    featureParam: null,
    danger: null,
    lootTier: null,

    hazardType: null,
  });

  const [meta, setMeta] = useState<{
    seedUsed: number;
    rooms: number;
    corridors: number;
    bspDepth: number;

    entranceRoomId: number;
    farthestRoomId: number;
    mainPathRooms: number;

    monsters: number;
    chests: number;
    secrets: number;

    doors: number;
    keys: number;
    levers: number;
    plates: number;
    blocks: number;
  } | null>(null);

  // Keep latest generator outputs around for tooltip lookups
  const dungeonRef = useRef<ReturnType<typeof generateBspDungeon> | null>(null);
  const contentRef = useRef<ReturnType<typeof generateDungeonContent> | null>(
    null,
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);

  // Hover tooltip state
  const hoverTimerRef = useRef<number | null>(null);
  const lastHoverCellRef = useRef<{ x: number; y: number } | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    lines: string[];
    featureType: number;
    featureId: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    screenX: 0,
    screenY: 0,
    lines: [],
    featureType: 0,
    featureId: 0,
  });

  const opts = useMemo(
    () => ({
      width,
      height,
      seed,
      maxDepth,
      minLeafSize,
      maxLeafSize,
      splitPadding,
      roomPadding,
      minRoomSize,
      maxRoomSize,
      roomFillLeafChance,
      corridorWidth,
      keepOuterWalls,
    }),
    [
      width,
      height,
      seed,
      maxDepth,
      minLeafSize,
      maxLeafSize,
      splitPadding,
      roomPadding,
      minRoomSize,
      maxRoomSize,
      roomFillLeafChance,
      corridorWidth,
      keepOuterWalls,
    ],
  );

  const applyRuntime = React.useCallback((next: DungeonRuntimeState) => {
    const content = contentRef.current;
    if (!content) {
      setRuntime(next);
      return;
    }
    // DERIVED: plates come from block occupancy
    const derived = derivePlatesFromBlocks(next, content);
    const res = evaluateCircuits(derived, content.meta.circuits);
    setRuntime(res.next);
    setCircuitDebug(res.debug);
  }, []);

  const regenerateRuntimeFromContent = React.useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    const initialRuntime = initDungeonRuntimeState(content);
    const derived = derivePlatesFromBlocks(initialRuntime, content);
    const evalOut = evaluateCircuits(derived, content.meta.circuits);

    setRuntime(evalOut.next);
    setCircuitDebug(evalOut.debug);
  }, []);

  const generate = React.useCallback(() => {
    const out = generateBspDungeon(opts);
    const content = generateDungeonContent(out);

    const initialRuntime = initDungeonRuntimeState(content);
    const derived = derivePlatesFromBlocks(initialRuntime, content);
    const evalOut = evaluateCircuits(derived, content.meta.circuits);

    setRuntime(evalOut.next);
    setCircuitDebug(evalOut.debug);
    setSelectedBlockId(null);

    const composite = makeContentCompositeImageData(
      out,
      content,
      evalOut.next,
      showStateOverlay,
      null,
    );

    dungeonRef.current = out;
    contentRef.current = content;

    setContent(content);
    setAscii(content.debug.ascii);

    setImageDataByLayer({
      solid: out.debug.imageData.solid,
      regionId: out.debug.imageData.regionId,
      distanceToWall: out.debug.imageData.distanceToWall,

      content: composite,

      featureType: content.debug.imageData.featureType,
      featureId: content.debug.imageData.featureId,
      featureParam: content.debug.imageData.featureParam,
      danger: content.debug.imageData.danger,
      lootTier: content.debug.imageData.lootTier,

      hazardType: content.debug.imageData.hazardType,
    });

    setMeta({
      seedUsed: out.meta.seedUsed,
      rooms: out.meta.rooms.length,
      corridors: out.meta.corridors.length,
      bspDepth: out.meta.bspDepth,

      entranceRoomId: content.meta.entranceRoomId,
      farthestRoomId: content.meta.farthestRoomId,
      mainPathRooms: content.meta.mainPathRoomIds.length,

      monsters: content.meta.monsters.length,
      chests: content.meta.chests.length,
      secrets: content.meta.secrets.length,

      doors: content.meta.doors.length,
      keys: content.meta.keys.length,
      levers: content.meta.levers.length,
      plates: content.meta.plates.length,
      blocks: content.meta.blocks.length,
    });
  }, [opts, showStateOverlay]);

  // initial generation
  useEffect(() => {
    generate();
  }, [generate]);

  // recompute composite when runtime overlay changes
  useEffect(() => {
    const dungeon = dungeonRef.current;
    const content = contentRef.current;
    if (!dungeon || !content) return;

    const composite = makeContentCompositeImageData(
      dungeon,
      content,
      runtime,
      showStateOverlay,
      selectedBlockId,
    );

    setImageDataByLayer((prev) => ({
      ...prev,
      content: composite,
    }));
  }, [runtime, showStateOverlay, selectedBlockId]);

  // Keyboard push: select a block (click), then WASD/Arrows to push
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (selectedBlockId == null) return;
      const dungeon = dungeonRef.current;
      const content = contentRef.current;
      const r = runtime;
      if (!dungeon || !content || !r) return;

      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          dy = -1;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dy = 1;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dx = -1;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dx = 1;
          break;
        case "Escape":
          setSelectedBlockId(null);
          return;
      }

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        const res = tryPushBlock(r, dungeon, content, selectedBlockId, dx, dy);
        if (res.ok) applyRuntime(res.next);
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false } as any);
    return () => window.removeEventListener("keydown", onKeyDown as any);
  }, [runtime, selectedBlockId, applyRuntime]);

  // redraw canvas whenever layer changes or new images arrive
  useEffect(() => {
    const img = imageDataByLayer[layer];
    drawToCanvas(canvasRef.current, img);
  }, [layer, imageDataByLayer]);

  const currentImageData = imageDataByLayer[layer];

  // Set displayed size via inline px (reliable across browsers)
  const canvasStyle: React.CSSProperties = {
    width: currentImageData ? currentImageData.width * scale : 0,
    height: currentImageData ? currentImageData.height * scale : 0,
  };

  function clearHoverTimer() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function hideTooltip() {
    clearHoverTimer();
    lastHoverCellRef.current = null;
    setTooltip((t) => ({ ...t, visible: false }));
  }

  function buildTooltipLines(x: number, y: number): string[] {
    const dungeon = dungeonRef.current;
    const content = contentRef.current;
    if (!dungeon || !content) return [];

    const W = dungeon.width;
    const H = dungeon.height;
    if (x < 0 || y < 0 || x >= W || y >= H) return [];

    const i = idxOf(W, x, y);

    const solid = dungeon.masks.solid[i];
    const regionId = dungeon.masks.regionId[i];
    const dist = dungeon.masks.distanceToWall[i];

    let ft = content.masks.featureType[i];
    let fid = content.masks.featureId[i];
    const fparam = content.masks.featureParam[i];
    // If a runtime block is at this cell, treat it as the active feature for tooltip purposes
    if (runtime?.blocks) {
      for (const [idStr, b] of Object.entries(runtime.blocks)) {
        const id = Number(idStr);
        if (b.x === x && b.y === y) {
          ft = 8;
          fid = id;
          break;
        }
      }
    }

    const dng = content.masks.danger[i];
    const tier = content.masks.lootTier[i];
    const hz = content.masks.hazardType[i];

    const lines: string[] = [];
    lines.push(`Cell: (${x}, ${y})`);
    lines.push(`Terrain: ${solid === 255 ? "Wall" : "Floor"}`);
    lines.push(`regionId: ${regionId}`);
    lines.push(`distanceToWall: ${dist}`);

    lines.push(`featureType: ${ft} (${featureName(ft)})`);
    lines.push(`featureId: ${fid}`);

    if (ft === 4) {
      lines.push(`featureParam: ${fparam} (Door: ${doorKindName(fparam)})`);
    } else if (fparam !== 0) {
      lines.push(`featureParam: ${fparam}`);
    }

    if (ft === 4 && runtime && showStateOverlay && fid !== 0) {
      const { isOpen, isLocked } = readDoorState(runtime, fid);
      lines.push(
        `Door state: ${isOpen ? "OPEN" : "CLOSED"}${isLocked ? " (LOCKED)" : ""}`,
      );
    }

    if (ft === 1) lines.push(`danger: ${dng}`);
    if (ft === 2) lines.push(`lootTier: ${tier}`);
    if (ft === 10) lines.push(`hazardType: ${hz}`);

    // Plate details (Milestone 3)
    if (ft === 7 && fid !== 0) {
      const plate = content.meta.plates.find((p) => p.id === fid);
      if (plate) {
        lines.push(`Plate mode: ${plate.mode}`);
        lines.push(
          `Plate triggers: player=${plate.activatedByPlayer ? "Y" : "N"}, block=${plate.activatedByBlock ? "Y" : "N"}`,
        );
        if (plate.inverted) lines.push(`Plate: inverted`);
        if (runtime && showStateOverlay) {
          lines.push(
            `Plate pressed (derived): ${runtime.plates?.[fid]?.pressed ? "YES" : "NO"}`,
          );
        }
      } else {
        lines.push(`Plate: id ${fid}`);
      }
    }

    if (ft === 8 && fid !== 0) {
      const b = runtime?.blocks?.[fid];
      if (b) {
        lines.push(`Block: id ${fid}`);
        lines.push(`Block pos: (${b.x}, ${b.y})`);
        lines.push(`Block weightClass: ${b.weightClass ?? 0}`);
        lines.push("Click: select block");
        lines.push("WASD / Arrows: push selected");
        lines.push("Esc: clear selection");
      } else {
        lines.push(`Block: id ${fid}`);
      }
    }

    // relationship hints
    if (ft === 5 && fid !== 0) lines.push(`Hint: key unlocks circuit ${fid}`);
    if (ft === 6 && fid !== 0)
      lines.push(`Hint: lever controls circuit ${fid}`);
    if (ft === 4 && fid !== 0) lines.push(`Circuit: door id ${fid}`);
    if (ft === 7 && fid !== 0) lines.push(`Circuit: plate id ${fid}`);

    // interaction hint
    if (ft === 5) lines.push("Click: collect key");
    if (ft === 6) lines.push("Click: toggle lever");
    if (ft === 7) lines.push("Click: toggle plate (debug)");
    if (ft === 4) lines.push("Click: toggle door (debug)");

    return lines;
  }

  function getCellFromMouseEvent(e: React.MouseEvent): {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
  } | null {
    const img = currentImageData;
    if (!img) return null;

    const panel = canvasPanelRef.current;
    if (!panel) return null;

    const rect = panel.getBoundingClientRect();

    // Mouse coords relative to the *displayed* canvas area inside the panel
    const localX = e.clientX - rect.left - 12; // panel padding is 12px (matches CSS)
    const localY = e.clientY - rect.top - 12;

    if (localX < 0 || localY < 0) return null;

    const x = Math.floor(localX / scale);
    const y = Math.floor(localY / scale);

    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null;

    return { x, y, screenX: e.clientX, screenY: e.clientY };
  }

  function onCanvasMouseMove(e: React.MouseEvent) {
    const cell = getCellFromMouseEvent(e);
    if (!cell) {
      hideTooltip();
      return;
    }

    setTooltip((t) => ({
      ...t,
      x: cell.x,
      y: cell.y,
      screenX: cell.screenX,
      screenY: cell.screenY,
    }));

    const last = lastHoverCellRef.current;
    if (last && last.x === cell.x && last.y === cell.y) return;

    lastHoverCellRef.current = { x: cell.x, y: cell.y };
    clearHoverTimer();
    setTooltip((t) => ({ ...t, visible: false }));

    hoverTimerRef.current = window.setTimeout(() => {
      const dungeon = dungeonRef.current;
      const content = contentRef.current;
      if (!dungeon || !content) return;

      const i = idxOf(dungeon.width, cell.x, cell.y);
      const ft = content.masks.featureType[i] | 0;
      const fid = content.masks.featureId[i] | 0;

      const lines = buildTooltipLines(cell.x, cell.y);

      setTooltip((t) => ({
        ...t,
        visible: true,
        x: cell.x,
        y: cell.y,
        screenX: cell.screenX,
        screenY: cell.screenY,
        lines,
        featureType: ft,
        featureId: fid,
      }));
    }, 350);
  }

  function onCanvasMouseLeave() {
    hideTooltip();
  }

  function onCanvasClick(e: React.MouseEvent) {
    const dungeon = dungeonRef.current;
    const content = contentRef.current;
    if (!dungeon || !content) return;
    if (!runtime) return;

    const cell = getCellFromMouseEvent(e);
    if (!cell) return;

    const i = idxOf(dungeon.width, cell.x, cell.y);
    const ft = content.masks.featureType[i] | 0;
    const fid = content.masks.featureId[i] | 0;

    // If you clicked a runtime block, select it (blocks move; masks don't)
    if (runtime?.blocks) {
      for (const [idStr, b] of Object.entries(runtime.blocks)) {
        const id = Number(idStr);
        if (b.x === cell.x && b.y === cell.y) {
          setSelectedBlockId(id);
          return;
        }
      }
    }

    if (fid === 0) return;

    // Click interactions are purely debug/runtime-driving for Milestone 3 overlay testing.
    if (ft === 5) {
      // Key
      const next = collectKey(runtime, fid);
      applyRuntime(next);
      return;
    }

    if (ft === 6) {
      // Lever
      const next = toggleLever(runtime, fid);
      applyRuntime(next);
      return;
    }

    if (ft === 7) {
      // Pressure plate (debug): toggle pressed state
      const next = togglePlate(runtime, fid);
      applyRuntime(next);
      return;
    }
    // Plates are derived now; no click toggling.

    if (ft === 4) {
      // Door (debug convenience): toggle door state directly.
      // If you have a dedicated dungeonState helper later, swap it in here.
      const next = structuredClone(runtime) as DungeonRuntimeState;
      const door = next.doors?.[fid];
      if (door) {
        (door as any).isOpen = !(door as any).isOpen;
        // clearing forcedOpen is usually sensible when manually toggling
        if ("forcedOpen" in (door as any)) (door as any).forcedOpen = false;
        applyRuntime(next);
      }
      return;
    }
  }

  const imgForDownload = imageDataByLayer[layer];

  // Lightweight circuit debug rendering
  const circuitDebugKeys = useMemo(() => {
    try {
      return Object.keys(circuitDebug ?? {});
    } catch {
      return [];
    }
  }, [circuitDebug]);

  return (
    <div className="maze-app">
      {/* Left: Controls */}
      <div className="maze-controls">
        <div className="maze-header-row">
          <h2 className="maze-title">Maze / Dungeon Preview</h2>
        </div>

        <div className="maze-controls-row">
          <button className="maze-btn" onClick={generate}>
            Generate
          </button>

          <button
            className="maze-btn"
            onClick={regenerateRuntimeFromContent}
            disabled={!content}
            title="Reset runtime state from current generated content"
          >
            Reset Runtime
          </button>

          <button
            className="maze-btn"
            onClick={() => {
              const img = imgForDownload;
              if (!img) return;
              const dataUrl = imageDataToPngDataUrl(img);
              downloadDataUrl(`dungeon-${layer}.png`, dataUrl);
            }}
            disabled={!imgForDownload}
            title="Download current layer as PNG"
          >
            Download PNG
          </button>
        </div>

        <div className="maze-grid">
          <label className="maze-field">
            <span>Width</span>
            <input
              type="number"
              value={width}
              min={16}
              max={512}
              onChange={(e) =>
                setWidth(clampInt(Number(e.target.value || 0), 16, 512))
              }
            />
          </label>

          <label className="maze-field">
            <span>Height</span>
            <input
              type="number"
              value={height}
              min={16}
              max={512}
              onChange={(e) =>
                setHeight(clampInt(Number(e.target.value || 0), 16, 512))
              }
            />
          </label>

          <label className="maze-field maze-field--seed">
            <span>Seed</span>
            <div className="maze-seed-row">
              <input value={seed} onChange={(e) => setSeed(e.target.value)} />
              <button
                onClick={() =>
                  setSeed(`seed-${Math.random().toString(16).slice(2)}`)
                }
                title="Randomize seed string"
              >
                🎲
              </button>
            </div>
          </label>
        </div>

        <details open>
          <summary className="maze-summary">BSP</summary>

          <div className="maze-grid">
            <label className="maze-field">
              <span>Max Depth</span>
              <input
                type="number"
                value={maxDepth}
                min={1}
                max={20}
                onChange={(e) =>
                  setMaxDepth(clampInt(Number(e.target.value || 0), 1, 40))
                }
              />
            </label>

            <label className="maze-field">
              <span>Min Leaf Size</span>
              <input
                type="number"
                value={minLeafSize}
                min={4}
                max={128}
                onChange={(e) =>
                  setMinLeafSize(clampInt(Number(e.target.value || 0), 4, 256))
                }
              />
            </label>

            <label className="maze-field">
              <span>Max Leaf Size</span>
              <input
                type="number"
                value={maxLeafSize}
                min={4}
                max={256}
                onChange={(e) =>
                  setMaxLeafSize(clampInt(Number(e.target.value || 0), 4, 256))
                }
              />
            </label>

            <label className="maze-field">
              <span>Split Padding</span>
              <input
                type="number"
                value={splitPadding}
                min={0}
                max={8}
                onChange={(e) =>
                  setSplitPadding(clampInt(Number(e.target.value || 0), 0, 32))
                }
              />
            </label>

            <label className="maze-field">
              <span>Room Padding</span>
              <input
                type="number"
                value={roomPadding}
                min={0}
                max={8}
                onChange={(e) =>
                  setRoomPadding(clampInt(Number(e.target.value || 0), 0, 32))
                }
              />
            </label>

            <label className="maze-field">
              <span>Min Room Size</span>
              <input
                type="number"
                value={minRoomSize}
                min={2}
                max={128}
                onChange={(e) =>
                  setMinRoomSize(clampInt(Number(e.target.value || 0), 2, 256))
                }
              />
            </label>

            <label className="maze-field">
              <span>Max Room Size</span>
              <input
                type="number"
                value={maxRoomSize}
                min={2}
                max={256}
                onChange={(e) =>
                  setMaxRoomSize(clampInt(Number(e.target.value || 0), 2, 256))
                }
              />
            </label>

            <label className="maze-field">
              <span>Room Fill Chance</span>
              <input
                type="number"
                step={0.01}
                value={roomFillLeafChance}
                min={0}
                max={1}
                onChange={(e) =>
                  setRoomFillLeafChance(
                    Math.max(0, Math.min(1, Number(e.target.value || 0))),
                  )
                }
              />
            </label>

            <label className="maze-field">
              <span>Corridor Width</span>
              <input
                type="number"
                value={corridorWidth}
                min={1}
                max={8}
                onChange={(e) =>
                  setCorridorWidth(clampInt(Number(e.target.value || 0), 1, 32))
                }
              />
            </label>

            <label className="maze-checkbox">
              <input
                type="checkbox"
                checked={keepOuterWalls}
                onChange={(e) => setKeepOuterWalls(e.target.checked)}
              />
              <span>Keep outer walls</span>
            </label>

            <label className="maze-checkbox">
              <input
                type="checkbox"
                checked={showStateOverlay}
                onChange={(e) => setShowStateOverlay(e.target.checked)}
              />
              <span>Show state overlay</span>
            </label>
          </div>
        </details>

        <details open>
          <summary className="maze-summary">Stats</summary>
          <div className="maze-stats">
            {meta ? (
              <div className="maze-stats-grid">
                <div>
                  <b>Seed used</b>: {meta.seedUsed}
                </div>
                <div>
                  <b>BSP depth</b>: {meta.bspDepth}
                </div>
                <div>
                  <b>Rooms</b>: {meta.rooms}
                </div>
                <div>
                  <b>Corridors</b>: {meta.corridors}
                </div>

                <div style={{ height: 8 }} />

                <div>
                  <b>Entrance room</b>: {meta.entranceRoomId}
                </div>
                <div>
                  <b>Farthest room</b>: {meta.farthestRoomId}
                </div>
                <div>
                  <b>Main path rooms</b>: {meta.mainPathRooms}
                </div>
                <div>
                  <b>Monsters</b>: {meta.monsters}
                </div>
                <div>
                  <b>Chests</b>: {meta.chests}
                </div>
                <div>
                  <b>Secrets</b>: {meta.secrets}
                </div>

                <div style={{ height: 8 }} />

                <div>
                  <b>Doors</b>: {meta.doors}
                </div>
                <div>
                  <b>Keys</b>: {meta.keys}
                </div>
                <div>
                  <b>Levers</b>: {meta.levers}
                </div>
                <div>
                  <b>Plates</b>: {meta.plates}
                </div>
              </div>
            ) : (
              <div>Generating…</div>
            )}
          </div>
        </details>

        <details>
          <summary className="maze-summary">ASCII preview</summary>
          <pre className="maze-ascii-pre">{ascii}</pre>
        </details>

        {content && (
          <div className="panel">
            <div className="panelTitle">Circuits</div>

            {content.meta.circuits.length === 0 ? (
              <div className="muted">No circuits.</div>
            ) : (
              <div className="circuitsList">
                {content.meta.circuits.map((c) => (
                  <div key={c.id} className="circuitCard">
                    <div className="circuitHeader">
                      <span className="mono">#{c.id}</span>{" "}
                      <span className="muted">
                        {c.logic.type}
                        {c.logic.type === "THRESHOLD"
                          ? `(${c.logic.threshold})`
                          : ""}
                        {" · "}
                        {c.behavior.mode}
                      </span>
                    </div>

                    <div className="circuitRow">
                      <div className="circuitLabel">Triggers</div>
                      <div className="circuitItems mono">
                        {c.triggers.map((t, i) => (
                          <span key={i}>
                            {t.kind}:{t.refId}
                            {i < c.triggers.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="circuitRow">
                      <div className="circuitLabel">Targets</div>
                      <div className="circuitItems mono">
                        {c.targets.map((t, i) => (
                          <span key={i}>
                            {t.kind}:{t.refId}→{t.effect}
                            {i < c.targets.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: 12 }} />

            <details>
              <summary className="maze-summary">Circuit Debug</summary>
              {circuitDebugKeys.length === 0 ? (
                <div className="muted">No debug entries.</div>
              ) : (
                <div
                  className="mono"
                  style={{ fontSize: 12, lineHeight: 1.35 }}
                >
                  {circuitDebugKeys.slice(0, 60).map((k) => (
                    <div key={k}>
                      {k}: {JSON.stringify((circuitDebug as any)[k])}
                    </div>
                  ))}
                  {circuitDebugKeys.length > 60 ? (
                    <div className="muted">
                      (showing first 60 of {circuitDebugKeys.length})
                    </div>
                  ) : null}
                </div>
              )}
            </details>
          </div>
        )}
      </div>

      {/* Right: Preview */}
      <div className="maze-preview">
        <div className="maze-preview-toolbar">
          <div className="maze-tabs">
            <button
              onClick={() => setLayer("content")}
              className={`maze-tab ${layer === "content" ? "maze-tab--active" : ""}`}
            >
              content
            </button>

            <button
              onClick={() => setLayer("solid")}
              className={`maze-tab ${layer === "solid" ? "maze-tab--active" : ""}`}
            >
              solid
            </button>

            <button
              onClick={() => setLayer("regionId")}
              className={`maze-tab ${layer === "regionId" ? "maze-tab--active" : ""}`}
            >
              regionId
            </button>

            <button
              onClick={() => setLayer("distanceToWall")}
              className={`maze-tab ${layer === "distanceToWall" ? "maze-tab--active" : ""}`}
            >
              distanceToWall
            </button>

            <button
              onClick={() => setLayer("featureType")}
              className={`maze-tab ${layer === "featureType" ? "maze-tab--active" : ""}`}
            >
              featureType
            </button>

            <button
              onClick={() => setLayer("featureParam")}
              className={`maze-tab ${layer === "featureParam" ? "maze-tab--active" : ""}`}
            >
              featureParam
            </button>

            <button
              onClick={() => setLayer("danger")}
              className={`maze-tab ${layer === "danger" ? "maze-tab--active" : ""}`}
            >
              danger
            </button>

            <button
              onClick={() => setLayer("lootTier")}
              className={`maze-tab ${layer === "lootTier" ? "maze-tab--active" : ""}`}
            >
              lootTier
            </button>

            <button
              onClick={() => setLayer("featureId")}
              className={`maze-tab ${layer === "featureId" ? "maze-tab--active" : ""}`}
            >
              featureId
            </button>

            <button
              onClick={() => setLayer("hazardType")}
              className={`maze-tab ${layer === "hazardType" ? "maze-tab--active" : ""}`}
            >
              hazardType
            </button>
          </div>

          <label className="maze-scale">
            <span>Scale</span>
            <input
              type="range"
              min={1}
              max={16}
              value={scale}
              onChange={(e) =>
                setScale(clampInt(Number(e.target.value || 0), 1, 32))
              }
            />
            <span className="maze-scale-value">{scale}×</span>
          </label>
        </div>

        <div
          ref={canvasPanelRef}
          className="maze-canvas-panel"
          onMouseMove={onCanvasMouseMove}
          onMouseLeave={onCanvasMouseLeave}
          onClick={onCanvasClick}
          title="Hover for tooltip. Click keys/levers/doors to update runtime."
        >
          <canvas ref={canvasRef} className="maze-canvas" style={canvasStyle} />

          {tooltip.visible && (
            <div
              className="maze-tooltip"
              style={{
                left: tooltip.screenX + 14,
                top: tooltip.screenY + 14,
              }}
            >
              {tooltip.lines.map((ln, i) => (
                <div key={i} className="maze-tooltip-line">
                  {ln}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="maze-legend">
          <div>
            <b>Layer</b>: {layer}
          </div>
          <div>
            <b>Legend</b>:{" "}
            {layer === "content"
              ? "Walls/floors base + overlay: red=monsters, green=chests, brown=doors, yellow=keys/levers/other"
              : layer === "solid"
                ? "white=wall, black=floor"
                : layer === "regionId"
                  ? "grayscale room id (0=not room)"
                  : layer === "distanceToWall"
                    ? "grayscale Manhattan distance (0=wall)"
                    : layer === "featureType"
                      ? "0=none, 1=monster, 2=chest, 3=secretDoor, 4=door, 5=key, 6=lever, 7=pressurePlate, 8=pushBlock, 9=hiddenPassage, 10=hazard"
                      : layer === "featureParam"
                        ? "door kind / feature subtype (e.g. 1=locked door, 2=lever door)"
                        : layer === "danger"
                          ? "monster danger/level (0..255)"
                          : layer === "lootTier"
                            ? "chest tier (1..N)"
                            : layer === "hazardType"
                              ? "hazard kind (0=none, 1=lava, 2=poison gas, 3=water, 4=spikes)"
                              : "feature instance/circuit id (1..255)"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
