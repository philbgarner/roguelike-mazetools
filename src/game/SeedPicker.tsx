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
import styles from "./styles/SeedPicker.module.css";
import BorderPanel from "./ui/BorderPanel";
import Button from "./ui/Button";

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
    <div className={styles.wrapper}>
      {/* ── Left panel 40% ── */}
      <BorderPanel
        background="rgba(0.3, 0.3, 0.3, 0.8)"
        width="25vw"
        height="calc(100vh - 4rem)"
        left="1rem"
        top="2rem"
        flexMode="Column"
      >
        {/* Controls */}
        <div className={styles.controls}>
          {/* Seed input */}
          <div>
            <div className={styles.overworldLabel}>OVERWORLD SEED</div>
            <div className={styles.seedRow}>
              <input
                value={String(localSeed)}
                onChange={(e) => setLocalSeed(e.target.value)}
                className={styles.seedInput}
              />
              <Button onClick={rollSeed}>⟳ Roll</Button>
            </div>
            <div className={styles.hashText}>
              hash 0x
              {bsp.meta.seedUsed.toString(16).padStart(8, "0").toUpperCase()}
            </div>
          </div>

          {/* Start button */}
          <button onClick={handleStart} className={styles.startButton}>
            ▶ Start with this seed
          </button>

          <hr className={styles.separator} />

          {/* Hovered cell status */}
          <div className={styles.hoveredStatus}>
            {hoveredCell
              ? (() => {
                  const hp = content.meta.dungeonPortals.find(
                    (p) => p.x === hoveredCell.x && p.y === hoveredCell.y,
                  );
                  return (
                    <>
                      <span className={styles.hoveredCoord}>
                        ({hoveredCell.x}, {hoveredCell.y})
                      </span>
                      {hp && (
                        <span
                          className={styles.hoveredPortalName}
                          style={{ color: themeColor(hp.theme) }}
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
            <div className={styles.portalDetail}>
              <div className={styles.detailHeading}>PORTAL DETAILS</div>
              <table className={styles.detailTable}>
                <tbody>
                  <tr>
                    <td className={styles.detailKey}>Theme</td>
                    <td style={{ color: themeColor(selectedPortal.theme) }}>
                      {selectedPortal.theme}
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.detailKey}>Level</td>
                    <td className={styles.detailValue}>
                      {selectedPortal.level}
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.detailKey}>Difficulty</td>
                    <td className={styles.detailValue}>
                      {selectedPortal.difficulty}
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.detailKey}>Location</td>
                    <td className={styles.detailValue}>
                      ({selectedPortal.x}, {selectedPortal.y})
                    </td>
                  </tr>
                  <tr>
                    <td className={styles.detailKey}>Seed</td>
                    <td className={styles.detailSeedValue}>
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
            <div className={styles.hintText}>
              Left-click a portal on the map to see its details.
              <br />
              Right-click to recentre the view.
            </div>
          )}

          <hr className={styles.separator} />

          {/* Portal list */}
          <div>
            <div className={styles.portalsLabel}>
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
                className={styles.portalListItem}
                style={{
                  background:
                    selectedPortal?.id === p.id ? "#111e11" : "transparent",
                  border:
                    selectedPortal?.id === p.id
                      ? "1px solid #2a4a2a"
                      : "1px solid transparent",
                }}
              >
                <span
                  className={styles.portalListTheme}
                  style={{ color: themeColor(p.theme) }}
                >
                  {p.theme}
                </span>
                <span className={styles.portalListLevel}>lvl {p.level}</span>
                <span className={styles.portalListCoord}>
                  ({p.x},{p.y})
                </span>
              </div>
            ))}
          </div>
        </div>
      </BorderPanel>

      {/* ── Right panel 60%: bird's-eye map ── */}
      <div
        className={styles.mapPanel}
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
