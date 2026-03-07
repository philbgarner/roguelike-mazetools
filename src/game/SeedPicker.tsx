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
const tileDefs = { ...CP437_TILES, chest: 168 };

import { useGame } from "./GameProvider";
import styles from "./styles/SeedPicker.module.css";
import BorderPanel from "./ui/BorderPanel";
import Button from "./ui/Button";
import Input from "./ui/Input";
import { FocusLerper } from "./FocusLerper";
import { publicUrl } from "../utils/publicUrl";

const FONT_URL = publicUrl("/fonts/dosfont.json");
const MAP_ZOOM_DEFAULT = 20;
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
  const targetFocusRef = useRef({ x: 32, y: 32 });
  const animFocusRef = useRef({ x: 32, y: 32 });
  const [selectedPortal, setSelectedPortal] = useState<DungeonPortal | null>(
    null,
  );
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [mapZoom, setMapZoom] = useState(MAP_ZOOM_DEFAULT);
  const [hasLeftClicked, setHasLeftClicked] = useState(false);
  const [hasRightClicked, setHasRightClicked] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
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

  function animateFocusTo(x: number, y: number) {
    targetFocusRef.current = { x, y };
  }

  function rollSeed() {
    setLocalSeed((Math.random() * 0xffffffff) >>> 0);
  }

  function handleStart() {
    setOverworld(bsp, content);
    goTo("overworld");
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setHasRightClicked(true);
    const cell = lastHoverCellRef.current;
    if (cell) {
      animateFocusTo(cell.x, cell.y);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setHasScrolled(true);
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
              <Input
                value={String(localSeed)}
                maxWidth="13rem"
                onChange={(value) => setLocalSeed(value)}
              />
              <Button minWidth="8rem" onClick={rollSeed}>
                Roll
              </Button>
            </div>
            <div className={styles.hashText}>
              hash 0x
              {bsp.meta.seedUsed.toString(16).padStart(8, "0").toUpperCase()}
            </div>
            <div className={styles.worldName}>
              {content.meta.worldName.name}
            </div>
            <div className={styles.worldDescription}>
              {content.meta.worldName.description}
            </div>
          </div>

          {/* Start button */}
          <Button background="rgba(0, 170, 170)" onClick={handleStart}>
            <span style={{ fontWeight: "bold" }}>Begin</span>
          </Button>

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
                    <td className={styles.detailKey}>Name</td>
                    <td className={styles.detailNameValue}>
                      {selectedPortal.name}
                    </td>
                  </tr>
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
              <span className={!hasLeftClicked ? styles.hintPulse : undefined}>
                Left-click
              </span>{" "}
              a location on the map to see its details.
              <br />
              <span className={!hasRightClicked ? styles.hintPulse : undefined}>
                Right-click
              </span>{" "}
              to recentre the view.{" "}
              <span className={!hasScrolled ? styles.hintPulse : undefined}>
                Mouse wheel
              </span>{" "}
              scrolls.
            </div>
          )}

          <hr className={styles.separator} />

          {/* Portal list */}
          <div>
            <div className={styles.portalsLabel}>
              Locations ({content.meta.dungeonPortals.length})
            </div>
            {content.meta.dungeonPortals.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedPortal(p);
                  animateFocusTo(p.x, p.y);
                  setHoveredCell({ x: p.x, y: p.y });
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
                <span className={styles.portalListName}>{p.name}</span>
                <span className={styles.portalListLevel}>lvl {p.level}</span>
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
          startFullyExplored="yes"
          shaderVariant="forest"
          atlasUrl={publicUrl("/textures/codepage437.png")}
          atlasCols={32}
          atlasRows={8}
          floorTile={tileDefs.floor}
          wallTile={5}
          exitTile={tileDefs.exit}
          doorTile={tileDefs.doorClosed}
          keyTile={tileDefs.key}
          leverTile={tileDefs.lever}
          plateTile={tileDefs.plate}
          blockTile={tileDefs.block}
          chestTile={tileDefs.chest}
          monsterTile={tileDefs.monster}
          secretDoorTile={tileDefs.secretDoor}
          hiddenPassageTile={tileDefs.hiddenPassage}
          hazardDefaultTile={tileDefs.hazard}
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
          onCellClick={({ x, y, button }) => {
            if (button !== 0) return false;
            setHasLeftClicked(true);
            const portal = content.meta.dungeonPortals.find(
              (p) => p.x === x && p.y === y,
            );
            setSelectedPortal(portal ?? null);
            return true;
          }}
        >
          <FocusLerper
            targetRef={targetFocusRef}
            animRef={animFocusRef}
            onUpdate={(x, y) => {
              setFocusX(x);
              setFocusY(y);
            }}
          />
        </DungeonRenderView>
      </div>
    </div>
  );
}
