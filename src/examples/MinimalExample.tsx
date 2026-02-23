import { useEffect, useState, useMemo } from "react";
import hotkeys from "hotkeys-js";

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
) {
  return !isTileWalkable(dungeon, content, x, y);
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

  const [player, setPlayer] = useState<Player>({
    x: startCell.x,
    y: startCell.y,
  });

  function moveLeft() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x - 1, p.y)) return p;
      return { x: p.x - 1, y: p.y };
    });
  }

  function moveRight() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x + 1, p.y)) return p;
      return { x: p.x + 1, y: p.y };
    });
  }

  function moveDown() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x, p.y + 1)) return p;
      return { x: p.x, y: p.y + 1 };
    });
  }

  function moveUp() {
    setPlayer((p) => {
      if (isBlocked(dungeon, content, p.x, p.y - 1)) return p;
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
          console.log(
            "cell hover",
            x,
            y,
            "clientX",
            clientX,
            "clientY",
            clientY,
          );
        }}
        onCellHoverEnd={() => {}}
        onCellClick={({ x, y }) => {
          console.log("cell click", x, y);
          return true;
        }}
      />
    </>
  );
}
