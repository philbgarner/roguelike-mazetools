// src/inspect/InspectionShell.tsx
//
// Milestone 5 — UI Wizard Refactor (rev S)
// Step 7 ONLY: inspection shell for a single generated dungeon.
//
// Contract:
// - No generation controls here.
// - No batch mode here.
// - Local-only inspection state (layer/scale/tooltips/selection).
// - Any upstream wizard change should unmount this component entirely.
//
// This is an adapter carved from the old App.tsx inspection logic.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BspDungeonOutputs, ContentOutputs } from "../mazeGen";
import { imageDataToPngDataUrl } from "../mazeGen";
import DungeonRenderView from "../rendering/DungeonRenderView";
import type { DungeonRuntimeState } from "../dungeonState";
import { CP437_TILES } from "../rendering/codepage437Tiles";
import {
  collectKey,
  toggleLever,
  derivePlatesFromBlocks,
  tryPushBlock,
  initDungeonRuntimeState,
} from "../dungeonState";
import type {
  CircuitEvalDiagnostics,
  CircuitEvalResult,
} from "../evaluateCircuits";
import { evaluateCircuits } from "../evaluateCircuits";

import CircuitDiagnosticsSection from "../debug/CircuitDiagnosticsSection";
import type {
  CircuitDiagFilters,
  CircuitDiagSort,
} from "../debug/circuitDiagnosticsVM";

import RoleDiagnosticsSection from "../debug/RoleDiagnosticsSection";
import type { RoleDiagnosticsV1 } from "../roleDiagnostics";
import { analyzeRoleDiagnosticsV1 } from "../roleDiagnostics";

// ----------------------------- Types -----------------------------------------

type InspectPane = "content" | "render";

export type Layer =
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

export type InspectionShellSingleResult = {
  dungeon: BspDungeonOutputs;
  content: ContentOutputs;
  runtime0: DungeonRuntimeState;
  circuitDiagnostics0: CircuitEvalDiagnostics | null;
  circuitDebug0: CircuitEvalResult["debug"] | null;
};

export type InspectionShellProps = {
  result: InspectionShellSingleResult;

  /** Optional: show a "Back" button (App shell decides what it does). */
  onBack?: () => void;

  /** Optional: download handler hook (defaults to in-browser download). */
  onDownloadPng?: (filename: string, dataUrl: string) => void;

  /** Optional: title */
  title?: string;

  onRandomizeSeedAndRegenerate?: () => void;
};

// ----------------------------- Helpers --------------------------------------

function clampInt(v: number, lo: number, hi: number) {
  const x = v | 0;
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  a.click();
}

function rgba(r: number, g: number, b: number, a = 255) {
  return [r, g, b, a] as const;
}

// Canonical 16-color palette (rev R / unchanged)
// (Copied from App.tsx so InspectionShell is standalone.)
const PAL = {
  bg: rgba(18, 18, 18),
  wall: rgba(38, 38, 38),
  floor: rgba(180, 180, 180),
  corridor: rgba(145, 145, 145),

  entrance: rgba(0, 255, 255),
  exit: rgba(175, 0, 255),

  doorClosed: rgba(255, 120, 0),
  doorOpen: rgba(0, 200, 80),
  doorLocked: rgba(200, 50, 50),

  key: rgba(255, 235, 80),
  lever: rgba(80, 170, 255),
  plate: rgba(200, 200, 255),
  block: rgba(220, 140, 255),

  secret: rgba(110, 110, 255),
  hazard: rgba(255, 70, 90),
  loot: rgba(255, 210, 150),
} as const;

