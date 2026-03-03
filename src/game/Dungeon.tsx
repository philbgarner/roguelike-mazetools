import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hotkeys from "hotkeys-js";
import * as THREE from "three";

import DungeonRenderView from "../rendering/DungeonRenderView";

import { isTileWalkable } from "../walkability";
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
  stampBlocksToActorCharMask,
  stampMonstersToActorCharMask,
  type ActorCharMask,
} from "../rendering/actorCharMask";
import {
  initDungeonRuntimeState,
  derivePlatesFromBlocks,
  toggleLever,
  getBlockIdAt,
  tryPushBlock,
} from "../dungeonState";
import type { TurnAction, MonsterActor } from "../turn/turnTypes";
import { evaluateCircuits } from "../evaluateCircuits";

import { computeStartCell } from "../inspect/computeStartCell";
import { generateDungeon } from "../api/generateDungeon";
import { getTheme } from "../theme/themeRegistry";
import { dungeonThemeToRenderTheme } from "../rendering/renderTheme";

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
  type TurnSystemState,
  type TurnSystemDeps,
} from "../turn/turnSystem";
import { combatApplyAction } from "../turn/combatApplyAction";
import { decideChasePlayer } from "../turn/monsterAI";
import {
  computeEnemyPlannedPaths,
  type PlannedPath,
} from "../turn/plannedPaths";
import {
  type AutoWalkState,
  startAutoWalk,
  cancelAutoWalk,
  consumeNextAutoWalkStep,
} from "../turn/playerAutoWalk";
import { countVisibleMonsters } from "../turn/visibleMonsters";
import {
  createWorldEffectsState,
  advanceWorldEffects,
} from "../world/worldEffects";
import type { TurnEvent } from "../turn/turnEvents";
import { useTurnEvents } from "./useTurnEvents";
import { useFloatingMessage } from "./useFloatingMessage";

import "./styles.css";

import BorderPanel from "./ui/BorderPanel";

