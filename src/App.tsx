// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  generateBspDungeon,
  generateDungeonContent,
  imageDataToPngDataUrl,
} from "./mazeGen";

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
  | "lootTier";

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

function makeContentCompositeImageData(
  dungeon: ReturnType<typeof generateBspDungeon>,
  content: ReturnType<typeof generateDungeonContent>,
): ImageData {
  const W = dungeon.width;
  const H = dungeon.height;

  const solid = dungeon.masks.solid; // 255 wall, 0 floor
  const ft = content.masks.featureType; // 0..n

  const img = new ImageData(W, H);
  const data = img.data;

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

      // Overlay feature colors (logical colors):
      // - monsters red
      // - loot/chests green
      // - doors brown (includes secret doors + doors)
      // - anything else yellow (keys/levers/future)
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
          r = 150;
          g = 105;
          b = 60;
        } else {
          // key / lever / unknown future
          r = 230;
          g = 200;
          b = 70;
        }

        // Keep walls visible if a feature is on a wall (secret doors are walls)
        if (isWall) {
          // blend 60% overlay, 40% base
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
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    lines: string[];
  }>({ visible: false, x: 0, y: 0, screenX: 0, screenY: 0, lines: [] });

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

  const generate = React.useCallback(() => {
    const out = generateBspDungeon(opts);
    const content = generateDungeonContent(out);

    dungeonRef.current = out;
    contentRef.current = content;

    const composite = makeContentCompositeImageData(out, content);

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
    });
  }, [opts]);

  // initial generation
  useEffect(() => {
    generate();
  }, [generate]);

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

    const ft = content.masks.featureType[i];
    const fid = content.masks.featureId[i];
    const fparam = content.masks.featureParam[i];
    const dng = content.masks.danger[i];
    const tier = content.masks.lootTier[i];

    const lines: string[] = [];
    lines.push(`Cell: (${x}, ${y})`);
    lines.push(`Terrain: ${solid === 255 ? "Wall" : "Floor"}`);
    lines.push(`regionId: ${regionId}`);
    lines.push(`distanceToWall: ${dist}`);

    lines.push(`featureType: ${ft} (${featureName(ft)})`);
    lines.push(`featureId: ${fid}`);

    // Milestone 2 extra info
    if (ft === 4) {
      lines.push(`featureParam: ${fparam} (Door: ${doorKindName(fparam)})`);
    } else if (fparam !== 0) {
      // Useful for future feature types
      lines.push(`featureParam: ${fparam}`);
    }

    if (ft === 1) lines.push(`danger: ${dng}`);
    if (ft === 2) lines.push(`lootTier: ${tier}`);

    // Helpful relationship hints (best-effort, based on circuit ids)
    if (ft === 5 && fid !== 0)
      lines.push(`Hint: key unlocks door circuit ${fid}`);
    if (ft === 6 && fid !== 0)
      lines.push(`Hint: lever controls door circuit ${fid}`);
    if (ft === 4 && fid !== 0) lines.push(`Circuit: door id ${fid}`);

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

    // Convert display pixels to cell coords
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

    // Update tooltip anchor position immediately (so it tracks the cursor),
    // but only show content after hover delay.
    setTooltip((t) => ({
      ...t,
      x: cell.x,
      y: cell.y,
      screenX: cell.screenX,
      screenY: cell.screenY,
    }));

    const last = lastHoverCellRef.current;
    if (last && last.x === cell.x && last.y === cell.y) {
      return; // same cell; timer already running / tooltip already shown
    }

    lastHoverCellRef.current = { x: cell.x, y: cell.y };
    clearHoverTimer();

    hoverTimerRef.current = window.setTimeout(() => {
      const lines = buildTooltipLines(cell.x, cell.y);
      setTooltip((t) => ({
        ...t,
        visible: true,
        x: cell.x,
        y: cell.y,
        screenX: cell.screenX,
        screenY: cell.screenY,
        lines,
      }));
    }, 350);
  }

  function onCanvasMouseLeave() {
    hideTooltip();
  }

  const imgForDownload = imageDataByLayer[layer];

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
                      ? "0=none, 1=monster, 2=chest, 3=secretDoor, 4=door, 5=key, 6=lever"
                      : layer === "featureParam"
                        ? "door kind / feature subtype (e.g. 1=locked door, 2=lever door)"
                        : layer === "danger"
                          ? "monster danger/level (0..255)"
                          : layer === "lootTier"
                            ? "chest tier (1..N)"
                            : "feature instance/circuit id (1..255)"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
