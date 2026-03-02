import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "./ui/Button";
import hotkeys from "hotkeys-js";
import * as THREE from "three";

import DungeonRenderView from "../rendering/DungeonRenderView";

import { aStar8 } from "../pathfinding/aStar8";
import { useGame } from "./GameProvider";
import {
  clearPathMaskRGBA,
  createPathMaskRGBA,
  stampPath,
} from "../rendering/pathMask";
import {
  clearActorCharMask,
  createActorCharMaskR8,
  type ActorCharMask,
} from "../rendering/actorCharMask";
import type { TurnAction } from "../turn/turnTypes";

import {
  generateForest,
  generateForestContent,
  type ForestContentOutputs,
  type ContentOutputs,
} from "../mazeGen";

import { CP437_TILES } from "../rendering/codepage437Tiles";

// Turn system
import {
  createPlayerActor,
  createMonstersFromResolved,
} from "../turn/createActors";
import {
  createTurnSystemState,
  tickUntilPlayer,
  commitPlayerAction,
  defaultComputeCost,
  defaultApplyAction,
  type TurnSystemState,
  type TurnSystemDeps,
} from "../turn/turnSystem";
import {
  type AutoWalkState,
  cancelAutoWalk,
  startAutoWalkForest,
  consumeNextAutoWalkStepForest,
  FOREST_TREE_PENALTY,
} from "../turn/playerAutoWalk";
import {
  createWorldEffectsState,
  advanceWorldEffects,
} from "../world/worldEffects";

import "./styles.css";

import BorderPanel from "./ui/BorderPanel";
import Tooltip, { TooltipProps } from "./ui/Tooltip";
import ModalPanel from "./ui/ModalPanel";
import { useConfirmYesNo } from "./ui/useConfirmYesNo";

export interface Player {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Dungeon generation
// ---------------------------------------------------------------------------

const AUTOWALK_DELAY = 63;

/** Must match the `radius` value passed to DungeonRenderView (visibility.ts). */
const PLAYER_VIS_RADIUS = 6;

/** Forest overworld has no doors, blocks, or levers — pass empty runtime. */
const EMPTY_RUNTIME = {} as any;

function buildForest(seed: string | number) {
  const bsp = generateForest({ seed, width: 64, height: 64 });
  // Trees are visually present but physically passable — use zeroed solid for pathfinding.
  const walkDungeon = {
    ...bsp,
    masks: { ...bsp.masks, solid: new Uint8Array(bsp.width * bsp.height) },
  };

  const content = generateForestContent(bsp, { seed, portalCount: 10 });
  // content.meta.dungeonPortals[i].seed  → pass to generateDungeonContent
  // content.meta.dungeonPortals[i].theme → dungeon flavour
  // content.meta.dungeonPortals[i].level → difficulty 1-10

  return { bsp, walkDungeon, content };
}

export interface OverworldProps {
  seed: string | number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Overworld({ seed }: OverworldProps) {
  const result = useMemo(() => buildForest(seed), []);
  const dungeon = result.bsp;
  const walkDungeon = result.walkDungeon;
  const content: ForestContentOutputs = result.content;
  // Cast for typed APIs (TurnSystemDeps, aStar8, DungeonRenderView) that expect
  // ContentOutputs — those APIs only access featureType & featureId masks, which
  // ForestContentOutputs provides.
  const contentLegacy = content as unknown as ContentOutputs;

  const { goTo, setSeed, setOverworld } = useGame();

  // Player spawn comes directly from forest content — no need for computeStartCell.
  const startCell = content.meta.playerSpawn;

  // --- World effects clock ---
  const worldEffectsRef = useRef(createWorldEffectsState());

  const [showCampModal, setShowCampModal] = useState(false);

  const { confirmPrompt, dialog } = useConfirmYesNo();

  const [tooltip, setTooltip] = useState<TooltipProps>({
    x: 0,
    y: 0,
    visible: false,
    children: <></>,
  });

  // --- Turn system ---
  const [turnState, setTurnState] = useState<TurnSystemState>(() => {
    const player = createPlayerActor(startCell.x, startCell.y);
    const monsters = createMonstersFromResolved(null);
    const ts = createTurnSystemState(player, monsters);
    const deps = buildDeps(dungeon, ts.actors);
    return tickUntilPlayer(ts, deps);
  });

  const turnStateRef = useRef(turnState);
  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);

