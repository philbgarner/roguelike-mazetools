// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { generateBspDungeon, imageDataToPngDataUrl } from "./mazeGen";

import "./styles.css";

type Layer = "solid" | "regionId" | "distanceToWall";

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
  // --- Controls ---
  const [width, setWidth] = useState(128);
  const [height, setHeight] = useState(96);
  const [seed, setSeed] = useState("demo-seed");

  const [maxDepth, setMaxDepth] = useState(6);
  const [minLeafSize, setMinLeafSize] = useState(12);
  const [maxLeafSize, setMaxLeafSize] = useState(28);
  const [splitPadding, setSplitPadding] = useState(2);

  const [roomPadding, setRoomPadding] = useState(1);
  const [minRoomSize, setMinRoomSize] = useState(5);
  const [maxRoomSize, setMaxRoomSize] = useState(14);
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
  }>({ solid: null, regionId: null, distanceToWall: null });

  const [meta, setMeta] = useState<{
    seedUsed: number;
    rooms: number;
    corridors: number;
    bspDepth: number;
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

    setAscii(out.debug.ascii);
    setImageDataByLayer({
      solid: out.debug.imageData.solid,
      regionId: out.debug.imageData.regionId,
      distanceToWall: out.debug.imageData.distanceToWall,
    });

    setMeta({
      seedUsed: out.meta.seedUsed,
      rooms: out.meta.rooms.length,
      corridors: out.meta.corridors.length,
      bspDepth: out.meta.bspDepth,
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

        <div className="maze-form-grid">
          <label className="maze-field">
            <span>Width</span>
            <input
              type="number"
              value={width}
              min={16}
              max={1024}
              onChange={(e) =>
                setWidth(clampInt(Number(e.target.value || 0), 16, 2048))
              }
            />
          </label>

          <label className="maze-field">
            <span>Height</span>
            <input
              type="number"
              value={height}
              min={16}
              max={1024}
              onChange={(e) =>
                setHeight(clampInt(Number(e.target.value || 0), 16, 2048))
              }
            />
          </label>

          <label className="maze-seed-field">
            <span>Seed</span>
            <div className="maze-seed-row">
              <input
                className="maze-seed-input"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
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
          <div className="maze-subgrid">
            <label className="maze-field">
              <span>Max depth</span>
              <input
                type="number"
                value={maxDepth}
                min={1}
                max={20}
                onChange={(e) =>
                  setMaxDepth(clampInt(Number(e.target.value || 0), 1, 30))
                }
              />
            </label>

            <label className="maze-field">
              <span>Split padding</span>
              <input
                type="number"
                value={splitPadding}
                min={0}
                max={10}
                onChange={(e) =>
                  setSplitPadding(clampInt(Number(e.target.value || 0), 0, 32))
                }
              />
            </label>

            <label className="maze-field">
              <span>Min leaf size</span>
              <input
                type="number"
                value={minLeafSize}
                min={4}
                max={256}
                onChange={(e) =>
                  setMinLeafSize(clampInt(Number(e.target.value || 0), 4, 512))
                }
              />
            </label>

            <label className="maze-field">
              <span>Max leaf size</span>
              <input
                type="number"
                value={maxLeafSize}
                min={8}
                max={512}
                onChange={(e) =>
                  setMaxLeafSize(clampInt(Number(e.target.value || 0), 8, 1024))
                }
              />
            </label>
          </div>
        </details>

        <details open>
          <summary className="maze-summary">Rooms</summary>
          <div className="maze-subgrid">
            <label className="maze-field">
              <span>Room padding</span>
              <input
                type="number"
                value={roomPadding}
                min={0}
                max={10}
                onChange={(e) =>
                  setRoomPadding(clampInt(Number(e.target.value || 0), 0, 64))
                }
              />
            </label>

            <label className="maze-field">
              <span>Fill-leaf chance</span>
              <input
                type="number"
                value={roomFillLeafChance}
                min={0}
                max={1}
                step={0.01}
                onChange={(e) =>
                  setRoomFillLeafChance(
                    Math.max(0, Math.min(1, Number(e.target.value || 0))),
                  )
                }
              />
            </label>

            <label className="maze-field">
              <span>Min room size</span>
              <input
                type="number"
                value={minRoomSize}
                min={2}
                max={256}
                onChange={(e) =>
                  setMinRoomSize(clampInt(Number(e.target.value || 0), 2, 512))
                }
              />
            </label>

            <label className="maze-field">
              <span>Max room size</span>
              <input
                type="number"
                value={maxRoomSize}
                min={2}
                max={512}
                onChange={(e) =>
                  setMaxRoomSize(clampInt(Number(e.target.value || 0), 2, 1024))
                }
              />
            </label>
          </div>
        </details>

        <details open>
          <summary className="maze-summary">Corridors / Borders</summary>
          <div className="maze-subgrid">
            <label className="maze-field">
              <span>Corridor width</span>
              <input
                type="number"
                value={corridorWidth}
                min={1}
                max={9}
                onChange={(e) =>
                  setCorridorWidth(clampInt(Number(e.target.value || 0), 1, 32))
                }
              />
            </label>

            <label className="maze-checkbox-row">
              <input
                type="checkbox"
                checked={keepOuterWalls}
                onChange={(e) => setKeepOuterWalls(e.target.checked)}
              />
              <span>Keep outer walls</span>
            </label>
          </div>
        </details>

        <div className="maze-actions">
          <button onClick={generate} className="maze-action-btn">
            Generate
          </button>

          <button
            onClick={() => {
              const blob = new Blob([ascii], {
                type: "text/plain;charset=utf-8",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `dungeon_${seed}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="maze-action-btn"
          >
            Download ASCII
          </button>

          <button
            onClick={() => {
              if (!currentImageData) return;
              const url = imageDataToPngDataUrl(currentImageData);
              downloadDataUrl(`dungeon_${seed}_${layer}.png`, url);
            }}
            className="maze-action-btn"
          >
            Download PNG
          </button>
        </div>

        <div className="maze-meta">
          {meta ? (
            <div className="maze-meta-grid">
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
            </div>
          ) : (
            <div>Generating…</div>
          )}
        </div>

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
                : "grayscale Manhattan distance (0=wall)"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
