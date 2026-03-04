import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, Text3D, useFont } from "@react-three/drei";

import DungeonRenderView from "../rendering/DungeonRenderView";
import {
  generateForest,
  generateForestContent,
  type ForestContentOutputs,
  type ContentOutputs,
} from "../mazeGen";
import { CP437_TILES } from "../rendering/codepage437Tiles";
import { useGame } from "./GameProvider";

const FONT_URL = "/fonts/dosfont.json";
const MAP_ZOOM_DEFAULT = 10;
const MAP_ZOOM_MIN = 4;
const MAP_ZOOM_MAX = 32;

type DungeonPortal = ForestContentOutputs["meta"]["dungeonPortals"][number];

function buildForestWorld(seed: string | number) {
  const bsp = generateForest({ seed, width: 64, height: 64 });
  const content = generateForestContent(bsp, { seed, portalCount: 10 });
  return { bsp, content };
}

function PickerTitle() {
  const font = useFont(FONT_URL);
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <Center>
        <Text3D font={font.data} size={0.6} height={0.12} curveSegments={4}>
          World Seed
          <meshStandardMaterial color="#aaffaa" />
        </Text3D>
      </Center>
    </>
  );
}

function themeColor(theme: string): string {
  switch (theme) {
    case "cave":
      return "#aaaaaa";
    case "ruins":
      return "#c8a96e";
    case "crypt":
      return "#a78bfa";
    case "temple":
      return "#fbbf24";
    case "lair":
      return "#f87171";
    default:
      return "#cccccc";
  }
}