  // --- Auto-walk (click-to-navigate route follower) ---
  const [autoWalk, setAutoWalk] = useState<AutoWalkState>({ kind: "idle" });

  function buildDeps(
    _dungeon: typeof dungeon,
    _actors: TurnSystemState["actors"],
  ): TurnSystemDeps {
    return {
      dungeon: _dungeon,
      content: contentLegacy,
      runtime: EMPTY_RUNTIME,
      isWalkable: (x, y) =>
        x >= 0 && y >= 0 && x < _dungeon.width && y < _dungeon.height,
      monsterDecide: () => {
        throw new Error("No monsters in forest overworld");
      },
      computeCost: (actorId, action) =>
        defaultComputeCost(actorId, action, _actors),
      applyAction: defaultApplyAction,
      log: true,
      onTimeAdvanced: ({ prevTime, nextTime }) => {
        const dt = nextTime - prevTime;
        if (dt <= 0) return;
        const r = advanceWorldEffects(worldEffectsRef.current, dt);
        worldEffectsRef.current = r.next;
      },
    };
  }

  // --- Convenience: player position from turn state ---
  const playerActor = turnState.actors[turnState.playerId];
  const playerX = playerActor?.x ?? startCell.x;
  const playerY = playerActor?.y ?? startCell.y;

  // --- Path mask ---
  const pathMaskRef = useRef<{
    data: Uint8Array;
    tex: THREE.DataTexture;
  } | null>(null);
  const [pathMaskTex, setPathMaskTex] = useState<THREE.DataTexture | null>(
    null,
  );
  const lastHoverCellRef = useRef<{ x: number; y: number } | null>(null);
  const playerPreviewPathRef = useRef<
    import("../pathfinding/aStar8").GridPos[] | null
  >(null);

  // --- Visibility buffer (from renderer) ---
  const visDataRef = useRef<Uint8Array | null>(null);

  // --- Actor char overlay ---
  const actorMaskRef = useRef<ActorCharMask | null>(null);
  const [actorCharTex, setActorCharTex] = useState<THREE.DataTexture | null>(
    null,
  );

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

  // Create actor overlay texture once per dungeon dimensions.
  useEffect(() => {
    if (actorMaskRef.current) actorMaskRef.current.tex.dispose();
    const am = createActorCharMaskR8(
      dungeon.width,
      dungeon.height,
      "actor_char_r8",
    );
    actorMaskRef.current = am;
    setActorCharTex(am.tex);
    return () => {
      am.tex.dispose();
      actorMaskRef.current = null;
    };
  }, [dungeon.width, dungeon.height]);

  const rebuildPathMaskFromPlans = useCallback(() => {
    const pm = pathMaskRef.current;
    if (!pm) return;
    clearPathMaskRGBA(pm.data);
    if (playerPreviewPathRef.current) {
      stampPath(pm.data, dungeon.width, playerPreviewPathRef.current, "player");
    }
    pm.tex.needsUpdate = true;
    setPathMaskTex(pm.tex);
  }, [dungeon.width]);

  // Forest has no monsters or blocks — just clear the actor overlay.
  useEffect(() => {
    const am = actorMaskRef.current;
    if (!am) return;
    clearActorCharMask(am.data);
    am.tex.needsUpdate = true;

    setOverworld(dungeon, content);
  }, [dungeon, content]);

  const recomputePlayerPath = useCallback(
    (targetX: number, targetY: number) => {
      const W = dungeon.width;
      const solid = dungeon.masks.solid;
      const pathResult = aStar8(
        walkDungeon,
        contentLegacy,
        { x: playerX, y: playerY },
        { x: targetX, y: targetY },
        {},
        {
          cellCost: (x, y) =>
            solid[y * W + x] === 255 ? FOREST_TREE_PENALTY : 0,
        },
      );
      playerPreviewPathRef.current = pathResult?.path ?? null;
      rebuildPathMaskFromPlans();
    },
    [
      dungeon,
      walkDungeon,
      contentLegacy,
      playerX,
      playerY,
      rebuildPathMaskFromPlans,
    ],
  );

