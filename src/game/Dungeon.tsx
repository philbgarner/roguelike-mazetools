import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hotkeys from "hotkeys-js";
import * as THREE from "three";

import DungeonRenderView from "../rendering/DungeonRenderView";

import { isTileWalkable } from "../walkability";
import { aStar8 } from "../pathfinding/aStar8";
import { useGame } from "./GameProvider";
import { playerFromActor } from "./player";
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
import type { TurnAction, MonsterActor, PlayerActor } from "../turn/turnTypes";
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
import { FocusLerper } from "./FocusLerper";

import BorderPanel from "./ui/BorderPanel";
import Tooltip, { TooltipProps } from "./ui/Tooltip";
import MessageLog from "./ui/MessageLog";
import { useMessageLog } from "./ui/useMessageLog";

// ---------------------------------------------------------------------------
// Dungeon generation (via API so we get resolved monster spawns)
// ---------------------------------------------------------------------------

const AUTOWALK_DELAY = 63;

/** Must match the `radius` value passed to DungeonRenderView (visibility.ts). */
const PLAYER_VIS_RADIUS = 6;

const MAP_ZOOM_DEFAULT = 32;
const MAP_ZOOM_MIN = 4;
const MAP_ZOOM_MAX = 32;

const TOOLTIP_DELAY = 600;

