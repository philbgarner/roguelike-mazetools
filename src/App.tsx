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
  | "featureType"
  | "featureId"
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

  const [layer, setLayer] = useState<Layer>("solid");
  const [scale, setScale] = useState(6);

  // --- Output ---
  const [ascii, setAscii] = useState<string>("");
  const [imageDataByLayer, setImageDataByLayer] = useState<{
    solid: ImageData | null;
    regionId: ImageData | null;
    distanceToWall: ImageData | null;
    featureType: ImageData | null;
    featureId: ImageData | null;
    danger: ImageData | null;
    lootTier: ImageData | null;
  }>({
    solid: null,
    regionId: null,
    distanceToWall: null,
    featureType: null,
    featureId: null,
    danger: null,
    lootTier: null,
  });

  const [meta, setMeta] = useState<{
    seedUsed: number;
    rooms: number;
    corridors: number;
    bspDepth: number;

    // Content stats (Milestone 1)
    entranceRoomId: number;
    farthestRoomId: number;
    mainPathRooms: number;
    monsters: number;
    chests: number;
    secrets: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // Use the content ASCII so markers (M/$/?) appear in the preview.
    setAscii(content.debug.ascii);

    setImageDataByLayer({
      solid: out.debug.imageData.solid,
      regionId: out.debug.imageData.regionId,
      distanceToWall: out.debug.imageData.distanceToWall,

      featureType: content.debug.imageData.featureType,
      featureId: content.debug.imageData.featureId,
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

  // Canvas scaled size should be driven by style (CSS) + CSS variables
  // so we keep the inline style minimal and purely dynamic.
  const canvasStyle = {
    // used by .maze-canvas to compute pixelated display size
    ["--mazeW" as any]: currentImageData ? `${currentImageData.width}` : "0",
    ["--mazeH" as any]: currentImageData ? `${currentImageData.height}` : "0",
    ["--mazeScale" as any]: `${scale}`,
  } as React.CSSProperties;

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
              const img = imageDataByLayer[layer];
              if (!img) return;
              const dataUrl = imageDataToPngDataUrl(img);
              downloadDataUrl(`dungeon-${layer}.png`, dataUrl);
            }}
            disabled={!imageDataByLayer[layer]}
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

        <div className="maze-canvas-panel">
          <canvas ref={canvasRef} className="maze-canvas" style={canvasStyle} />
        </div>

        <div className="maze-legend">
          <div>
            <b>Layer</b>: {layer}
          </div>
          <div>
            <b>Legend</b>:{" "}
            {layer === "solid"
              ? "white=wall, black=floor"
              : layer === "regionId"
                ? "grayscale room id (0=not room)"
                : layer === "distanceToWall"
                  ? "grayscale Manhattan distance (0=wall)"
                  : layer === "featureType"
                    ? "0=none, 1=monster, 2=chest, 3=secretDoor"
                    : layer === "danger"
                      ? "monster danger/level (0..255)"
                      : layer === "lootTier"
                        ? "chest tier (1..N)"
                        : "feature instance id (1..255)"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