  // --- Centralized auto-walk cancellation ---
  const cancelAutoWalkNow = useCallback(() => {
    setAutoWalk(cancelAutoWalk());
    playerPreviewPathRef.current = null;
    lastHoverCellRef.current = null;
    rebuildPathMaskFromPlans();
  }, [rebuildPathMaskFromPlans]);

  // --- Centralized player action commit ---
  function attemptCommitPlayerAction(action: TurnAction): void {
    const ts = turnStateRef.current;
    if (!ts.awaitingPlayerInput) return;
    setTurnState((prev) => {
      if (!prev.awaitingPlayerInput) return prev;
      const deps = buildDeps(dungeon, prev.actors);
      return commitPlayerAction(prev, deps, action);
    });
  }

  function tryCommitMove(dx: number, dy: number) {
    cancelAutoWalkNow();
    attemptCommitPlayerAction({ kind: "move", dx, dy });
  }

  function tryCommitWait() {
    cancelAutoWalkNow();
    setTurnState((prev) => {
      if (!prev.awaitingPlayerInput) return prev;
      const deps = buildDeps(dungeon, prev.actors);
      return commitPlayerAction(prev, deps, { kind: "wait" });
    });
  }

  // --- Keyboard input ---
  useEffect(() => {
    hotkeys("a,left", () => tryCommitMove(-1, 0));
    hotkeys("d,right", () => tryCommitMove(1, 0));
    hotkeys("s,down", () => tryCommitMove(0, 1));
    hotkeys("w,up", () => tryCommitMove(0, -1));
    hotkeys(".", () => tryCommitWait());
    hotkeys("esc", (e) => {
      e.preventDefault();
      cancelAutoWalkNow();
    });

    return () => hotkeys.unbind();
  }, [dungeon, cancelAutoWalkNow]);

  // --- Auto-walk step loop ---
  useEffect(() => {
    if (!turnState.awaitingPlayerInput) return;
    if (autoWalk.kind !== "active") return;

    const timer = setTimeout(() => {
      const { nextAutoWalk, action, pathForOverlay } =
        consumeNextAutoWalkStepForest({
          autoWalk,
          turnState,
          walkDungeon,
          bsp: dungeon,
          content,
        });

      playerPreviewPathRef.current = pathForOverlay;
      rebuildPathMaskFromPlans();

      if (!action) {
        setAutoWalk(nextAutoWalk);
        return;
      }

      setAutoWalk(nextAutoWalk);
      attemptCommitPlayerAction(action);
    }, AUTOWALK_DELAY);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    turnState.awaitingPlayerInput,
    turnState.actors,
    autoWalk,
    walkDungeon,
    dungeon,
    content,
    rebuildPathMaskFromPlans,
  ]);

  // Reset turn state when start cell changes (new dungeon).
  useEffect(() => {
    lastHoverCellRef.current = null;
    playerPreviewPathRef.current = null;
    setAutoWalk(cancelAutoWalk());
    rebuildPathMaskFromPlans();
    const newPlayer = createPlayerActor(startCell.x, startCell.y);
    const monsters = createMonstersFromResolved(null);
    const ts = createTurnSystemState(newPlayer, monsters);
    const deps = buildDeps(dungeon, ts.actors);
    setTurnState(tickUntilPlayer(ts, deps));
  }, [startCell.x, startCell.y]);

  const contentAtPlayerCell = content.meta.dungeonPortals.find(
    (f) => f.x === playerX && f.y === playerY,
  );

