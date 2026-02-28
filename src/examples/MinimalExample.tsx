import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import hotkeys from "hotkeys-js";
import * as THREE from "three";

import DungeonRenderView from "../rendering/DungeonRenderView";

import { isTileWalkable } from "../walkability";
import { aStar8 } from "../pathfinding/aStar8";
import {
  clearPathMaskRGBA,
  createPathMaskRGBA,
  stampPath,
} from "../rendering/pathMask";
import {
  clearActorCharMask,
  createActorCharMaskR8,
  stampMonstersToActorCharMask,
  type ActorCharMask,
} from "../rendering/actorCharMask";
import {
  initDungeonRuntimeState,
  derivePlatesFromBlocks,
  toggleLever,
} from "../dungeonState";
import { evaluateCircuits } from "../evaluateCircuits";

import { computeStartCell } from "../inspect/computeStartCell";
import { generateDungeon } from "../api/generateDungeon";

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
import {
  createWorldEffectsState,
  advanceWorldEffects,
} from "../world/worldEffects";

import "./styles.css";

export interface Player {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Dungeon generation (via API so we get resolved monster spawns)
// ---------------------------------------------------------------------------

const SEED = "test";
const THEME_ID = "medieval_keep";

/** Must match the `radius` value passed to DungeonRenderView (visibility.ts). */
const PLAYER_VIS_RADIUS = 6;

function buildDungeon() {
  return generateDungeon({
    seed: SEED,
    level: 1,
    themeId: THEME_ID,
    width: 64,
    height: 64,
    pattern: { includeIntroGate: true },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MinimalExample() {
  const result = useMemo(() => buildDungeon(), []);
  const dungeon = result.bsp;
  const content = result.content;

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
        }),
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
        defaultComputeCost(actorId, action, turnStateRef.current.actors),
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
  const enemyPlannedPathsRef = useRef<PlannedPath[]>([]);

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
      stampPath(pm.data, dungeon.width, ep.path, "enemy");
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

  // Stamp monsters into the actor overlay whenever turn state or player position changes
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
      monsters: monsters.map((m) => ({ id: m.id, x: m.x, y: m.y })),
      monsterTile: CP437_TILES.monster,
      avoidCell: { x: playerX, y: playerY },
      blocked: (x, y) => dungeon.masks.solid[y * W + x] === 255,
    });
    am.tex.needsUpdate = true;
  }, [turnState.actors, playerX, playerY, dungeon]);

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
      );
      playerPreviewPathRef.current = pathResult?.path ?? null;
      rebuildPathMaskFromPlans();
    },
    [dungeon, content, playerX, playerY, rebuildPathMaskFromPlans],
  );

  // --- Committed move helper ---
  function tryCommitMove(dx: number, dy: number) {
    setAutoWalk(cancelAutoWalk());
    playerPreviewPathRef.current = null;
    setTurnState((prev) => {
      if (!prev.awaitingPlayerInput) return prev;
      const deps = buildDeps(dungeon, content, runtimeRef.current, prev.actors);
      return commitPlayerAction(prev, deps, { kind: "move", dx, dy });
    });
  }

  function tryCommitWait() {
    setAutoWalk(cancelAutoWalk());
    playerPreviewPathRef.current = null;
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

    return () => hotkeys.unbind();
  }, [dungeon, content]);

  // --- Auto-walk step loop ---
  // Runs once per player turn while a route is active. Commits exactly one step,
  // then commitPlayerAction → tickUntilPlayer advances monsters until the player
  // gets control again, at which point this effect fires for the next step.
  useEffect(() => {
    if (!turnState.awaitingPlayerInput) return;
    if (autoWalk.kind !== "active") return;

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

    setAutoWalk(nextAutoWalk);
    setTurnState((prev) => {
      if (!prev.awaitingPlayerInput) return prev;
      const deps = buildDeps(dungeon, content, runtimeRef.current, prev.actors);
      return commitPlayerAction(prev, deps, action);
    });
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
    const ts = createTurnSystemState(newPlayer, monsters);
    const deps = buildDeps(dungeon, content, runtimeRef.current, ts.actors);
    setTurnState(tickUntilPlayer(ts, deps));
  }, [startCell.x, startCell.y]);

  return (
    <>
      <DungeonRenderView
        bsp={dungeon}
        content={content}
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
      />
    </>
  );
}