export interface Player {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Dungeon generation (via API so we get resolved monster spawns)
// ---------------------------------------------------------------------------

//const SEED = "test";
//const THEME_ID = "medieval_keep";
const THEME_ID = "babylon_ziggurat";

const AUTOWALK_DELAY = 63;

/** Must match the `radius` value passed to DungeonRenderView (visibility.ts). */
const PLAYER_VIS_RADIUS = 6;

function buildDungeon(seed: string | number, level: number) {
  return generateDungeon({
    seed,
    level,
    themeId: THEME_ID,
    width: 64,
    height: 64,
    pattern: { includeIntroGate: true },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface DungeonProps {
  seed: string | number;
}

export default function Dungeon({ seed }: DungeonProps) {
  const { goTo, overworldBsp, setSeed, level, setLevel } = useGame();
  const result = useMemo(() => buildDungeon(seed, level), []);
  const dungeon = result.bsp;
  const content = result.content;
  const renderTheme = useMemo(
    () => dungeonThemeToRenderTheme(getTheme(THEME_ID)),
    [],
  );

  const startCell = useMemo(
    () => computeStartCell(dungeon, content),
    [dungeon, content],
  );

  // --- Runtime puzzle state (levers / doors / secrets) ---
  const [runtime, setRuntime] = useState(() => {
    let rt = initDungeonRuntimeState(content);
    rt = derivePlatesFromBlocks(rt, content);
    return evaluateCircuits(rt, content.meta.circuits).next;
  });

  useEffect(() => {
    let rt = initDungeonRuntimeState(content);
    rt = derivePlatesFromBlocks(rt, content);
    setRuntime(evaluateCircuits(rt, content.meta.circuits).next);
  }, [content]);

  // Keep a ref so AI / walkability callbacks can always read the latest runtime
  // without stale closure issues.
  const runtimeRef = useRef(runtime);
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  // Memoized block positions for tint overlay (metallic sheen follows moved blocks)
  const blockPositions = useMemo(
    () => Object.values(runtime.blocks),
    [runtime],
  );

  // --- Turn event queue ---
  // Declared before turnState useState so it is available in the lazy initializer.
  // Turn system pushes events here synchronously; useTurnEvents drains them in an effect.
  const pendingEventsRef = useRef<TurnEvent[]>([]);

  // --- World effects clock (accumulates scheduler time → ticks for fire/water etc.) ---
  // Must be declared before turnState useState so the initializer's tickUntilPlayer
  // can call onTimeAdvanced without hitting the TDZ.
  const worldEffectsRef = useRef(createWorldEffectsState());

  // --- Turn system ---
  const [turnState, setTurnState] = useState<TurnSystemState>(() => {
    const player = createPlayerActor(startCell.x, startCell.y);
    const monsters = createMonstersFromResolved(result.resolved);
    const ts = createTurnSystemState(player, monsters);
    const deps = buildDeps(dungeon, content, runtimeRef.current, ts.actors);
    return tickUntilPlayer(ts, deps);
  });

  // Stable ref to current turnState actors for cost computation.
  const turnStateRef = useRef(turnState);
  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);

  // --- Auto-walk (click-to-navigate route follower) ---
  const [autoWalk, setAutoWalk] = useState<AutoWalkState>({ kind: "idle" });

  // --- Turn events → React bridge ---
  const { subscribe } = useTurnEvents(pendingEventsRef, turnState);

  const { push: pushFloatingMessage, floatingMessages } = useFloatingMessage({
    mapWidth: dungeon.width,
    mapHeight: dungeon.height,
  });

  useEffect(
    () =>
      subscribe("damage", (evt) => {
        pushFloatingMessage(`-${evt.amount}`, evt.x, evt.y, {
          color: "#ff4444",
        });
      }),
    [subscribe, pushFloatingMessage],
  );

  useEffect(
    () =>
      subscribe("heal", (evt) => {
        pushFloatingMessage(`+${evt.amount}`, evt.x, evt.y, {
          color: "#44ff88",
        });
      }),
    [subscribe, pushFloatingMessage],
  );

  useEffect(
    () =>
      subscribe("miss", (evt) => {
        pushFloatingMessage("miss", evt.x, evt.y, { color: "#aaaaaa" });
      }),
    [subscribe, pushFloatingMessage],
  );

  useEffect(
    () =>
      subscribe("xpGain", (evt) => {
        pushFloatingMessage(`+${evt.amount} xp`, evt.x, evt.y, {
          color: "#ffdd55",
        });
      }),
    [subscribe, pushFloatingMessage],
  );

  function buildDeps(
    _dungeon: typeof dungeon,
    _content: typeof content,
    _runtime: typeof runtime,
    _actors: TurnSystemState["actors"],
  ): TurnSystemDeps {
    return {
      dungeon: _dungeon,
      content: _content,
      runtime: _runtime,
      isWalkable: (x, y) =>
        isTileWalkable(_dungeon, _content, x, y, {
          isDoorOpen: (doorId) => !!runtimeRef.current?.doors?.[doorId]?.isOpen,
          isSecretRevealed: (secretId) =>
            !!runtimeRef.current?.secrets?.[secretId]?.revealed,
        }) && getBlockIdAt(runtimeRef.current, x, y) === null,
      monsterDecide: (state, monsterId) =>
        decideChasePlayer(
          state,
          monsterId,
          _dungeon,
          _content,
          runtimeRef.current,
          PLAYER_VIS_RADIUS,
        ),
      computeCost: (actorId, action) =>
        defaultComputeCost(actorId, action, _actors),
      applyAction: combatApplyAction,
      log: true,
      onTimeAdvanced: ({ prevTime, nextTime }) => {
        const dt = nextTime - prevTime;
        if (dt <= 0) return;
        const r = advanceWorldEffects(worldEffectsRef.current, dt);
        worldEffectsRef.current = r.next;
      },
      onEvent: (evt) => pendingEventsRef.current.push(evt),
    };
  }

  // --- Convenience: player position from turn state ---
  const playerActor = turnState.actors[turnState.playerId];
  const playerX = playerActor?.x ?? startCell.x;
  const playerY = playerActor?.y ?? startCell.y;

  // --- Exit cell (centre of farthest room, same logic as DungeonRenderView) ---
  const exitCell = useMemo(() => {
    const exitRoomId = (content.meta.farthestRoomId ?? 0) | 0;
    if (exitRoomId <= 0) return null;
    const W = dungeon.width;
    const H = dungeon.height;
    const regionId = dungeon.masks.regionId;
    let minX = 1e9,
      minY = 1e9,
      maxX = -1,
      maxY = -1,
      found = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((regionId[y * W + x] | 0) === exitRoomId) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    return {
      x: Math.floor((minX + maxX) / 2),
      y: Math.floor((minY + maxY) / 2),
    };
  }, [dungeon, content]);

  useEffect(() => {
    if (
      overworldBsp &&
      exitCell &&
      playerX === exitCell.x &&
      playerY === exitCell.y
    ) {
      setSeed(overworldBsp?.meta.seedUsed);
      goTo("overworld");
    }
  }, [playerX, playerY, exitCell]);

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
  const enemyPlannedPathsRef = useRef<PlannedPath[]>([]);

  // --- Visibility buffer (from renderer) ---
  const visDataRef = useRef<Uint8Array | null>(null);

  // --- Autowalk cancel trigger: visible monster count baseline ---
  const prevVisibleMonsterCountRef = useRef<number>(0);

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

  // Create actor overlay texture once per dungeon dimensions
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

  // Single authoritative rebuild: clears the mask once then stamps enemy paths
  // followed by the player preview path. Call whenever either source changes.
  const rebuildPathMaskFromPlans = useCallback(() => {
    const pm = pathMaskRef.current;
    if (!pm) return;
    clearPathMaskRGBA(pm.data);
    for (const ep of enemyPlannedPathsRef.current) {
      stampPath(pm.data, dungeon.width, ep.path, "enemy", ep.stepsToShow);
    }
    if (playerPreviewPathRef.current) {
      stampPath(pm.data, dungeon.width, playerPreviewPathRef.current, "player");
    }
    pm.tex.needsUpdate = true;
    setPathMaskTex(pm.tex);
  }, [dungeon.width]);

  // Recompute enemy planned paths and rebuild the path mask whenever actors move.
  useEffect(() => {
    enemyPlannedPathsRef.current = computeEnemyPlannedPaths({
      state: turnState,
      dungeon,
      content,
      runtime: runtimeRef.current,
      maxSteps: 32,
    });
    rebuildPathMaskFromPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnState.actors, dungeon, content, rebuildPathMaskFromPlans]);

  // Stamp monsters and blocks into the actor overlay whenever turn state, player
  // position, or runtime (block positions) change.
  useEffect(() => {
    const am = actorMaskRef.current;
    if (!am) return;
    const W = dungeon.width;
    const H = dungeon.height;
    clearActorCharMask(am.data);
    const monsters = Object.values(turnState.actors).filter(
      (a) => a.kind === "monster" && a.alive,
    );
    stampMonstersToActorCharMask({
      data: am.data,
      W,
      H,
      monsters: (monsters as MonsterActor[]).map((m) => ({
        id: m.id,
        x: m.x,
        y: m.y,
        tile: m.glyph.charCodeAt(0),
      })),
      monsterTile: CP437_TILES.monster,
      avoidCell: { x: playerX, y: playerY },
      blocked: (x, y) => dungeon.masks.solid[y * W + x] === 255,
    });
    stampBlocksToActorCharMask({
      data: am.data,
      W,
      H,
      blocks: Object.values(runtime.blocks),
      blockTile: CP437_TILES.block,
    });
    am.tex.needsUpdate = true;
  }, [turnState.actors, playerX, playerY, dungeon, runtime]);

  const recomputePlayerPath = useCallback(
    (targetX: number, targetY: number) => {
      const rt = runtimeRef.current;
      const pathResult = aStar8(
        dungeon,
        content,
        { x: playerX, y: playerY },
        { x: targetX, y: targetY },
        {
          isDoorOpen: (doorId) => !!rt?.doors?.[doorId]?.isOpen,
          isSecretRevealed: (secretId) => !!rt?.secrets?.[secretId]?.revealed,
        },
        { isBlocked: (x, y) => getBlockIdAt(rt, x, y) !== null },
      );
      playerPreviewPathRef.current = pathResult?.path ?? null;
      rebuildPathMaskFromPlans();
    },
    [dungeon, content, playerX, playerY, rebuildPathMaskFromPlans],
  );

  const computeVisibleMonsterCount = useCallback((): number => {
    return countVisibleMonsters({
      playerX,
      playerY,
      radius: PLAYER_VIS_RADIUS,
      actors: turnState.actors,
    });
  }, [playerX, playerY, turnState.actors]);

  // --- Centralized auto-walk cancellation ---
  const cancelAutoWalkNow = useCallback(() => {
    setAutoWalk(cancelAutoWalk());
    playerPreviewPathRef.current = null;
    lastHoverCellRef.current = null;
    rebuildPathMaskFromPlans();
  }, [rebuildPathMaskFromPlans]);

  // --- Centralized player action commit (handles block push + rejection) ---
  function attemptCommitPlayerAction(action: TurnAction): void {
    const ts = turnStateRef.current;
    if (!ts.awaitingPlayerInput) return;

    if (action.kind === "move") {
      const player = ts.actors[ts.playerId];
      if (player) {
        const nx = player.x + (action.dx ?? 0);
        const ny = player.y + (action.dy ?? 0);
        const blockId = getBlockIdAt(runtimeRef.current, nx, ny);
        if (blockId !== null) {
          // Push block in the direction the player is moving; reject move if push is impossible.
          const pushed = tryPushBlock(
            runtimeRef.current,
            dungeon,
            content,
            blockId,
            action.dx ?? 0,
            action.dy ?? 0,
          );
          if (!pushed.ok) return;
          let rt2 = derivePlatesFromBlocks(pushed.next, content);
          rt2 = evaluateCircuits(rt2, content.meta.circuits).next;
          console.log(
            "block in",
            nx,
            ny,
            "blockId=",
            blockId,
            pushed,
            "rt2",
            rt2,
          );
          runtimeRef.current = rt2;
          setRuntime(rt2);
          setTurnState((prev) => {
            if (!prev.awaitingPlayerInput) return prev;
            const deps = buildDeps(dungeon, content, rt2, prev.actors);
            return commitPlayerAction(prev, deps, action);
          });
          return;
        }
      }
    }

    setTurnState((prev) => {
      if (!prev.awaitingPlayerInput) return prev;
      const deps = buildDeps(dungeon, content, runtimeRef.current, prev.actors);
      return commitPlayerAction(prev, deps, action);
    });
  }

  // --- Committed move helper ---
  function tryCommitMove(dx: number, dy: number) {
    cancelAutoWalkNow();
    attemptCommitPlayerAction({ kind: "move", dx, dy });
  }

  function tryCommitWait() {
    cancelAutoWalkNow();
    setTurnState((prev) => {
      if (!prev.awaitingPlayerInput) return prev;
      const deps = buildDeps(dungeon, content, runtimeRef.current, prev.actors);
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
    hotkeys("q", () => {
      if (overworldBsp) {
        setSeed(overworldBsp?.meta.seedUsed);
        goTo("overworld");
      }
    });
    hotkeys("esc", (e) => {
      e.preventDefault();
      cancelAutoWalkNow();
    });

    return () => hotkeys.unbind();
  }, [dungeon, content, cancelAutoWalkNow]);

  // --- Autowalk cancel trigger: visible monster count increases ---
  useEffect(() => {
    const current = computeVisibleMonsterCount();
    const prev = prevVisibleMonsterCountRef.current;

    if (autoWalk.kind === "active" && current > prev) {
      cancelAutoWalkNow();
    }

    prevVisibleMonsterCountRef.current = current;
  }, [
    autoWalk.kind,
    playerX,
    playerY,
    turnState.actors,
    computeVisibleMonsterCount,
    cancelAutoWalkNow,
  ]);

  // --- Auto-walk step loop ---
  // Runs once per player turn while a route is active. Commits exactly one step,
  // then commitPlayerAction → tickUntilPlayer advances monsters until the player
  // gets control again, at which point this effect fires for the next step.
  useEffect(() => {
    if (!turnState.awaitingPlayerInput) return;
    if (autoWalk.kind !== "active") return;

    const timer = setTimeout(() => {
      const rt = runtimeRef.current;
      const { nextAutoWalk, action, pathForOverlay } = consumeNextAutoWalkStep({
        autoWalk,
        turnState,
        dungeon,
        content,
        runtime: rt,
      });

      // Update overlay to remaining route (or clear if done).
      playerPreviewPathRef.current = pathForOverlay;
      rebuildPathMaskFromPlans();

      if (!action) {
        setAutoWalk(nextAutoWalk); // idle — arrived or blocked
        return;
      }

      // If the next step would attack a monster, commit only that one action
      // then stop auto-walk so the player decides what to do next.
      let effectiveNextAutoWalk = nextAutoWalk;
      if (action.kind === "move" && action.dx !== undefined && action.dy !== undefined) {
        const tx = playerX + action.dx;
        const ty = playerY + action.dy;
        const hasMonster = Object.values(turnState.actors).some(
          (a) => a.id !== turnState.playerId && a.alive && a.x === tx && a.y === ty,
        );
        if (hasMonster) effectiveNextAutoWalk = { kind: "idle" };
      }

      setAutoWalk(effectiveNextAutoWalk);
      attemptCommitPlayerAction(action);
    }, AUTOWALK_DELAY);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    turnState.awaitingPlayerInput,
    turnState.actors,
    autoWalk,
    dungeon,
    content,
    rebuildPathMaskFromPlans,
  ]);

  // Reset turn state when start cell changes (new dungeon)
  useEffect(() => {
    lastHoverCellRef.current = null;
    playerPreviewPathRef.current = null;
    enemyPlannedPathsRef.current = [];
    setAutoWalk(cancelAutoWalk());
    rebuildPathMaskFromPlans();
    const newPlayer = createPlayerActor(startCell.x, startCell.y);
    const monsters = createMonstersFromResolved(result.resolved);
    console.log(
      "seed",
      seed,
      "level",
      level,
      "result",
      result,
      "monsters",
      monsters,
    );
    const ts = createTurnSystemState(newPlayer, monsters);
    const deps = buildDeps(dungeon, content, runtimeRef.current, ts.actors);
    setTurnState(tickUntilPlayer(ts, deps));
  }, [startCell.x, startCell.y]);

  return (
    <>
      <BorderPanel width="20rem" height="5rem" background="#000" bottom="0px">
        HP: {playerActor.hp}/{playerActor.maxHp}
      </BorderPanel>
      <DungeonRenderView
        bsp={dungeon}
        content={content}
        theme={renderTheme}
        focusX={playerX}
        focusY={playerY}
        onCellFocus={(cell) => console.log("cell focus", cell)}
        playerX={playerX}
        playerY={playerY}
        playerTile={CP437_TILES.player}
        floorTile={CP437_TILES.floor}
        wallTile={CP437_TILES.wall}
        doorTile={CP437_TILES.doorClosed}
        keyTile={CP437_TILES.key}
        leverTile={CP437_TILES.lever}
        plateTile={CP437_TILES.plate}
        blockTile={CP437_TILES.block}
        suppressBlocks
        blockPositions={blockPositions}
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
        onCellHover={({ x, y }) => {
          // While auto-walking, keep the route overlay — don't overwrite with hover.
          if (autoWalk.kind === "active") return;
          const last = lastHoverCellRef.current;
          if (last && last.x === x && last.y === y) return;
          lastHoverCellRef.current = { x, y };
          recomputePlayerPath(x, y);
        }}
        onCellHoverEnd={() => {
          lastHoverCellRef.current = null;
          // While auto-walking, preserve the route overlay.
          if (autoWalk.kind === "active") return;
          playerPreviewPathRef.current = null;
          rebuildPathMaskFromPlans();
        }}
        onCellClick={({ x, y }) => {
          const w = dungeon.width;
          const i = y * w + x;
          const ft = content.masks.featureType[i] | 0;
          const fid = content.masks.featureId[i] | 0;

          // Lever toggle (FeatureType 6)
          if (ft === 6 && fid) {
            setRuntime((prev) => {
              const next0 = toggleLever(prev, fid);
              const next1 = derivePlatesFromBlocks(next0, content);
              return evaluateCircuits(next1, content.meta.circuits).next;
            });
            return true;
          }

          // Click-to-navigate: start auto-walk toward target.
          // The step-per-turn effect loop will commit one move each time the
          // player gets control, letting monsters act between steps.
          const rt = runtimeRef.current;
          const newAutoWalk = startAutoWalk({
            from: { x: playerX, y: playerY },
            target: { x, y },
            dungeon,
            content,
            runtime: rt,
          });
          setAutoWalk(newAutoWalk);

          // Baseline visible monsters at autowalk start (prevents first-tick mismatch).
          prevVisibleMonsterCountRef.current = computeVisibleMonsterCount();

          // Show the planned route immediately in the overlay.
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
      >
        {floatingMessages}
      </DungeonRenderView>
    </>
  );
}
