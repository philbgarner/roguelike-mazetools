import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hotkeys from "hotkeys-js";
import * as THREE from "three";

import DungeonRenderView from "../rendering/DungeonRenderView";
import {
  ContentOptions,
  generateBspDungeon,
  generateDungeonContent,
  BspDungeonOutputs,
  ContentOutputs,
  FeatureType,
} from "../mazeGen";

import { isTileWalkable } from "../walkability";
import { aStar8 } from "../pathfinding/aStar8";
import {
  clearPathMaskRGBA,
  createPathMaskRGBA,
  stampPath,
} from "../rendering/pathMask";
import {
  initDungeonRuntimeState,
  derivePlatesFromBlocks,
  toggleLever,
} from "../dungeonState";
import { evaluateCircuits } from "../evaluateCircuits";

import { computeStartCell } from "../inspect/computeStartCell";

import { CP437_TILES } from "../rendering/codepage437Tiles";

import "./styles.css";

export interface Player {
  x: number;
  y: number;
}

function isBlocked(
  dungeon: BspDungeonOutputs,
  content: ContentOutputs,
  x: number,
  y: number,
  runtime?: any,
) {
  return !isTileWalkable(dungeon, content, x, y, {
    isDoorOpen: (doorId) => !!runtime?.doors?.[doorId]?.isOpen,
    isSecretRevealed: (secretId) => !!runtime?.secrets?.[secretId]?.revealed,
  });
}

export default function MinimalExample() {
  const seed = "test";
  const opts = {
    width: 64,
    height: 64,
    seed,
    CP437_TILES,
  };

  const contentOpts: ContentOptions = {
    seed,
    includeIntroGate: true,
  };

  const dungeon = useMemo(() => generateBspDungeon(opts), [seed]);
  const content = useMemo(
    () => generateDungeonContent(dungeon, contentOpts),
    [seed],
  );

  const startCell = useMemo(() => {
    return computeStartCell(dungeon, content);
  }, [dungeon, content]);

  // --- Runtime puzzle state (levers/doors/secrets) ---
  const [runtime, setRuntime] = useState(() => {
    let rt = initDungeonRuntimeState(content);
    rt = derivePlatesFromBlocks(rt, content);
    return evaluateCircuits(rt, content.meta.circuits).next;
  });

  // If you ever make seed dynamic, keep runtime in sync with new content:
  useEffect(() => {
    let rt = initDungeonRuntimeState(content);
    rt = derivePlatesFromBlocks(rt, content);
    setRuntime(evaluateCircuits(rt, content.meta.circuits).next);
  }, [content]);

  const [player, setPlayer] = useState<Player>({
    x: startCell.x,
    y: startCell.y,
  });

  // M7/M8: path mask — owned here, passed to DungeonRenderView
  const pathMaskRef = useRef<{
    data: Uint8Array;
    tex: THREE.DataTexture;
  } | null>(null);
  const [pathMaskTex, setPathMaskTex] = useState<THREE.DataTexture | null>(
    null,
  );
  const lastHoverCellRef = useRef<{ x: number; y: number } | null>(null);

  // Create/recreate path mask when dungeon dimensions change
  useEffect(() => {
    if (pathMaskRef.current) pathMaskRef.current.tex.dispose();
    const pm = createPathMaskRGBA(
      dungeon.width,
      dungeon.height,
      "path_mask_rgba",
    );
    pathMaskRef.current = pm;
    setPathMaskTex(pm.tex);
    return () => {
      pm.tex.dispose();
      pathMaskRef.current = null;
    };
  }, [dungeon.width, dungeon.height]);

  const recomputePlayerPath = useCallback(
    (targetX: number, targetY: number) => {
      const pm = pathMaskRef.current;
      if (!pm) return;
      clearPathMaskRGBA(pm.data);
      const result = aStar8(
        dungeon,
        content,
        { x: player.x, y: player.y },
        { x: targetX, y: targetY },
      );
      if (result) stampPath(pm.data, dungeon.width, result.path, "player");
      pm.tex.needsUpdate = true;
      setPathMaskTex(pm.tex); // force a re-render so DungeonRenderView sees the refreshed texture
    },
    [dungeon, content, player.x, player.y],
  );

  function moveLeft() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x - 1, p.y, runtime)) return p;
      return { x: p.x - 1, y: p.y };
    });
  }

  function moveRight() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x + 1, p.y, runtime)) return p;
      return { x: p.x + 1, y: p.y };
    });
  }

  function moveDown() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x, p.y + 1, runtime)) return p;
      return { x: p.x, y: p.y + 1 };
    });
  }

  function moveUp() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x, p.y - 1, runtime)) return p;
      return { x: p.x, y: p.y - 1 };
    });
  }

  useEffect(() => {
    hotkeys("a", () => {
      moveLeft();
    });
    hotkeys("s", () => {
      moveDown();
    });
    hotkeys("d", () => {
      moveRight();
    });
    hotkeys("w", () => {
      moveUp();
    });

    return () => {
      hotkeys.unbind();
    };
  }, []);

  // When a new dungeon loads (new start cell), reset player + clear any lingering hover path
  useEffect(() => {
    setPlayer({ x: startCell.x, y: startCell.y });
    lastHoverCellRef.current = null;
    const pm = pathMaskRef.current;
    if (pm) {
      clearPathMaskRGBA(pm.data);
      pm.tex.needsUpdate = true;
      setPathMaskTex(pm.tex);
    }
  }, [startCell.x, startCell.y]);

  return (
    <>
      <DungeonRenderView
        bsp={dungeon}
        content={content}
        focusX={player.x}
        focusY={player.y}
        onCellFocus={(cell) => console.log("cell focus", cell)}
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
        selectedX={player.x}
        selectedY={player.y}
        onCellHover={({ x, y, clientX, clientY }) => {
          const last = lastHoverCellRef.current;
          if (last && last.x === x && last.y === y) return;
          lastHoverCellRef.current = { x, y };

          console.log("recomputing path for", x, y);
          // Update *player* path visualization on hover
          recomputePlayerPath(x, y);
        }}
        onCellHoverEnd={() => {
          lastHoverCellRef.current = null;
          const pm = pathMaskRef.current;
          if (!pm) return;
          clearPathMaskRGBA(pm.data);
          pm.tex.needsUpdate = true;
          setPathMaskTex(pm.tex);
        }}
        onCellClick={({ x, y }) => {
          const w = dungeon.width;
          const i = y * w + x;
          const ft = content.masks.featureType[i] | 0;
          const fid = content.masks.featureId[i] | 0;
          if (ft === 6 && fid) {
            setRuntime((prev) => {
              const next0 = toggleLever(prev, fid);
              const next1 = derivePlatesFromBlocks(next0, content);
              return evaluateCircuits(next1, content.meta.circuits).next;
            });
            return true;
          }

          // Click-to-navigate: if A* finds a path, snap player to that target.
          // (MinimalExample: instant move. If you later want step-by-step, you can replay result.path.)
          const result = aStar8(
            dungeon,
            content,
            { x: player.x, y: player.y },
            { x, y },
          );
          if (!result) return true; // still handled; no move if unreachable

          setPlayer({ x, y });

          // Optional: clear the hover path after committing the move
          const pm = pathMaskRef.current;
          if (pm) {
            clearPathMaskRGBA(pm.data);
            pm.tex.needsUpdate = true;
            setPathMaskTex(pm.tex);
          }

          return true;
        }}
        // M7/M8: pass path mask into the shader
        pathMaskTex={pathMaskTex ?? undefined}
      />
    </>
  );
}