function palToCss(c: readonly [number, number, number, number]) {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] / 255})`;
}

function featureTypeName(ft: number) {
  switch (ft | 0) {
    case 0:
      return "none";
    case 1:
      return "monster";
    case 2:
      return "chest";
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

function computeStartCellFromEntranceRoom(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
): {
  x: number;
  y: number;
} {
  const w = dungeon.width;
  const h = dungeon.height;

  const entranceRoomId = content.meta.entranceRoomId;
  const regionId = dungeon.masks.regionId;
  const solid = dungeon.masks.solid;

  // fallback if something is missing
  let fallback = { x: Math.floor(w / 2), y: Math.floor(h / 2) };

  if (!entranceRoomId || entranceRoomId <= 0) return fallback;

  let eMinX = 1e9,
    eMinY = 1e9,
    eMaxX = -1,
    eMaxY = -1;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (regionId[i] === entranceRoomId) {
        found = true;
        if (x < eMinX) eMinX = x;
        if (y < eMinY) eMinY = y;
        if (x > eMaxX) eMaxX = x;
        if (y > eMaxY) eMaxY = y;
      }
    }
  }

  if (!found) return fallback;

  // center of entrance bounds
  let cx = Math.floor((eMinX + eMaxX) / 2);
  let cy = Math.floor((eMinY + eMaxY) / 2);
  let ci = cy * w + cx;

  // ensure floor
  if (ci >= 0 && ci < solid.length && solid[ci] === 0) {
    return { x: cx, y: cy };
  }

  // If center isn't floor, search nearby (small spiral-ish scan)
  const R = 8;
  for (let r = 1; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const i = y * w + x;
        if (solid[i] === 0) return { x, y };
      }
    }
  }

  return fallback;
}

// Extract ids from "anything" that might be a circuit node/edge descriptor.
function extractIdsDeep(obj: any, out: number[]) {
  if (!obj) return;
  if (typeof obj === "number" && Number.isFinite(obj)) {
    out.push(obj | 0);
    return;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) extractIdsDeep(it, out);
    return;
  }
  if (typeof obj === "object") {
    // common id keys
    for (const k of [
      "id",
      "doorId",
      "leverId",
      "plateId",
      "keyId",
      "blockId",
      "featureId",
    ]) {
      const v = (obj as any)[k];
      if (typeof v === "number" && Number.isFinite(v)) out.push(v | 0);
    }
    // traverse a few likely containers
    for (const k of Object.keys(obj)) {
      const v = (obj as any)[k];
      if (v && (typeof v === "object" || Array.isArray(v)))
        extractIdsDeep(v, out);
    }
  }
}

type CircuitMembership = {
  circuitIndex: number;
  circuitId: number;
  as: "trigger" | "target";
  kind: string;
  effect?: string;
};

function findCircuitsForFeatureExact(
  circuits: any[],
  ft: number,
  fid: number,
): CircuitMembership[] {
  if (!Array.isArray(circuits) || !fid) return [];

  // Map featureType -> trigger kind
  const triggerKind =
    ft === 6 ? "LEVER" : ft === 5 ? "KEY" : ft === 7 ? "PLATE" : null;

  // Map featureType -> target kind
  const targetKind =
    ft === 4 ? "DOOR" : ft === 10 ? "HAZARD" : ft === 9 ? "HIDDEN" : null;

  const out: CircuitMembership[] = [];

  for (let circuitIndex = 0; circuitIndex < circuits.length; circuitIndex++) {
    const c = circuits[circuitIndex];
    const circuitId = (c?.id ?? circuitIndex) | 0;

    // triggers
    if (triggerKind && Array.isArray(c?.triggers)) {
      for (const t of c.triggers) {
        if (t?.kind === triggerKind && ((t?.refId ?? -1) | 0) === (fid | 0)) {
          out.push({
            circuitIndex,
            circuitId,
            as: "trigger",
            kind: String(t.kind),
          });
        }
      }
    }

    // targets
    if (targetKind && Array.isArray(c?.targets)) {
      for (const t of c.targets) {
        if (t?.kind === targetKind && ((t?.refId ?? -1) | 0) === (fid | 0)) {
          out.push({
            circuitIndex,
            circuitId,
            as: "target",
            kind: String(t.kind),
            effect: t?.effect ? String(t.effect) : undefined,
          });
        }
      }
    }
  }

  return out;
}

// Door state derivation helper (copied from App.tsx comment + usage)
function readDoorState(
  runtime: DungeonRuntimeState,
  doorId: number,
): { isOpen: boolean; forcedOpen?: boolean } {
  const d = runtime.doors[doorId];
  if (!d) return { isOpen: false };
  return { isOpen: !!d.isOpen, forcedOpen: d.forcedOpen };
}

function getCanvasCellFromMouse(
  e: React.MouseEvent,
  canvasEl: HTMLCanvasElement | null,
  scale: number,
) {
  if (!canvasEl) return null;

  const rect = canvasEl.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const x = Math.floor(sx / scale);
  const y = Math.floor(sy / scale);

  return { x, y, localX: sx, localY: sy };
}

function setPixel(
  img: ImageData,
  x: number,
  y: number,
  c: readonly [number, number, number, number],
) {
  const idx = (y * img.width + x) * 4;
  img.data[idx + 0] = c[0];
  img.data[idx + 1] = c[1];
  img.data[idx + 2] = c[2];
  img.data[idx + 3] = c[3];
}

// Render a grayscale ramp
function renderScalarLayer(
  w: number,
  h: number,
  getVal: (x: number, y: number) => number,
  maxVal: number,
): ImageData {
  const img = new ImageData(w, h);
  const denom = Math.max(1, maxVal);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = clampInt(getVal(x, y), 0, denom);
      const t = Math.floor((v / denom) * 255);
      setPixel(img, x, y, rgba(t, t, t, 255));
    }
  }
  return img;
}

// Render ids with simple hash coloring (stable)
function hashColor(id: number) {
  // cheap stable hash -> 0..255
  let x = (id | 0) * 2654435761;
  x ^= x >>> 16;
  const r = (x >>> 0) & 255;
  const g = (x >>> 8) & 255;
  const b = (x >>> 16) & 255;
  return rgba(r, g, b, 255);
}

// Composite content layer: floors/walls + feature overlays
function renderContentComposite(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  runtime: DungeonRuntimeState | null,
): ImageData {
  const w = dungeon.width;
  const h = dungeon.height;
  const img = new ImageData(w, h);

  const solid = dungeon.masks.solid;
  const regionId = dungeon.masks.regionId;

  const featType = content.masks.featureType;
  const featId = content.masks.featureId;
  const hazardType = content.masks.hazardType;

  // --- Entrance/Exit bounds tracking (matches repo behavior) -----------------
  const entranceRoomId = (content.meta.entranceRoomId ?? 0) | 0;
  const exitRoomId = (content.meta.farthestRoomId ?? 0) | 0;

  let eMinX = 1e9,
    eMinY = 1e9,
    eMaxX = -1,
    eMaxY = -1;
  let eFound = false;

  let xMin = 1e9,
    yMin = 1e9,
    xMax = -1,
    yMax = -1;
  let exitFound = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // Track entrance/exit bounds while we already traverse the grid
      if (entranceRoomId > 0 && regionId[i] === entranceRoomId) {
        eFound = true;
        if (x < eMinX) eMinX = x;
        if (y < eMinY) eMinY = y;
        if (x > eMaxX) eMaxX = x;
        if (y > eMaxY) eMaxY = y;
      }
      if (exitRoomId > 0 && regionId[i] === exitRoomId) {
        exitFound = true;
        if (x < xMin) xMin = x;
        if (y < yMin) yMin = y;
        if (x > xMax) xMax = x;
        if (y > yMax) yMax = y;
      }

      // base
      if (solid[i]) {
        setPixel(img, x, y, PAL.wall);
        continue;
      }

      setPixel(img, x, y, PAL.floor);

      // overlays
      const ft = featType[i] | 0;
      const fid = featId[i] | 0;
      const hz = hazardType[i] | 0;

      if (ft !== 0) {
        // Canonical mapping (FeatureType):
        // 3 secret door (wall), 4 door (floor), 5 key, 6 lever, 7 plate, 8 block, 9 hidden passage, 10 hazard
        if (ft === 4) {
          // door
          if (runtime) {
            const ds = readDoorState(runtime, fid);
            setPixel(img, x, y, ds.isOpen ? PAL.doorOpen : PAL.doorClosed);
          } else {
            setPixel(img, x, y, PAL.doorClosed);
          }
        } else if (ft === 5) {
          setPixel(img, x, y, PAL.key);
        } else if (ft === 6) {
          setPixel(img, x, y, PAL.lever);
        } else if (ft === 7) {
          setPixel(img, x, y, PAL.plate);
        } else if (ft === 8) {
          setPixel(img, x, y, PAL.block);
        } else if (ft === 3) {
          // secret door tile (often on wall) — render as "secret"
          setPixel(img, x, y, PAL.secret);
        } else if (ft === 9) {
          // hidden passage — render as "secret" (or keep distinct later)
          setPixel(img, x, y, PAL.secret);
        } else if (ft === 10) {
          // hazard featureType itself can exist; final hazard color should still win
          setPixel(img, x, y, PAL.hazard);
        } else if (ft === 2) {
          // chest (if you use it)
          setPixel(img, x, y, PAL.loot);
        } else {
          setPixel(img, x, y, hashColor(ft * 4096 + fid));
        }
      }

      if (hz !== 0) {
        // hazard overlay wins
        setPixel(img, x, y, PAL.hazard);
      }
    }
  }

  // --- Entrance marker: cyan pixel at center of entrance room bounds ----------
  if (eFound) {
    const cx = Math.floor((eMinX + eMaxX) / 2);
    const cy = Math.floor((eMinY + eMaxY) / 2);
    const ci = cy * w + cx;
    if (ci >= 0 && ci < solid.length && !solid[ci]) {
      setPixel(img, cx, cy, PAL.entrance);
    }
  }

  // --- Exit marker: purple pixel at center of farthest room bounds ------------
  if (exitFound) {
    const cx = Math.floor((xMin + xMax) / 2);
    const cy = Math.floor((yMin + yMax) / 2);
    const ci = cy * w + cx;
    if (ci >= 0 && ci < solid.length && !solid[ci]) {
      setPixel(img, cx, cy, PAL.exit);
    }
  }

  return img;
}

function renderMaskLayer(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  layer: Layer,
  runtime: DungeonRuntimeState | null,
): ImageData {
  const w = dungeon.width;
  const h = dungeon.height;

  // Dungeon-only masks
  const solid = dungeon.masks.solid;
  const regionId = dungeon.masks.regionId;
  const dist = dungeon.masks.distanceToWall;

  // Content masks
  const ft = content.masks.featureType;
  const fid = content.masks.featureId;
  const fparam = content.masks.featureParam;
  const danger = content.masks.danger;
  const lootTier = content.masks.lootTier;
  const hz = content.masks.hazardType;

  if (layer === "solid") {
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        setPixel(img, x, y, solid[i] ? PAL.wall : PAL.floor);
      }
    return img;
  }

  if (layer === "regionId") {
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = regionId[i] | 0;
        setPixel(img, x, y, v === 0 ? PAL.bg : hashColor(v));
      }
    return img;
  }

  if (layer === "distanceToWall") {
    // compute max
    let maxV = 1;
    for (let i = 0; i < dist.length; i++) maxV = Math.max(maxV, dist[i] | 0);
    return renderScalarLayer(w, h, (x, y) => dist[y * w + x] | 0, maxV);
  }

  if (layer === "content") {
    return renderContentComposite(dungeon, content, runtime);
  }

  if (layer === "featureType") {
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = ft[i] | 0;
        setPixel(img, x, y, v === 0 ? PAL.bg : hashColor(v));
      }
    return img;
  }

  if (layer === "featureId") {
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = fid[i] | 0;
        setPixel(img, x, y, v === 0 ? PAL.bg : hashColor(v));
      }
    return img;
  }

  if (layer === "featureParam") {
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = fparam[i] | 0;
        setPixel(img, x, y, v === 0 ? PAL.bg : hashColor(v));
      }
    return img;
  }

  if (layer === "danger") {
    let maxV = 1;
    for (let i = 0; i < danger.length; i++)
      maxV = Math.max(maxV, danger[i] | 0);
    return renderScalarLayer(w, h, (x, y) => danger[y * w + x] | 0, maxV);
  }

  if (layer === "lootTier") {
    let maxV = 1;
    for (let i = 0; i < lootTier.length; i++)
      maxV = Math.max(maxV, lootTier[i] | 0);
    return renderScalarLayer(w, h, (x, y) => lootTier[y * w + x] | 0, maxV);
  }

  // hazardType
  {
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = hz[i] | 0;
        setPixel(img, x, y, v === 0 ? PAL.bg : hashColor(v));
      }
    return img;
  }
}

// ----------------------------- Component -------------------------------------

export function InspectionShell(props: InspectionShellProps) {
  const { result, onBack } = props;
  const title = props.title ?? "Dungeon Inspection";

  const dungeon = result.dungeon;
  const content = result.content;

  const contentRef = useRef<ContentOutputs>(content);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasPanelRef = useRef<HTMLDivElement | null>(null);

  // Inspection-only state
  const [layer, setLayer] = useState<Layer>("content");
  const [scale, setScale] = useState(6);

  const [pane, setPane] = useState<InspectPane>("content");
  // For Render pane camera focus (cell coords)
  const [focusCell, setFocusCell] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const [selectedCircuitIndex, setSelectedCircuitIndex] = useState<
    number | null
  >(null);
  const [circuitDiagFilters, setCircuitDiagFilters] =
    useState<CircuitDiagFilters>({
      search: "",
      onlySignal: false,
      onlyCycles: false,
      hideDepth0: false,
    });
  const [circuitDiagSort, setCircuitDiagSort] = useState<CircuitDiagSort>({
    kind: "evalOrder",
    dir: "asc",
  });

  const [runtime, setRuntime] = useState<DungeonRuntimeState>(result.runtime0);
  const [circuitDiagnostics, setCircuitDiagnostics] =
    useState<CircuitEvalDiagnostics | null>(result.circuitDiagnostics0 ?? null);
  const [circuitDebug, setCircuitDebug] = useState<
    CircuitEvalResult["debug"] | null
  >(result.circuitDebug0 ?? null);

  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

  // Hover tooltip state
  const hoverTimerRef = useRef<number | null>(null);
  const lastHoverCellRef = useRef<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    lines: string[];
    featureType: number;
    featureId: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    lines: [],
    featureType: 0,
    featureId: 0,
  });

  const startCell = useMemo(
    () => computeStartCellFromEntranceRoom(dungeon, content),
    [dungeon, content],
  );

  const [player, setPlayer] = useState<{ x: number; y: number }>(
    () => startCell,
  );

  useEffect(() => {
    setPlayer(startCell);
    setFocusCell(startCell); // keep camera + focus aligned initially
  }, [startCell.x, startCell.y]);

  // Apply runtime mutation -> derive plates -> evaluate circuits (same semantics as old App)
  const applyRuntime = React.useCallback((next: DungeonRuntimeState) => {
    const c = contentRef.current;
    const derived = derivePlatesFromBlocks(next, c);
    const res = evaluateCircuits(derived, c.meta.circuits);
    setRuntime(res.next);
    setCircuitDebug(res.debug ?? null);
    setCircuitDiagnostics(res.diagnostics ?? null);
  }, []);

  const resetRuntime = React.useCallback(() => {
    const c = contentRef.current;
    const initial = initDungeonRuntimeState(c);
    const derived = derivePlatesFromBlocks(initial, c);
    const res = evaluateCircuits(derived, c.meta.circuits);
    setRuntime(res.next);
    setCircuitDebug(res.debug ?? null);
    setCircuitDiagnostics(res.diagnostics ?? null);
    setSelectedBlockId(null);
  }, []);

  // Derived role diagnostics (observational only)
  const roleDiagnostics: RoleDiagnosticsV1 | null = useMemo(() => {
    if (!content?.meta) return null;
    if (!circuitDiagnostics) return null;
    try {
      return analyzeRoleDiagnosticsV1({
        meta: content.meta,
        circuitEval: circuitDiagnostics,
        // thresholds omitted => DEFAULT_ROLE_THRESHOLDS_V1 (observational)
      });
    } catch {
      return null;
    }
  }, [content, circuitDiagnostics]);

  // Render image for current layer
  const imgForCanvas = useMemo(() => {
    return renderMaskLayer(dungeon, content, layer, runtime);
  }, [dungeon, content, layer, runtime]);

  const imgForDownload = imgForCanvas;

  // Paint canvas whenever image or scale changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    canvas.width = dungeon.width * scale;
    canvas.height = dungeon.height * scale;

    // draw scaled pixels (nearest neighbor)
    const off = document.createElement("canvas");
    off.width = dungeon.width;
    off.height = dungeon.height;
    const octx = off.getContext("2d", { alpha: false });
    if (!octx) return;

    octx.putImageData(imgForCanvas, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, off.width * scale, off.height * scale);
  }, [dungeon.width, dungeon.height, imgForCanvas, scale]);

  // Tooltip builder (minimal + stable; can be expanded)
  function buildTooltipLines(x: number, y: number) {
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

    const lines: string[] = [];

    // --- raw (keep) ---
    lines.push(`(${x},${y})  region=${regionId}  dist=${dist}  solid=${solid}`);
    if (ft !== 0) lines.push(`featureType=${ft} featureId=${fid} param=${fp}`);
    if (hz !== 0) lines.push(`hazardType=${hz}`);
    if (danger !== 0) lines.push(`danger=${danger}`);
    if (loot !== 0) lines.push(`lootTier=${loot}`);

    // --- readable section ---
    if (ft !== 0) {
      lines.push(""); // spacer line
      lines.push(`• ${featureTypeName(ft)}${fid ? ` #${fid}` : ""}`);

      // --- exact circuit membership (repomix: CircuitDef { triggers[], targets[] }) ---
      const circuits = content.meta?.circuits ?? [];
      const memberships: string[] = [];

      // Build diag lookup (optional)
      const diagByIndex =
        circuitDiagnostics?.perCircuit &&
        Array.isArray(circuitDiagnostics.perCircuit)
          ? new Map(
              circuitDiagnostics.perCircuit.map((d) => [d.circuitIndex, d]),
            )
          : null;

      // featureType -> trigger kind
      const triggerKind =
        ft === 6 ? "LEVER" : ft === 5 ? "KEY" : ft === 7 ? "PLATE" : null;

      // featureType -> target kind
      const targetKind =
        ft === 4 ? "DOOR" : ft === 10 ? "HAZARD" : ft === 9 ? "HIDDEN" : null;

      for (let ci = 0; ci < circuits.length; ci++) {
        const c: any = circuits[ci];
        const cid = (c?.id ?? ci) | 0;

        // match triggers
        if (triggerKind && Array.isArray(c?.triggers)) {
          for (const t of c.triggers) {
            if (
              t?.kind === triggerKind &&
              ((t?.refId ?? -1) | 0) === (fid | 0)
            ) {
              const d = diagByIndex?.get(ci);
              const extra = d
                ? ` (order=${d.evalOrderIndex}, depth=${d.topoDepth}${d.participatesInCycle ? ", cycle" : ""})`
                : "";
              memberships.push(
                `• circuit[${ci}] id=${cid}: trigger ${t.kind}${extra}`,
              );
              break;
            }
          }
        }

        // match targets
        if (targetKind && Array.isArray(c?.targets)) {
          for (const t of c.targets) {
            if (
              t?.kind === targetKind &&
              ((t?.refId ?? -1) | 0) === (fid | 0)
            ) {
              const d = diagByIndex?.get(ci);
              const extra = d
                ? ` (order=${d.evalOrderIndex}, depth=${d.topoDepth}${d.participatesInCycle ? ", cycle" : ""})`
                : "";
              // repomix: targets have { kind, refId, effect }
              const eff = t?.effect ? ` ${t.effect}` : "";
              memberships.push(
                `• circuit[${ci}] id=${cid}: target ${t.kind}${eff}${extra}`,
              );
              break;
            }
          }
        }
      }

      if (memberships.length) {
        lines.push(...memberships);
      } else {
        lines.push(`• circuits: none`);
      }

      // --- runtime-aware status (correct mapping) ---
      if (runtime) {
        if (ft === 4 && fid) {
          const ds = readDoorState(runtime, fid);
          lines.push(`• door state: ${ds.isOpen ? "OPEN" : "CLOSED"}`);
          if (ds.forcedOpen) lines.push(`• forced open`);
        } else if (ft === 5 && fid) {
          const k = runtime.keys[fid];
          if (k)
            lines.push(`• key: ${k.collected ? "COLLECTED" : "AVAILABLE"}`);
        } else if (ft === 6 && fid) {
          const l = runtime.levers[fid];
          if (l) lines.push(`• lever: ${l.toggled ? "ON" : "OFF"}`);
        } else if (ft === 7 && fid) {
          const p = runtime.plates[fid];
          if (p) lines.push(`• plate: ${p.pressed ? "PRESSED" : "UP"}`);
        } else if (ft === 8 && fid) {
          const b = runtime.blocks[fid];
          if (b) lines.push(`• block pos: (${b.x},${b.y})`);
        } else if (ft === 3 && fid) {
          lines.push(`• secret door tile`);
        } else if (ft === 9 && fid) {
          lines.push(`• hidden passage tile`);
        } else if (ft === 10 && fid) {
          lines.push(`• hazard tile`);
        }
      }
    }

    return { lines, ft, fid };
  }

  function clearHoverTimer() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  function getTooltipStyle(): React.CSSProperties {
    const wrap = canvasWrapRef.current;
    if (!wrap) return { left: 0, top: 0 };

    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;

    const cellLeft = tooltip.x * scale;
    const cellTop = tooltip.y * scale;

    const pad = 8;
    const estTipW = 320;
    const estTipH = 120;

    let left = cellLeft;
    let top = cellTop + scale + pad;

    left = Math.max(pad, Math.min(left, wrapW - estTipW - pad));

    if (top + estTipH > wrapH - pad) {
      top = Math.max(pad, cellTop - estTipH - pad);
    }

    return { left, top };
  }

  function scheduleTooltip(x: number, y: number) {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      const { lines, ft, fid } = buildTooltipLines(x, y);
      setTooltip({
        visible: true,
        x,
        y,
        lines,
        featureType: ft,
        featureId: fid,
      });
    }, 75);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (selectedBlockId == null) return;
      let dx = 0,
        dy = 0;

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
        default:
          return;
      }

      e.preventDefault();
      const res = tryPushBlock(
        runtime,
        dungeon,
        content,
        selectedBlockId,
        dx,
        dy,
      );
      if (res.ok) applyRuntime(res.next);
    }

    window.addEventListener("keydown", onKeyDown, { passive: false } as any);
    return () => window.removeEventListener("keydown", onKeyDown as any);
  }, [selectedBlockId, runtime, dungeon, content, applyRuntime]);

  // Mouse move => delayed tooltip
  const onMouseMove = (e: React.MouseEvent) => {
    const c = getCanvasCellFromMouse(e, canvasRef.current, scale);
    if (!c) return;

    const x = c.x;
    const y = c.y;
    if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) {
      lastHoverCellRef.current = null;
      clearHoverTimer();
      setTooltip((t) => (t.visible ? { ...t, visible: false } : t));
      return;
    }

    // keep render-camera focus in sync with hover
    setFocusCell({ x, y });

    const last = lastHoverCellRef.current;
    if (last && last.x === x && last.y === y) return;

    lastHoverCellRef.current = { x, y };
    scheduleTooltip(x, y);
  };

  const onMouseLeave = () => {
    clearHoverTimer();
    lastHoverCellRef.current = null;
    setTooltip((t) => (t.visible ? { ...t, visible: false } : t));
  };

  // Click-to-interact (same conceptual behavior as old App):
  // - Click lever tile -> toggle lever
  // - Click key tile -> collect key
  // - Click block tile -> select/deselect block for pushing
  // - Click adjacent tile with selected block -> try push
  const onClick = (e: React.MouseEvent) => {
    const c = getCanvasCellFromMouse(e, canvasRef.current, scale);
    if (!c) return;

    const x = c.x;
    const y = c.y;
    if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return;
    setFocusCell({ x, y });

    const w = dungeon.width;
    const i = y * w + x;

    const ft = content.masks.featureType[i] | 0;
    const fid = content.masks.featureId[i] | 0;

    // Block selection / push (FeatureType 8)
    if (ft === 8 && fid) {
      setSelectedBlockId((prev) => (prev === fid ? null : fid));
      return;
    }

    if (selectedBlockId != null) {
      const b = runtime.blocks?.[selectedBlockId];

      // If block disappeared somehow, clear selection safely.
      if (!b) {
        setSelectedBlockId(null);
        return;
      }

      const dx = (x - b.x) | 0;
      const dy = (y - b.y) | 0;

      // Only allow clicking an adjacent cardinal cell to push.
      if (Math.abs(dx) + Math.abs(dy) !== 1) {
        // keep selection; ignore non-adjacent clicks
        return;
      }

      const res = tryPushBlock(
        runtime,
        dungeon,
        content,
        selectedBlockId,
        dx,
        dy,
      );
      if (res.ok) {
        applyRuntime(res.next);
      } else {
        // keep selection; optional: surface error somewhere
        // console.warn(res.error);
      }
      return;
    }

    // Lever toggle (FeatureType 6) — runtime-only inspection affordance
    if (ft === 6 && fid) {
      const next = toggleLever(runtime, fid);
      applyRuntime(next); // derive plates -> evaluate circuits -> update runtime/diagnostics
      return;
    }

    // Collect key (FeatureType 5)
    if (ft === 5 && fid) {
      const next = collectKey(runtime, fid);
      applyRuntime(next);
      return;
    }

    // Generic reset click behavior (optional): hide tooltip
    setTooltip((t) => (t.visible ? { ...t, visible: false } : t));
  };

  const canvasStyle: React.CSSProperties = {
    width: dungeon.width * scale,
    height: dungeon.height * scale,
    imageRendering: "pixelated",
    cursor: selectedBlockId != null ? "crosshair" : "default",
  };

  const onDownload = () => {
    if (!imgForDownload) return;
    const dataUrl = imageDataToPngDataUrl(imgForDownload);
    const filename = `dungeon-${layer}.png`;
    if (props.onDownloadPng) props.onDownloadPng(filename, dataUrl);
    else downloadDataUrl(filename, dataUrl);
  };

  return (
    <div className="maze-app">
      {/* Left: Inspection controls + diagnostics */}
      <div className="maze-controls">
        <div className="maze-header-row">
          <h2 className="maze-title">{title}</h2>
          {props.onRandomizeSeedAndRegenerate && (
            <button onClick={props.onRandomizeSeedAndRegenerate}>
              🎲 Randomize Seed + Regenerate
            </button>
          )}
          {!!onBack && (
            <button
              className="maze-btn"
              onClick={onBack}
              title="Return to wizard"
            >
              Back
            </button>
          )}
        </div>

        <div className="maze-controls-row">
          <button
            className="maze-btn"
            onClick={resetRuntime}
            title="Reset runtime state from current content"
          >
            Reset Runtime
          </button>

          <button
            className="maze-btn"
            onClick={() => {
              resetRuntime();
            }}
            title="Hard reset runtime state (doors/levers/keys/blocks)"
          >
            Hard Reset
          </button>

          <button
            className="maze-btn"
            onClick={onDownload}
            disabled={!imgForDownload}
            title="Download current layer as PNG"
          >
            Download PNG
          </button>
        </div>

        <div className="maze-grid">
          <label className="maze-field">
            <span>Layer</span>
            <select
              value={layer}
              onChange={(e) => setLayer(e.target.value as Layer)}
            >
              <option value="content">content</option>
              <option value="solid">solid</option>
              <option value="regionId">regionId</option>
              <option value="distanceToWall">distanceToWall</option>
              <option value="featureType">featureType</option>
              <option value="featureId">featureId</option>
              <option value="featureParam">featureParam</option>
              <option value="danger">danger</option>
              <option value="lootTier">lootTier</option>
              <option value="hazardType">hazardType</option>
            </select>
          </label>

          <label className="maze-field">
            <span>Scale</span>
            <input
              type="number"
              value={scale}
              min={1}
              max={32}
              onChange={(e) =>
                setScale(clampInt(Number(e.target.value), 1, 32))
              }
            />
          </label>

          <label className="maze-field">
            <span>Pane</span>
            <select
              value={pane}
              onChange={(e) => setPane(e.target.value as InspectPane)}
            >
              <option value="content">content</option>
              <option value="render">render</option>
            </select>
          </label>
        </div>

        {selectedBlockId != null && (
          <div style={{ marginTop: 8, opacity: 0.9 }}>
            Block selected: <b>#{selectedBlockId}</b> — click a target cell to
            attempt push.
          </div>
        )}

        <div style={{ height: 12 }} />

        <CircuitDiagnosticsSection
          title="Circuit Diagnostics"
          circuits={content.meta.circuits}
          diagnostics={circuitDiagnostics}
          selectedCircuitIndex={selectedCircuitIndex}
          onSelectCircuitIndex={setSelectedCircuitIndex}
          filters={circuitDiagFilters}
          onChangeFilters={setCircuitDiagFilters}
          sort={circuitDiagSort}
          onChangeSort={setCircuitDiagSort}
          allowJumpLinks={true}
          showRawJson={false}
        />

        <div style={{ height: 12 }} />

        <RoleDiagnosticsSection
          title="Role Diagnostics"
          circuits={content.meta.circuits}
          diagnostics={roleDiagnostics}
          selectedCircuitIndex={selectedCircuitIndex}
          onSelectCircuitIndex={setSelectedCircuitIndex}
          showRawJson={false}
        />

        {/* Optional: raw circuit debug */}
        {circuitDebug && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Circuit Debug (raw)</summary>
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(circuitDebug, null, 2)}
            </pre>
          </details>
        )}
      </div>

      {/* Right: Canvas */}
      <div className="maze-canvas-panel" ref={canvasPanelRef}>
        <div className="maze-canvas-wrap" ref={canvasWrapRef}>
          {/*<canvas
            ref={canvasRef}
            className="maze-canvas"
            style={canvasStyle}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
          />*/}

          {/* Blinking hover rect */}
          {tooltip.visible && (
            <div
              className="maze-hover-rect"
              style={{
                left: tooltip.x * scale,
                top: tooltip.y * scale,
                width: scale,
                height: scale,
              }}
            />
          )}

          {/* Tooltip anchored to hovered cell */}

          {pane === "content" ? (
            <>
              <canvas
                ref={canvasRef}
                className="maze-canvas"
                style={canvasStyle}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                onClick={onClick}
              />
              {tooltip.visible && (
                <div
                  className="maze-hover-rect"
                  style={{
                    left: tooltip.x * scale,
                    top: tooltip.y * scale,
                    width: scale,
                    height: scale,
                  }}
                />
              )}
              {tooltip.visible && (
                <div className="maze-tooltip" style={getTooltipStyle()}>
                  {tooltip.lines.map((ln, idx) => (
                    <div key={idx} className="maze-tooltip-line">
                      {ln}
                    </div>
                  ))}
                </div>
              )}
              {layer === "content" && (
                <div className="maze-legend">
                  <div className="maze-legend-title">Legend (content)</div>
                  <div className="maze-legend-grid">
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.wall) }}
                      />
                      <span>Wall</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.floor) }}
                      />
                      <span>Floor</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.entrance) }}
                      />
                      <span>Entrance</span>
                    </div>

                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.exit) }}
                      />
                      <span>Exit</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.doorClosed) }}
                      />
                      <span>Door (closed)</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.doorOpen) }}
                      />
                      <span>Door (open)</span>
                    </div>

                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.key) }}
                      />
                      <span>Key</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.lever) }}
                      />
                      <span>Lever</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.plate) }}
                      />
                      <span>Plate</span>
                    </div>

                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.block) }}
                      />
                      <span>Block</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.secret) }}
                      />
                      <span>Secret</span>
                    </div>
                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.hazard) }}
                      />
                      <span>Hazard</span>
                    </div>

                    <div className="maze-legend-item">
                      <span
                        className="maze-legend-swatch"
                        style={{ background: palToCss(PAL.loot) }}
                      />
                      <span>Loot</span>
                    </div>
                  </div>
                </div>
              )}{" "}
            </>
          ) : (
            <DungeonRenderView
              bsp={dungeon}
              content={content}
              focusX={player.x}
              focusY={player.y} // Base tiles
              playerX={player.x}
              playerY={player.y}
              playerTile={CP437_TILES.player}
              floorTile={CP437_TILES.floor}
              wallTile={CP437_TILES.wall}
              // Feature tiles (FeatureType → glyph)
              doorTile={CP437_TILES.doorClosed}
              keyTile={CP437_TILES.key}
              leverTile={CP437_TILES.lever}
              plateTile={CP437_TILES.plate}
              blockTile={CP437_TILES.block}
              chestTile={CP437_TILES.chest}
              monsterTile={CP437_TILES.monster}
              secretDoorTile={CP437_TILES.secretDoor}
              hiddenPassageTile={CP437_TILES.hiddenPassage}
              hazardDefaultTile={CP437_TILES.hazard}
              atlasUrl={"/textures/codepage437.png"}
              atlasCols={32}
              atlasRows={8}
              hazardTilesByType={{
                1: 48, // lava
                2: 49, // poison
                3: 50, // water
                4: 51, // spikes
              }}
              zoom={32}
              flipAtlasY={false}
              flipGridX={false}
              flipGridY={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default InspectionShell;