  return (
    <>
      <BorderPanel
        title="Overworld"
        width="20rem"
        height="5rem"
        background="#090909"
        bottom="0px"
      >
        <div>
          Player ({playerX}, {playerY})
        </div>
        {contentAtPlayerCell ? (
          <div>
            {contentAtPlayerCell.theme} (lvl {contentAtPlayerCell.level})
          </div>
        ) : null}
      </BorderPanel>
      <BorderPanel
        title="Actions"
        width="22rem"
        height="5rem"
        background="#090909"
        bottom="0px"
        left="21rem"
      >
        <Button maxWidth="8rem" onClick={() => setShowCampModal(true)}>
          Camp
        </Button>
        {contentAtPlayerCell ? (
          <Button
            maxWidth="12rem"
            onClick={async () => {
              if (
                await confirmPrompt(
                  `Are you sure you want to enter ${contentAtPlayerCell.theme}?`,
                )
              ) {
                setSeed(contentAtPlayerCell.seed);
                goTo("dungeon");
              }
            }}
          >
            Enter {contentAtPlayerCell.theme}
          </Button>
        ) : null}
      </BorderPanel>

      <Tooltip {...tooltip} />

      {dialog}

      <ModalPanel
        title="Camp"
        visible={showCampModal}
        closeButton
        onClose={() => setShowCampModal(false)}
      >
        <div>
          <h2>Camping</h2>
        </div>
        <div>
          Camping at Location ({playerX}, {playerY})
        </div>
      </ModalPanel>

      <DungeonRenderView
        bsp={dungeon}
        content={contentLegacy}
        focusX={playerX}
        focusY={playerY}
        onCellFocus={(cell) => console.log("cell focus", cell)}
        playerX={playerX}
        playerY={playerY}
        playerTile={CP437_TILES.player}
        floorTile={CP437_TILES.floor}
        wallTile={5}
        doorTile={CP437_TILES.doorClosed}
        keyTile={CP437_TILES.key}
        leverTile={CP437_TILES.lever}
        plateTile={CP437_TILES.plate}
        blockTile={CP437_TILES.block}
        suppressBlocks
        blockPositions={[]}
        chestTile={CP437_TILES.chest}
        monsterTile={CP437_TILES.monster}
        secretDoorTile={CP437_TILES.secretDoor}
        hiddenPassageTile={CP437_TILES.hiddenPassage}
        hazardDefaultTile={CP437_TILES.hazard}
        exitTile={CP437_TILES.exit}
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
        selectedX={playerX}
        selectedY={playerY}
        onCellHover={({ x, y, clientX, clientY }) => {
          if (autoWalk.kind === "active") return;
          const last = lastHoverCellRef.current;
          if (last && last.x === x && last.y === y) return;
          lastHoverCellRef.current = { x, y };

          const contentAtCell = content.meta.dungeonPortals.find(
            (f) => f.x === x && f.y === y,
          );

          if (contentAtCell) {
            setTooltip({
              x: clientX,
              y: clientY,
              visible: true,
              children: (
                <>
                  ({x}, {y}){" "}
                  {contentAtCell
                    ? `${contentAtCell.theme} (lvl ${contentAtCell.level})`
                    : null}
                </>
              ),
            });
          } else {
            setTooltip({ ...tooltip, visible: false });
          }
          recomputePlayerPath(x, y);
        }}
        onCellHoverEnd={() => {
          lastHoverCellRef.current = null;
          if (autoWalk.kind === "active") return;
          playerPreviewPathRef.current = null;
          setTooltip({ x: 0, y: 0, visible: false, children: <></> });
          rebuildPathMaskFromPlans();
        }}
        onCellClick={({ x, y }) => {
          const w = dungeon.width;
          const i = y * w + x;
          const ft = content.masks.featureType[i] | 0;
          const fid = content.masks.featureId[i] | 0;

          setTooltip({ ...tooltip, visible: false });

          // Dungeon portal entry (FeatureType 2)
          // if (ft === 2 && fid) {
          //   const portal = content.meta.dungeonPortals.find((p) => p.id === fid);
          //   if (portal) {
          //     console.log("enter portal", portal);
          //     // TODO: goTo("dungeon", { portal })
          //   }
          //   return true;
          // }

          // Click-to-navigate: start auto-walk toward target.
          const newAutoWalk = startAutoWalkForest({
            from: { x: playerX, y: playerY },
            target: { x, y },
            walkDungeon,
            bsp: dungeon,
            content,
          });
          setAutoWalk(newAutoWalk);

          if (newAutoWalk.kind === "active") {
            playerPreviewPathRef.current = newAutoWalk.path;
          } else {
            playerPreviewPathRef.current = null;
          }
          rebuildPathMaskFromPlans();

          return true;
        }}
        pathMaskTex={pathMaskTex ?? undefined}
        actorCharTex={actorCharTex}
        _visDataRef={visDataRef}
        shaderVariant="forest"
      />
    </>
  );
}