function buildDungeon(seed: string | number, level: number, themeId: string) {
  return generateDungeon({
    seed,
    level,
    themeId,
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
  const {
    goTo,
    overworldBsp,
    setSeed,
    level,
    setLevel,
    theme,
    player,
    setPlayer,
  } = useGame();
  const result = useMemo(() => buildDungeon(seed, level, theme), []);
  const dungeon = result.bsp;
  const content = result.content;
  const renderTheme = useMemo(
    () => dungeonThemeToRenderTheme(getTheme(theme)),
    [theme],
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
    const playerActor = createPlayerActor(startCell.x, startCell.y, player);
    const monsters = createMonstersFromResolved(result.resolved);
    const ts = createTurnSystemState(playerActor, monsters);
    const deps = buildDeps(dungeon, content, runtimeRef.current, ts.actors);
    return tickUntilPlayer(ts, deps);
  });

  // Stable ref to current turnState actors for cost computation.
  const turnStateRef = useRef(turnState);
  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);

  const [mapZoom, setMapZoom] = useState(MAP_ZOOM_DEFAULT);

  // --- Camera focus (lerped; target updated by player moves or right-click) ---
  const targetFocusRef = useRef({ x: startCell.x, y: startCell.y });
  const animFocusRef = useRef({ x: startCell.x, y: startCell.y });
  const [focusX, setFocusX] = useState(startCell.x);
  const [focusY, setFocusY] = useState(startCell.y);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const cell = lastHoverCellRef.current;
    if (cell) {
      targetFocusRef.current = { x: cell.x, y: cell.y };
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setMapZoom((z) =>
      Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, z - Math.sign(e.deltaY))),
    );
  }

  // --- Auto-walk (click-to-navigate route follower) ---
  const [autoWalk, setAutoWalk] = useState<AutoWalkState>({ kind: "idle" });

  // --- Tooltip ---
  const [tooltip, setTooltip] = useState<TooltipProps>({
    x: 0,
    y: 0,
    visible: false,
    children: <></>,
  });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Turn events → React bridge ---
  const { subscribe } = useTurnEvents(pendingEventsRef, turnState);

  const { push: pushFloatingMessage, floatingMessages } = useFloatingMessage({
    mapWidth: dungeon.width,
    mapHeight: dungeon.height,
  });

  const {
    messages: logMessages,
    addMessage: addLogMessage,
    removeMessage: removeLogMessage,
  } = useMessageLog();

  useEffect(
    () =>
      subscribe("damage", (evt) => {
        pushFloatingMessage(`-${evt.amount}`, evt.x, evt.y, {
          color: "#ff4444",
        });
        if (evt.actorId === "player") {
          addLogMessage(`You take ${evt.amount} damage!`);
        } else {
          addLogMessage(`You deal ${evt.amount} damage.`);
        }
      }),
    [subscribe, pushFloatingMessage, addLogMessage],
  );

  useEffect(
    () =>
      subscribe("heal", (evt) => {
        pushFloatingMessage(`+${evt.amount}`, evt.x, evt.y, {
          color: "#44ff88",
        });
        addLogMessage(`You heal ${evt.amount} HP.`);
      }),
    [subscribe, pushFloatingMessage, addLogMessage],
  );

  useEffect(
    () =>
      subscribe("miss", (evt) => {
        pushFloatingMessage("miss", evt.x, evt.y, { color: "#aaaaaa" });
        if (evt.actorId === "player") {
          addLogMessage("The attack misses you.");
        } else {
          addLogMessage("Your attack misses!");
        }
      }),
    [subscribe, pushFloatingMessage, addLogMessage],
  );

  useEffect(
    () =>
      subscribe("xpGain", (evt) => {
        pushFloatingMessage(`+${evt.amount} xp`, evt.x, evt.y, {
          color: "#ffdd55",
        });
        addLogMessage(`You gain ${evt.amount} XP.`);
      }),
    [subscribe, pushFloatingMessage, addLogMessage],
  );

  useEffect(
    () =>
      subscribe("death", (evt) => {
        if (evt.actorId !== "player") {
          addLogMessage("Enemy slain!");
        }
      }),
    [subscribe, addLogMessage],
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
  const playerActor = turnState.actors[turnState.playerId] as PlayerActor;
  const playerX = playerActor?.x ?? startCell.x;
  const playerY = playerActor?.y ?? startCell.y;

  // When the player moves, snap the focus target back to them.
  useEffect(() => {
    targetFocusRef.current = { x: playerX, y: playerY };
  }, [playerX, playerY]);

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
      if (playerActor?.kind === "player")
        setPlayer(playerFromActor(playerActor));
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

  // --- First-discovery tracking for message log ---
  const seenActorIdsRef = useRef<Set<string>>(new Set());
  const seenChestIndicesRef = useRef<Set<number>>(new Set());

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
        const ts = turnStateRef.current;
        const currentActor = ts.actors[ts.playerId];
        if (currentActor?.kind === "player")
          setPlayer(playerFromActor(currentActor));
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

  // --- First-discovery log messages ---
  useEffect(() => {
    const W = dungeon.width;
    const featureType = content.masks?.featureType;

    // Actors: monsters and NPCs entering visible range for the first time.
    for (const id in turnState.actors) {
      const actor = turnState.actors[id];
      if (!actor || actor.kind === "player" || !actor.alive) continue;
      if (seenActorIdsRef.current.has(id)) continue;
      if (Math.hypot(actor.x - playerX, actor.y - playerY) > PLAYER_VIS_RADIUS) continue;
      seenActorIdsRef.current.add(id);
      if (actor.kind === "monster") {
        addLogMessage(`You spot a ${actor.name}!`);
      } else if (actor.kind === "npc") {
        addLogMessage("A merchant wagon is nearby.");
      }
    }

    // Chests: cells with featureType 2 entering visible range for the first time.
    if (featureType) {
      for (let i = 0; i < W * dungeon.height; i++) {
        if (featureType[i] !== 2) continue;
        if (seenChestIndicesRef.current.has(i)) continue;
        const cx = i % W;
        const cy = Math.floor(i / W);
        if (Math.hypot(cx - playerX, cy - playerY) > PLAYER_VIS_RADIUS) continue;
        seenChestIndicesRef.current.add(i);
        addLogMessage("You see a chest!");
      }
    }
  }, [turnState.actors, playerX, playerY, dungeon, content, addLogMessage]);

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
      if (
        action.kind === "move" &&
        action.dx !== undefined &&
        action.dy !== undefined
      ) {
        const tx = playerX + action.dx;
        const ty = playerY + action.dy;
        const hasMonster = Object.values(turnState.actors).some(
          (a) =>
            a.id !== turnState.playerId && a.alive && a.x === tx && a.y === ty,
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
    const newPlayer = createPlayerActor(startCell.x, startCell.y, player);
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
      <Tooltip {...tooltip} />

      <MessageLog messages={logMessages} onMessageExpired={removeLogMessage} />

      <BorderPanel width="20rem" height="5rem" background="#000" bottom="0px">
        HP: {playerActor.hp}/{playerActor.maxHp}
      </BorderPanel>
      <div
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        style={{ position: "absolute", inset: 0 }}
      >
        <DungeonRenderView
          bsp={dungeon}
          content={content}
          theme={renderTheme}
          focusX={focusX}
          focusY={focusY}
          onCellFocus={(cell) => console.log("cell focus", cell)}
          playerX={playerX}
          playerY={playerY}
          playerTile={CP437_TILES.player}
          floorTile={CP437_TILES.floor}
          wallTile={CP437_TILES.wall}
          doorTile={CP437_TILES.doorClosed}
          doorOpenTile={CP437_TILES.doorOpen}
          doorStates={runtime.doors}
          keyTile={CP437_TILES.key}
          leverTile={CP437_TILES.lever}
          leverOffTile={CP437_TILES.leverOff}
          leverStates={runtime.levers}
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
          zoom={mapZoom}
          flipAtlasY={false}
          flipGridX={false}
          flipGridY={true}
          selectedX={playerX}
          selectedY={playerY}
          onCellHover={({ x, y, clientX, clientY }) => {
            // While auto-walking, keep the route overlay — don't overwrite with hover.
            if (autoWalk.kind === "active") return;
            const last = lastHoverCellRef.current;
            if (last && last.x === x && last.y === y) return;
            lastHoverCellRef.current = { x, y };

            // Reset tooltip timer on cell change.
            setTooltip((prev) => ({ ...prev, visible: false }));
            if (hoverTimerRef.current !== null)
              clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = setTimeout(() => {
              hoverTimerRef.current = null;
              const rt = runtimeRef.current;
              const idx = y * dungeon.width + x;
              const ft = content.masks.featureType[idx] | 0;
              const fid = content.masks.featureId[idx] | 0;
              const isSolid = dungeon.masks.solid[idx] === 255;

              // Terrain label
              const FEATURE_NAMES: Record<number, string> = {
                0: isSolid ? "Wall" : "Floor",
                1: "Floor",
                2: "Chest",
                3: "Secret Door",
                4: "Door",
                5: "Key",
                6: "Lever",
                7: "Pressure Plate",
                8: "Pushable Block",
                9: "Hidden Passage",
                10: "Hazard",
              };
              const terrainLabel = FEATURE_NAMES[ft] ?? "Unknown";

              // Door details
              let doorInfo = null;
              if (ft === 4 && fid) {
                const doorMeta = content.meta.doors.find(
                  (d) => d.x === x && d.y === y,
                );
                if (doorMeta) {
                  const doorState = rt.doors[doorMeta.id];
                  const kindLabel =
                    doorMeta.kind === 1
                      ? "Locked"
                      : doorMeta.kind === 2
                        ? "Lever"
                        : "Normal";
                  const openLabel =
                    doorState?.isOpen || (doorState as any)?.forcedOpen
                      ? "Open"
                      : "Closed";
                  doorInfo = (
                    <span>
                      {kindLabel} — {openLabel}
                    </span>
                  );
                }
              }

              // Lever details
              let leverInfo = null;
              if (ft === 6 && fid) {
                const leverMeta = content.meta.levers.find(
                  (l) => l.x === x && l.y === y,
                );
                if (leverMeta) {
                  const leverState = rt.levers[leverMeta.id];
                  leverInfo = <span>{leverState?.toggled ? "ON" : "OFF"}</span>;
                }
              }

              // Plate details
              let plateInfo = null;
              if (ft === 7 && fid) {
                const plateMeta = content.meta.plates.find(
                  (p) => p.x === x && p.y === y,
                );
                if (plateMeta) {
                  const plateState = rt.plates[plateMeta.id];
                  plateInfo = (
                    <span>{plateState?.pressed ? "Pressed" : "Unpressed"}</span>
                  );
                }
              }

              // Monsters at cell
              const monstersAtCell = Object.values(
                turnStateRef.current.actors,
              ).filter(
                (a): a is MonsterActor =>
                  a.kind === "monster" && a.alive && a.x === x && a.y === y,
              );

              setTooltip({
                x: clientX,
                y: clientY,
                visible: true,
                title: `(${x}, ${y})`,
                children: (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.15rem",
                    }}
                  >
                    <span>{terrainLabel}</span>
                    {doorInfo}
                    {leverInfo}
                    {plateInfo}
                    {monstersAtCell.map((m) => {
                      const monsterPower =
                        m.attack * 2 + m.defense + m.maxHp / 5;
                      const playerPower =
                        playerActor.attack * 2 +
                        playerActor.defense +
                        playerActor.maxHp / 5;
                      const ratio = monsterPower / Math.max(1, playerPower);
                      const difficulty =
                        ratio < 0.6
                          ? "easy"
                          : ratio > 1.4
                            ? "tough"
                            : "even";
                      const diffColor =
                        difficulty === "easy"
                          ? "#6be06b"
                          : difficulty === "tough"
                            ? "#e06b6b"
                            : "#e0c96b";
                      return (
                        <span key={m.id}>
                          {m.name} (HP {m.hp}/{m.maxHp}){" "}
                          <span style={{ color: diffColor }}>
                            [{difficulty}]
                          </span>
                        </span>
                      );
                    })}
                  </div>
                ),
              });
            }, TOOLTIP_DELAY);

            recomputePlayerPath(x, y);
          }}
          onCellHoverEnd={() => {
            lastHoverCellRef.current = null;
            if (hoverTimerRef.current !== null) {
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }
            // While auto-walking, preserve the route overlay.
            if (autoWalk.kind === "active") return;
            playerPreviewPathRef.current = null;
            setTooltip({ x: 0, y: 0, visible: false, children: <></> });
            rebuildPathMaskFromPlans();
          }}
          onCellClick={({ x, y, button }) => {
            if (button !== 0) return false;
            if (hoverTimerRef.current !== null) {
              clearTimeout(hoverTimerRef.current);
              hoverTimerRef.current = null;
            }
            setTooltip((prev) => ({ ...prev, visible: false }));
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
    </>
  );
}
