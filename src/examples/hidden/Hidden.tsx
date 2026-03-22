/**
 * Hidden — secret passage traversal demo.
 *
 * Hidden passages connect different rooms through short wall tunnels.
 * Each passage starts locked.  Stand at the passage mouth (cyan wall)
 * and press E to unlock it, then walk into the wall to traverse it.
 *
 * Controls:
 *   W / ArrowUp    — step forward
 *   S / ArrowDown  — step backward
 *   A              — turn left 90°
 *   D              — turn right 90°
 *   E              — toggle passage (when at passage mouth)
 *   Space / .      — wait a turn
 *   R              — regenerate dungeon
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { generateBspDungeon, type BspDungeonOutputs } from "../../bsp";
import { buildTileAtlas } from "../../rendering/tileAtlas";
import { PerspectiveDungeonView } from "../../rendering/PerspectiveDungeonView";
import {
  generateHiddenPassages,
  makeContentRng,
  type HiddenPassage,
  type HiddenPassageOptions,
} from "../../content";
import {
  buildPassageMask,
  enablePassageInMask,
  disablePassageInMask,
} from "../../rendering/hiddenPassagesMask";
import {
  createTurnSystemState,
  commitPlayerAction,
  tickUntilPlayer,
  defaultApplyAction,
  waitAI,
  type TurnSystemState,
  type TurnSystemDeps,
} from "../../turn/turnSystem";
import { actionDelay } from "../../turn/actionCosts";
import { createPlayerActor } from "../../turn/createActors";
import type { PlayerActor } from "../../turn/turnTypes";
import {
  type PassageTraversalState,
  startPassageTraversal,
  consumePassageStep,
  cancelPassageTraversal,
} from "../../turn/passageTraversal";
import { useNavigate } from "react-router-dom";
import styles from "./Hidden.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DW = 60;
const DH = 40;
const TILE_PX = 16;
const TILE_SIZE = 3;
const CEILING_H = 3;
const LERP_MS = 150;

const SRC_FLOOR = { x: 136, y: 328 };
const SRC_CEILING = { x: 136, y: 400 };
const SRC_WALL = { x: 208, y: 304 };

// ---------------------------------------------------------------------------
// Atlas loader (same repacking used by other examples)
// ---------------------------------------------------------------------------

function loadAtlas(
  sources: Array<{ x: number; y: number }>,
): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TILE_PX * sources.length;
      canvas.height = TILE_PX;
      const ctx = canvas.getContext("2d")!;
      sources.forEach(({ x, y }, i) =>
        ctx.drawImage(
          img,
          x,
          y,
          TILE_PX,
          TILE_PX,
          i * TILE_PX,
          0,
          TILE_PX,
          TILE_PX,
        ),
      );
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      resolve(tex);
    };
    img.onerror = reject;
    img.src = "/examples/eotb/tileset.png";
  });
}

// ---------------------------------------------------------------------------
// Game initialisation
// ---------------------------------------------------------------------------

type GameData = {
  dungeon: BspDungeonOutputs;
  solidData: Uint8Array;
  passages: HiddenPassage[]; // mutable enabled state lives here
  spawnX: number;
  spawnZ: number;
};

function initGame(
  seed: number,
  passageOptions?: HiddenPassageOptions,
): GameData {
  const dungeon = generateBspDungeon({
    width: DW,
    height: DH,
    seed,
    keepOuterWalls: true,
  });
  const solidData = dungeon.textures.solid.image.data as Uint8Array;

  const rng = makeContentRng(seed ^ 0xabcdef);
  const hp = generateHiddenPassages(dungeon, rng, {
    count: 2,
    ...passageOptions,
  });

  const startRoom = dungeon.rooms.get(dungeon.startRoomId);
  const spawnX = startRoom
    ? Math.floor(startRoom.rect.x + startRoom.rect.w / 2)
    : Math.floor(DW / 2);
  const spawnZ = startRoom
    ? Math.floor(startRoom.rect.y + startRoom.rect.h / 2)
    : Math.floor(DH / 2);

  return { dungeon, solidData, passages: hp.passages, spawnX, spawnZ };
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

function drawMinimap(
  canvas: HTMLCanvasElement,
  solidData: Uint8Array,
  W: number,
  H: number,
  playerX: number,
  playerZ: number,
  yaw: number,
  passages: HiddenPassage[],
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const cellW = cw / W;
  const cellH = ch / H;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, cw, ch);

  for (let cz = 0; cz < H; cz++) {
    for (let cx = 0; cx < W; cx++) {
      ctx.fillStyle = solidData[cz * W + cx] > 0 ? "#222" : "#555";
      ctx.fillRect(cx * cellW, cz * cellH, cellW, cellH);
    }
  }

  // Passage cells
  for (const p of passages) {
    ctx.fillStyle = p.enabled ? "#00ffff" : "#006666";
    for (const cell of p.cells) {
      ctx.fillRect(cell.x * cellW, cell.y * cellH, cellW, cellH);
    }
  }

  // Player
  const px = (playerX + 0.5) * cellW;
  const pz = (playerZ + 0.5) * cellH;
  const arrowLen = Math.max(cellW * 2.5, 5);
  ctx.fillStyle = "#f80";
  ctx.beginPath();
  ctx.arc(px, pz, Math.max(cellW * 0.7, 2), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ff0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(px - Math.sin(yaw) * arrowLen, pz - Math.cos(yaw) * arrowLen);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LogEntry = { text: string; passage?: boolean };

export default function Hidden() {
  const navigate = useNavigate();
  const [seed, setSeed] = useState(() =>
    Math.floor(Math.random() * 0x7fffffff),
  );

  // Game data ref — mutable (passages.enabled toggled in place for mask updates)
  const gameRef = useRef<GameData | null>(null);
  const [turnState, setTurnState] = useState<TurnSystemState | null>(null);

  // Passage mask as React state — new array ref on each toggle triggers rerender
  const [passageMask, setPassageMask] = useState<Uint8Array | null>(null);

  // Passage traversal — both state (for triggering step-loop) and ref (for isWalkable closure)
  const [passageTraversal, _setPassageTraversal] =
    useState<PassageTraversalState>({ kind: "idle" });
  const passageTraversalRef = useRef<PassageTraversalState>({ kind: "idle" });
  function setPassageTraversal(s: PassageTraversalState) {
    passageTraversalRef.current = s;
    _setPassageTraversal(s);
  }

  // Traversal speed factor — player speed multiplier applied per step inside a passage.
  // Factor 1 = normal speed; 2 = twice as fast (costs half the turn time per step).
  const [traversalFactor, setTraversalFactor] = useState(1.0);
  const traversalFactorRef = useRef(1.0);

  // Passage length filter — controls min/max wall-cell count for generated passages.
  const [minPassageLength, setMinPassageLength] = useState(1);
  const [maxPassageLength, setMaxPassageLength] = useState(8);

  // Tracks traversal start info so we can report elapsed turns on completion.
  const traversalStartRef = useRef({ totalSteps: 0, factor: 1.0 });

  const [log, setLog] = useState<LogEntry[]>([
    { text: "Find the hidden passages. Press E at a cyan wall to unlock." },
  ]);
  const pushLog = (entry: LogEntry) =>
    setLog((prev) => [...prev.slice(-4), entry]);

  // Camera lerp
  const logicalRef = useRef({ x: 1.5, z: 1.5, yaw: 0 });
  const animRef = useRef({
    fromX: 1.5,
    fromZ: 1.5,
    fromYaw: 0,
    toX: 1.5,
    toZ: 1.5,
    toYaw: 0,
    startTime: 0,
    animating: false,
  });
  const [camera, setCamera] = useState({ x: 1.5, z: 1.5, yaw: 0 });

  // Static assets
  const atlas = useMemo(
    () => buildTileAtlas(TILE_PX * 3, TILE_PX, TILE_PX, TILE_PX),
    [],
  );
  const [dungeonTexture, setDungeonTexture] = useState<THREE.Texture | null>(
    null,
  );
  useEffect(() => {
    loadAtlas([SRC_FLOOR, SRC_CEILING, SRC_WALL]).then(setDungeonTexture);
  }, []);

  const minimapRef = useRef<HTMLCanvasElement>(null);

  // ---------------------------------------------------------------------------
  // Build TurnSystemDeps — uses refs so isWalkable always has fresh data
  // ---------------------------------------------------------------------------

  // fromTraversal=true applies the traversal speed factor to this step's action cost.
  function buildDeps(fromTraversal = false): TurnSystemDeps {
    return {
      isWalkable: (x, y) => {
        const game = gameRef.current;
        if (!game) return false;
        const W = game.dungeon.width;
        if (game.solidData[y * W + x] === 0) return true;
        // Allow active passage cells during traversal
        const pt = passageTraversalRef.current;
        if (pt.kind === "active") {
          return pt.remainingCells.some((c) => c.x === x && c.y === y);
        }
        return false;
      },
      monsterDecide: waitAI,
      computeCost: (_id, action) => {
        const speed = fromTraversal ? 10 * traversalFactorRef.current : 10;
        return { time: actionDelay(speed, action) };
      },
      applyAction: defaultApplyAction,
    };
  }

  // ---------------------------------------------------------------------------
  // Init / reinit on seed change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const game = initGame(seed, {
      minLength: minPassageLength,
      maxLength: maxPassageLength,
    });
    gameRef.current = game;

    const player = createPlayerActor(game.spawnX, game.spawnZ);
    let ts = createTurnSystemState(player, []);
    ts = tickUntilPlayer(ts, buildDeps());
    setTurnState(ts);

    setPassageMask(
      buildPassageMask(game.dungeon.width, game.dungeon.height, {
        passages: game.passages,
      }),
    );
    setPassageTraversal({ kind: "idle" });

    const cx = game.spawnX + 0.5;
    const cz = game.spawnZ + 0.5;
    logicalRef.current = { x: cx, z: cz, yaw: 0 };
    animRef.current = {
      fromX: cx,
      fromZ: cz,
      fromYaw: 0,
      toX: cx,
      toZ: cz,
      toYaw: 0,
      startTime: 0,
      animating: false,
    };
    setCamera({ x: cx, z: cz, yaw: 0 });

    setLog([
      {
        text:
          game.passages.length > 0
            ? `Found ${game.passages.length} secret passage${game.passages.length > 1 ? "s" : ""}. Find them on the minimap!`
            : "No passages found in this dungeon. Press R to regenerate.",
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  // ---------------------------------------------------------------------------
  // Camera lerp loop
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let rafId: number;
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const anim = animRef.current;
      if (!anim.animating) return;
      const raw = (now - anim.startTime) / LERP_MS;
      const t = Math.min(raw, 1);
      const s = t * t * (3 - 2 * t);
      const x = anim.fromX + (anim.toX - anim.fromX) * s;
      const z = anim.fromZ + (anim.toZ - anim.fromZ) * s;
      const yaw = anim.fromYaw + (anim.toYaw - anim.fromYaw) * s;
      if (t >= 1) anim.animating = false;
      setCamera({ x, z, yaw });
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ---------------------------------------------------------------------------
  // Minimap update
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const game = gameRef.current;
    if (!minimapRef.current || !game || !turnState) return;
    drawMinimap(
      minimapRef.current,
      game.solidData,
      game.dungeon.width,
      game.dungeon.height,
      logicalRef.current.x - 0.5,
      logicalRef.current.z - 0.5,
      logicalRef.current.yaw,
      game.passages,
    );
  }, [turnState, passageMask, camera]);

  // ---------------------------------------------------------------------------
  // Step-loop: drives passage traversal one cell at a time
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!turnState?.awaitingPlayerInput) return;
    if (passageTraversal.kind !== "active") return;

    const player = turnState.actors[turnState.playerId] as PlayerActor;
    const { cell, next } = consumePassageStep(passageTraversal);
    setPassageTraversal(next);

    const dx = cell.x - player.x;
    const dy = cell.y - player.y;

    if (next.kind === "idle") {
      const { totalSteps, factor } = traversalStartRef.current;
      const turns = Math.round(totalSteps / factor);
      pushLog({
        text: `Passage traversed — ${turns} turn${turns !== 1 ? "s" : ""} elapsed (passage length = ${totalSteps}).`,
        passage: true,
      });
    }

    setTurnState((prev) => {
      if (!prev) return prev;
      const newState = commitPlayerAction(prev, buildDeps(true), {
        kind: "move",
        dx,
        dy,
      });
      // Animate camera to new cell
      const newPlayer = newState.actors[newState.playerId] as PlayerActor;
      const { yaw } = logicalRef.current;
      const toX = newPlayer.x + 0.5;
      const toZ = newPlayer.y + 0.5;
      animRef.current = {
        fromX: logicalRef.current.x,
        fromZ: logicalRef.current.z,
        fromYaw: yaw,
        toX,
        toZ,
        toYaw: yaw,
        startTime: performance.now(),
        animating: true,
      };
      logicalRef.current.x = toX;
      logicalRef.current.z = toZ;
      return newState;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnState?.awaitingPlayerInput, passageTraversal]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function commitMove(dx: number, dy: number) {
    setTurnState((prev) => {
      if (!prev?.awaitingPlayerInput) return prev;
      const newState = commitPlayerAction(prev, buildDeps(), {
        kind: "move",
        dx,
        dy,
      });
      const newPlayer = newState.actors[newState.playerId] as PlayerActor;
      const { yaw } = logicalRef.current;
      const toX = newPlayer.x + 0.5;
      const toZ = newPlayer.y + 0.5;
      if (
        newPlayer.x !== prev.actors[prev.playerId].x ||
        newPlayer.y !== prev.actors[prev.playerId].y
      ) {
        animRef.current = {
          fromX: logicalRef.current.x,
          fromZ: logicalRef.current.z,
          fromYaw: yaw,
          toX,
          toZ,
          toYaw: yaw,
          startTime: performance.now(),
          animating: true,
        };
        logicalRef.current.x = toX;
        logicalRef.current.z = toZ;
      }
      return newState;
    });
  }

  // Find the passage whose mouth the player is currently standing at, if any.
  function passageAtPlayer(player: PlayerActor): HiddenPassage | null {
    const game = gameRef.current;
    if (!game) return null;
    for (const p of game.passages) {
      if (
        (p.start.x === player.x && p.start.y === player.y) ||
        (p.end.x === player.x && p.end.y === player.y)
      ) {
        return p;
      }
    }
    return null;
  }

  // Toggle the passage at the player's current cell (lever interaction).
  function togglePassageAtPlayer(player: PlayerActor) {
    const game = gameRef.current;
    if (!game || !passageMask) return;
    const p = passageAtPlayer(player);
    if (!p) {
      pushLog({ text: "Nothing to interact with here." });
      return;
    }
    p.enabled = !p.enabled;
    const newMask = new Uint8Array(passageMask);
    if (p.enabled) {
      enablePassageInMask(newMask, game.dungeon.width, p);
      pushLog({ text: "Passage unlocked!", passage: true });
    } else {
      disablePassageInMask(newMask, game.dungeon.width, p);
      pushLog({ text: "Passage locked.", passage: false });
    }
    setPassageMask(newMask);
  }

  // Try to start traversal if the player moves toward an enabled passage.
  function tryStartTraversal(
    player: PlayerActor,
    dx: number,
    dy: number,
  ): boolean {
    const game = gameRef.current;
    if (!game) return false;
    const targetX = player.x + dx;
    const targetY = player.y + dy;
    if (game.solidData[targetY * game.dungeon.width + targetX] === 0)
      return false;

    for (const p of game.passages) {
      if (!p.enabled) continue;
      const traversal = startPassageTraversal(p, { x: player.x, y: player.y });
      if (!traversal || traversal.kind !== "active") continue;
      const firstCell = traversal.remainingCells[0];
      if (firstCell.x === targetX && firstCell.y === targetY) {
        traversalStartRef.current = {
          totalSteps: traversal.remainingCells.length,
          factor: traversalFactorRef.current,
        };
        setPassageTraversal(traversal);
        pushLog({ text: "Entering secret passage…", passage: true });
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Keyboard input
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ts = turnState;
      if (!ts?.awaitingPlayerInput) return;

      // During traversal, any manual key cancels it
      if (passageTraversal.kind === "active") {
        setPassageTraversal(cancelPassageTraversal());
        return;
      }

      const player = ts.actors[ts.playerId] as PlayerActor;
      const { x, z, yaw } = logicalRef.current;
      const fdx = Math.round(-Math.sin(yaw));
      const fdz = Math.round(-Math.cos(yaw));

      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          e.preventDefault();
          if (!tryStartTraversal(player, fdx, fdz)) commitMove(fdx, fdz);
          break;
        case "KeyS":
        case "ArrowDown":
          e.preventDefault();
          if (!tryStartTraversal(player, -fdx, -fdz)) commitMove(-fdx, -fdz);
          break;
        case "KeyA": {
          e.preventDefault();
          const toYaw = yaw + Math.PI / 2;
          animRef.current = {
            fromX: x,
            fromZ: z,
            fromYaw: yaw,
            toX: x,
            toZ: z,
            toYaw,
            startTime: performance.now(),
            animating: true,
          };
          logicalRef.current.yaw = toYaw;
          break;
        }
        case "KeyD": {
          e.preventDefault();
          const toYaw = yaw - Math.PI / 2;
          animRef.current = {
            fromX: x,
            fromZ: z,
            fromYaw: yaw,
            toX: x,
            toZ: z,
            toYaw,
            startTime: performance.now(),
            animating: true,
          };
          logicalRef.current.yaw = toYaw;
          break;
        }
        case "KeyE":
          e.preventDefault();
          togglePassageAtPlayer(player);
          break;
        case "Space":
        case "Period":
          e.preventDefault();
          setTurnState((prev) =>
            prev
              ? commitPlayerAction(prev, buildDeps(), { kind: "wait" })
              : prev,
          );
          break;
        case "KeyR":
          setSeed(Math.floor(Math.random() * 0x7fffffff));
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnState, passageTraversal]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const game = gameRef.current;
  const enabledCount = game?.passages.filter((p) => p.enabled).length ?? 0;
  const totalCount = game?.passages.length ?? 0;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.uiHeaderBar}>
        <div className={styles.title}>HIDDEN</div>
        <div className={styles.seed}>seed: {seed}</div>
        <button
          className={styles.rerollBtn}
          onClick={() => setSeed(Math.floor(Math.random() * 0x7fffffff))}
          title="Reroll seed"
        >
          ⟳
        </button>
        <div className={styles.passageCount}>
          passages: {enabledCount}/{totalCount} unlocked
        </div>
      </div>

      {/* Main */}
      <div className={styles.mainArea}>
        <div className={styles.perspectiveView}>
          {dungeonTexture && game && (
            <PerspectiveDungeonView
              solidData={game.solidData}
              width={game.dungeon.width}
              height={game.dungeon.height}
              cameraX={camera.x}
              cameraZ={camera.z}
              yaw={camera.yaw}
              atlas={atlas}
              texture={dungeonTexture}
              floorTile={0}
              ceilingTile={1}
              wallTile={2}
              renderRadius={14}
              ceilingHeight={CEILING_H}
              tileSize={TILE_SIZE}
              fogNear={TILE_SIZE * 2}
              fogFar={TILE_SIZE * 9}
              passageMask={passageMask ?? undefined}
            />
          )}

          {/* Overlay log */}
          <div className={styles.log}>
            {log.map((entry, i) => (
              <div
                key={i}
                className={`${styles.logEntry}${entry.passage ? ` ${styles.passage}` : ""}`}
              >
                {entry.text}
              </div>
            ))}
          </div>
        </div>

        {/* Minimap */}
        <div className={styles.miniMapView}>
          <canvas
            ref={minimapRef}
            className={styles.minimapCanvas}
            width={game?.dungeon.width ?? DW}
            height={game?.dungeon.height ?? DH}
          />
          <div className={styles.minimapLegend}>
            <div>
              ■ <span style={{ color: "#00ffff" }}>cyan</span> — passage
              (unlocked)
            </div>
            <div>
              ■ <span style={{ color: "#006666" }}>dark cyan</span> — passage
              (locked)
            </div>
            <div>
              ■ <span style={{ color: "#f80" }}>orange</span> — player
            </div>
          </div>
          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Traversal speed factor:{" "}
              <strong>{traversalFactor.toFixed(2)}×</strong>
            </label>
            <input
              type="range"
              className={styles.slider}
              min={0.25}
              max={3.0}
              step={0.05}
              value={traversalFactor}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                traversalFactorRef.current = v;
                setTraversalFactor(v);
              }}
            />
            <div className={styles.sliderHint}>
              {traversalFactor < 1
                ? "slow (monsters move more between steps)"
                : traversalFactor > 1
                  ? "fast (fewer monster turns per step)"
                  : "normal (1 monster tick per step)"}
            </div>
          </div>
          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Min passage length: <strong>{minPassageLength}</strong>
            </label>
            <input
              type="range"
              className={styles.slider}
              min={1}
              max={8}
              step={1}
              value={minPassageLength}
              onChange={(e) => {
                setMinPassageLength(
                  Math.min(parseInt(e.target.value), maxPassageLength),
                );
                setSeed(Math.floor(Math.random() * 0x7fffffff));
              }}
            />
          </div>
          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Max passage length: <strong>{maxPassageLength}</strong>
            </label>
            <input
              type="range"
              className={styles.slider}
              min={4}
              max={DW}
              step={1}
              value={maxPassageLength}
              onChange={(e) => {
                setMaxPassageLength(
                  Math.max(parseInt(e.target.value), minPassageLength),
                );
                setSeed(Math.floor(Math.random() * 0x7fffffff));
              }}
            />
          </div>
        </div>
      </div>

      {/* Status */}
      <div className={styles.statusPanel}>
        <div className={styles.hint}>
          WASD move · E toggle passage · Space wait · R regen
          {passageTraversal.kind === "active" && " · TRAVERSING…"}
        </div>
        <button className={styles.backBtn} onClick={() => navigate("/")}>
          ← back
        </button>
      </div>
    </div>
  );
}