export default function SeedPicker() {
  const { goTo, setOverworld } = useGame();

  const [localSeed, setLocalSeed] = useState<string | number>("test");
  const [focusX, setFocusX] = useState(32);
  const [focusY, setFocusY] = useState(32);
  const [selectedPortal, setSelectedPortal] = useState<DungeonPortal | null>(
    null,
  );
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [mapZoom, setMapZoom] = useState(MAP_ZOOM_DEFAULT);
  const lastHoverCellRef = useRef<{ x: number; y: number } | null>(null);

  const { bsp, content } = useMemo(
    () => buildForestWorld(localSeed),
    [localSeed],
  );
  const contentLegacy = content as unknown as ContentOutputs;

  // Clear selection when the world regenerates
  useEffect(() => {
    setSelectedPortal(null);
  }, [bsp]);

  function rollSeed() {
    setLocalSeed((Math.random() * 0xffffffff) >>> 0);
  }

  function handleStart() {
    setOverworld(bsp, content);
    goTo("overworld");
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const cell = lastHoverCellRef.current;
    if (cell) {
      setFocusX(cell.x);
      setFocusY(cell.y);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setMapZoom((z) =>
      Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, z - Math.sign(e.deltaY))),
    );
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100vw",
        height: "100vh",
        background: "#080808",
        overflow: "hidden",
      }}
    >
      {/* ── Left panel 40% ── */}
      <div
        style={{
          width: "40%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #222",
          color: "#bbb",
          fontFamily: "monospace",
        }}
      >
        {/* 3D title */}
        <div style={{ height: "160px", flexShrink: 0 }}>
          <Canvas
            camera={{ position: [0, 0, 5], fov: 50 }}
            style={{ width: "100%", height: "100%", background: "transparent" }}
          >
            <PickerTitle />
          </Canvas>
        </div>

        {/* Controls */}
        <div
          style={{
            flex: 1,
            padding: "1.2rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
            overflowY: "auto",
          }}
        >
          {/* Seed input */}
          <div>
            <div
              style={{
                color: "#6a6",
                fontSize: "0.72rem",
                marginBottom: "0.35rem",
                letterSpacing: "0.08em",
              }}
            >
              OVERWORLD SEED
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                value={String(localSeed)}
                onChange={(e) => setLocalSeed(e.target.value)}
                style={{
                  flex: 1,
                  background: "#0e0e0e",
                  border: "1px solid #333",
                  color: "#eee",
                  padding: "0.4rem 0.6rem",
                  fontFamily: "monospace",
                  fontSize: "0.88rem",
                  outline: "none",
                }}
              />
              <button
                onClick={rollSeed}
                style={{
                  background: "#101828",
                  border: "1px solid #334",
                  color: "#88aaff",
                  padding: "0.4rem 0.8rem",
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                ⟳ Roll
              </button>
            </div>
            <div
              style={{
                color: "#444",
                fontSize: "0.7rem",
                marginTop: "0.25rem",
              }}
            >
              hash 0x
              {bsp.meta.seedUsed.toString(16).padStart(8, "0").toUpperCase()}
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            style={{
              background: "#0e1e0e",
              border: "1px solid #3a6a3a",
              color: "#aaff88",
              padding: "0.6rem 1rem",
              fontFamily: "monospace",
              fontSize: "0.95rem",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            ▶ Start with this seed
          </button>

          <hr
            style={{
              border: "none",
              borderTop: "1px solid #1a1a1a",
              margin: 0,
            }}
          />

          {/* Hovered cell status */}
          <div
            style={{ fontSize: "0.75rem", color: "#555", minHeight: "1.1em" }}
          >
            {hoveredCell
              ? (() => {
                  const hp = content.meta.dungeonPortals.find(
                    (p) => p.x === hoveredCell.x && p.y === hoveredCell.y,
                  );
                  return (
                    <>
                      <span style={{ color: "#888" }}>
                        ({hoveredCell.x}, {hoveredCell.y})
                      </span>
                      {hp && (
                        <span
                          style={{
                            color: themeColor(hp.theme),
                            marginLeft: "0.5rem",
                          }}
                        >
                          {hp.theme} lvl {hp.level}
                        </span>
                      )}
                    </>
                  );
                })()
              : null}
          </div>

          {/* Portal detail or hint */}
          {selectedPortal ? (
            <div
              style={{
                background: "#0e0e0e",
                border: "1px solid #2a2a2a",
                padding: "0.8rem",
              }}
            >
              <div
                style={{
                  color: "#ffaa44",
                  marginBottom: "0.55rem",
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                }}
              >
                PORTAL DETAILS
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.82rem",
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        color: "#666",
                        paddingRight: "0.75rem",
                        paddingBottom: "0.2rem",
                      }}
                    >
                      Theme
                    </td>
                    <td style={{ color: themeColor(selectedPortal.theme) }}>
                      {selectedPortal.theme}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        color: "#666",
                        paddingRight: "0.75rem",
                        paddingBottom: "0.2rem",
                      }}
                    >
                      Level
                    </td>
                    <td style={{ color: "#ddd" }}>{selectedPortal.level}</td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        color: "#666",
                        paddingRight: "0.75rem",
                        paddingBottom: "0.2rem",
                      }}
                    >
                      Difficulty
                    </td>
                    <td style={{ color: "#ddd" }}>
                      {selectedPortal.difficulty}
                    </td>
                  </tr>
                  <tr>
                    <td
                      style={{
                        color: "#666",
                        paddingRight: "0.75rem",
                        paddingBottom: "0.2rem",
                      }}
                    >
                      Location
                    </td>
                    <td style={{ color: "#ddd" }}>
                      ({selectedPortal.x}, {selectedPortal.y})
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: "#666", paddingRight: "0.75rem" }}>
                      Seed
                    </td>
                    <td style={{ color: "#555", fontSize: "0.75rem" }}>
                      0x
                      {selectedPortal.seed
                        .toString(16)
                        .padStart(8, "0")
                        .toUpperCase()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{ color: "#444", fontSize: "0.78rem", lineHeight: 1.7 }}
            >
              Left-click a portal on the map to see its details.
              <br />
              Right-click to recentre the view.
            </div>
          )}

          <hr
            style={{
              border: "none",
              borderTop: "1px solid #1a1a1a",
              margin: 0,
            }}
          />

          {/* Portal list */}
          <div>
            <div
              style={{
                color: "#6a6",
                fontSize: "0.72rem",
                marginBottom: "0.4rem",
                letterSpacing: "0.08em",
              }}
            >
              PORTALS ({content.meta.dungeonPortals.length})
            </div>
            {content.meta.dungeonPortals.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedPortal(p);
                  setFocusX(p.x);
                  setFocusY(p.y);
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.28rem 0.5rem",
                  marginBottom: "2px",
                  cursor: "pointer",
                  background:
                    selectedPortal?.id === p.id ? "#111e11" : "transparent",
                  border:
                    selectedPortal?.id === p.id
                      ? "1px solid #2a4a2a"
                      : "1px solid transparent",
                  fontSize: "0.78rem",
                }}
              >
                <span
                  style={{ color: themeColor(p.theme), minWidth: "4.5rem" }}
                >
                  {p.theme}
                </span>
                <span style={{ color: "#888" }}>lvl {p.level}</span>
                <span style={{ color: "#444" }}>
                  ({p.x},{p.y})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel 60%: bird's-eye map ── */}
      <div
        style={{ width: "60%", height: "100%", position: "relative" }}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      >
        <DungeonRenderView
          bsp={bsp}
          content={contentLegacy}
          focusX={focusX}
          focusY={focusY}
          zoom={mapZoom}
          startFullyExplored
          shaderVariant="forest"
          atlasUrl="/textures/codepage437.png"
          atlasCols={32}
          atlasRows={8}
          floorTile={CP437_TILES.floor}
          wallTile={5}
          exitTile={CP437_TILES.exit}
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
          suppressBlocks
          blockPositions={[]}
          playerX={hoveredCell?.x}
          playerY={hoveredCell?.y}
          hazardTilesByType={{ 1: 48, 2: 49, 3: 50, 4: 51 }}
          flipAtlasY={false}
          flipGridX={false}
          flipGridY={true}
          onCellHover={({ x, y }) => {
            lastHoverCellRef.current = { x, y };
            setHoveredCell({ x, y });
          }}
          onCellHoverEnd={() => {
            lastHoverCellRef.current = null;
            setHoveredCell(null);
          }}
          onCellClick={({ x, y }) => {
            const portal = content.meta.dungeonPortals.find(
              (p) => p.x === x && p.y === y,
            );
            setSelectedPortal(portal ?? null);
            return true;
          }}
        />
      </div>
    </div>
  );
}
