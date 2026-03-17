/**
 * Mobs — turn-based dungeon with 3-D first-person view and billboard monsters.
 *
 * Controls:
 *   W / ArrowUp    — step forward (commits player turn)
 *   S / ArrowDown  — step backward (commits player turn)
 *   A              — turn left 90° (free, no turn cost)
 *   D              — turn right 90° (free, no turn cost)
 *   Space / .      — wait a turn
 *   R              — regenerate dungeon
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { generateBspDungeon, type BspDungeonOutputs } from "../../bsp";
import { buildTileAtlas } from "../../rendering/tileAtlas";
import { PerspectiveDungeonView } from "../../rendering/PerspectiveDungeonView";
import type { SpriteAtlas } from "../../rendering/PerspectiveDungeonView";
import {
  createTurnSystemState,
  commitPlayerAction,
  tickUntilPlayer,
  type TurnSystemState,
  type TurnSystemDeps,
} from "../../turn/turnSystem";
import { actionDelay } from "../../turn/actionCosts";
import { decideChasePlayer } from "../../turn/monsterAI";
import {
  createPlayerActor,
  createMonstersFromMobiles,
  type MonsterTemplate,
} from "../../turn/createActors";
import type {
  MonsterActor,
  PlayerActor,
  TurnAction,
} from "../../turn/turnTypes";
import type { TurnEvent, XpGainEvent } from "../../turn/turnEvents";
import type { MobilePlacement } from "../../content";
import styles from "./Mobs.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DW = 60;
const DH = 40;
const TILE_PX = 16;
const TILE_SIZE = 3;
const CEILING_H = 3;
const LERP_MS = 150;

const TEMPLATES: Record<string, MonsterTemplate> = {
  goblin: {
    name: "Goblin",
    glyph: "g",
    danger: 1,
    hp: 6,
    attack: 3,
    defense: 0,
    xp: 10,
    speed: 8,
  },
  minotaur: {
    name: "Minotaur",
    glyph: "m",
    danger: 3,
    hp: 14,
    attack: 6,
    defense: 1,
    xp: 25,
    speed: 6,
  },
  troll: {
    name: "Troll",
    glyph: "T",
    danger: 6,
    hp: 30,
    attack: 9,
    defense: 2,
    xp: 60,
    speed: 5,
  },
  rat: {
    name: "Giant Rat",
    glyph: "r",
    danger: 0,
    hp: 4,
    attack: 2,
    defense: 0,
    xp: 5,
    speed: 9,
  },
};

const MOB_TYPES = [
  "goblin",
  "minotaur",
  "troll",
  "goblin",
  "rat",
  "troll",
  "rat",
];

// Sprite atlas: 4 cols (goblin/minotaur/troll/rat) × 1 row
const GLYPH_COL: Record<string, number> = { g: 0, m: 1, T: 2, r: 3 };
const SPRITE_COLS = 4;

function mobTileId(glyph: string): number {
  return GLYPH_COL[glyph] ?? 0;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function cardinalDir(yaw: number): string {
  const norm = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx = Math.round((norm / (Math.PI * 2)) * 8) % 8;
  return DIRS[idx];
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function buildDungeonTileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_PX * 3;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext("2d")!;

  // Floor — dark stone
  ctx.fillStyle = "#2a2215";
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);

  // Ceiling — darker, slightly blue
  ctx.fillStyle = "#181820";
  ctx.fillRect(TILE_PX, 0, TILE_PX, TILE_PX);

  // Wall — aged stone with cracks
  ctx.fillStyle = "#3c3535";
  ctx.fillRect(TILE_PX * 2, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = "#2e2828";
  ctx.fillRect(TILE_PX * 2 + 0, 3, 2, 6);
  ctx.fillRect(TILE_PX * 2 + 5, 1, 1, 5);
  ctx.fillRect(TILE_PX * 2 + 11, 7, 2, 5);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Sprite positions in sprites.png (each sprite is 16×16 px)
const SPRITE_SRC: Array<{ x: number; y: number }> = [
  { x: 80, y: 416 },  // goblin (col 0)
  { x: 272, y: 448 }, // minotaur (col 1)
  { x: 80, y: 448 },  // troll (col 2)
  { x: 144, y: 368 }, // rat (col 3)
];
const SRC_TILE = 16;
const DST_TILE = 64; // scale up for 3-D quality

async function loadMonsterSpriteAtlas(url: string): Promise<SpriteAtlas> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_COLS * DST_TILE;
  canvas.height = DST_TILE;
  const ctx = canvas.getContext("2d")!;

  // Extract each sprite from the sheet, remove cream background, place in atlas
  const tmp = document.createElement("canvas");
  tmp.width = SRC_TILE;
  tmp.height = SRC_TILE;
  const tCtx = tmp.getContext("2d")!;

  for (let col = 0; col < SPRITE_COLS; col++) {
    const { x, y } = SPRITE_SRC[col];
    tCtx.clearRect(0, 0, SRC_TILE, SRC_TILE);
    tCtx.drawImage(img, x, y, SRC_TILE, SRC_TILE, 0, 0, SRC_TILE, SRC_TILE);

    // Remove near-white / cream background pixels
    const px = tCtx.getImageData(0, 0, SRC_TILE, SRC_TILE);
    for (let i = 0; i < px.data.length; i += 4) {
      const r = px.data[i], g = px.data[i + 1], b = px.data[i + 2];
      if (r > 210 && g > 200 && b > 185) px.data[i + 3] = 0;
    }
    tCtx.putImageData(px, 0, 0);

    // Scale up to DST_TILE and blit into atlas row
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, SRC_TILE, SRC_TILE, col * DST_TILE, 0, DST_TILE, DST_TILE);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return { texture, columns: SPRITE_COLS, rows: 1 };
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

function drawMinimap(
  canvas: HTMLCanvasElement,
  solidData: Uint8Array,
  width: number,
  height: number,
  playerX: number,
  playerZ: number,
  yaw: number,
  actors: TurnSystemState["actors"],
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const cellW = cw / width;
  const cellH = ch / height;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, cw, ch);

  for (let cz = 0; cz < height; cz++) {
    for (let cx = 0; cx < width; cx++) {
      const solid = solidData[cz * width + cx] > 0;
      ctx.fillStyle = solid ? "#222" : "#555";
      ctx.fillRect(cx * cellW, cz * cellH, cellW, cellH);
    }
  }

  // Monsters
  for (const actor of Object.values(actors)) {
    if (actor.kind !== "monster" || !(actor as MonsterActor).alive) continue;
    const m = actor as MonsterActor;
    ctx.fillStyle =
      m.alertState === "chasing"
        ? "#f44"
        : m.alertState === "searching"
          ? "#f80"
          : "#844";
    const px = (m.x + 0.5) * cellW;
    const pz = (m.y + 0.5) * cellH;
    ctx.beginPath();
    ctx.arc(px, pz, Math.max(cellW * 0.5, 2), 0, Math.PI * 2);
    ctx.fill();
  }

  // Player arrow
  const px = playerX * cellW;
  const pz = playerZ * cellH;
  const arrowLen = Math.max(cellW * 2.5, 6);
  ctx.fillStyle = "#f80";
  ctx.beginPath();
  ctx.arc(px, pz, Math.max(cellW * 0.7, 3), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ff0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(px - Math.sin(yaw) * arrowLen, pz - Math.cos(yaw) * arrowLen);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function resolveBump(
  state: TurnSystemState,
  attackerId: string,
  targetX: number,
  targetY: number,
  onEvent: (e: TurnEvent) => void,
): TurnSystemState {
  const attacker = state.actors[attackerId] as PlayerActor | MonsterActor;
  const target = Object.values(state.actors).find(
    (a) => a.alive && a.x === targetX && a.y === targetY && a.id !== attackerId,
  ) as PlayerActor | MonsterActor | undefined;

  if (!target) return state;

  const dmg = Math.max(1, attacker.attack - target.defense);
  const newHp = Math.max(0, target.hp - dmg);
  const died = newHp <= 0;

  onEvent({
    kind: "damage",
    actorId: target.id,
    amount: dmg,
    x: target.x,
    y: target.y,
  });
  const newActors = {
    ...state.actors,
    [target.id]: { ...target, hp: newHp, alive: !died },
  };

  if (died) {
    onEvent({
      kind: "death",
      actorId: target.id,
      sourceId: attackerId,
      x: target.x,
      y: target.y,
    });
    if (attackerId === state.playerId && target.kind === "monster") {
      onEvent({
        kind: "xpGain",
        amount: (target as MonsterActor).xp,
        x: target.x,
        y: target.y,
      });
    }
  }

  return { ...state, actors: newActors };
}

// ---------------------------------------------------------------------------
// TurnSystemDeps
// ---------------------------------------------------------------------------

function buildDeps(
  dungeon: BspDungeonOutputs,
  solidData: Uint8Array,
  actors: TurnSystemState["actors"],
  onEvent: (e: TurnEvent) => void,
): TurnSystemDeps {
  const isWalkable = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height)
      return false;
    return solidData[y * dungeon.width + x] === 0;
  };
  return {
    isWalkable,
    monsterDecide: (state, monsterId) =>
      decideChasePlayer(state, monsterId, dungeon, isWalkable),
    computeCost: (actorId, action: TurnAction) => {
      const actor = actors[actorId];
      return { time: actionDelay(actor?.speed ?? 10, action) };
    },
    applyAction: (state, actorId, action, deps) => {
      if (action.kind === "wait" || action.kind === "interact") return state;
      if (action.kind !== "move" || action.dx == null || action.dy == null)
        return state;
      const actor = state.actors[actorId];
      if (!actor) return state;
      const nx = actor.x + action.dx;
      const ny = actor.y + action.dy;
      const blocker = Object.values(state.actors).find(
        (a) =>
          a.id !== actorId &&
          a.alive &&
          a.blocksMovement &&
          a.x === nx &&
          a.y === ny,
      );
      if (blocker) return resolveBump(state, actorId, nx, ny, onEvent);
      if (!deps.isWalkable(nx, ny)) return state;
      return {
        ...state,
        actors: { ...state.actors, [actorId]: { ...actor, x: nx, y: ny } },
      };
    },
    onEvent,
  };
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

type GameState = {
  dungeon: BspDungeonOutputs;
  solidData: Uint8Array;
  turnState: TurnSystemState;
  spawnX: number;
  spawnZ: number;
};

function initGame(seed: number): GameState {
  const dungeon = generateBspDungeon({
    width: DW,
    height: DH,
    seed,
    keepOuterWalls: true,
  });
  const solidData = dungeon.textures.solid.image.data as Uint8Array;

  const mobiles: Array<{ x: number; z: number; type: string; tileId: number }> =
    [];
  let mobIdx = 0;
  for (const [roomId, room] of dungeon.rooms) {
    if (roomId === dungeon.startRoomId || mobIdx >= MOB_TYPES.length) continue;
    mobiles.push({
      x: Math.floor(room.rect.x + room.rect.w / 2),
      z: Math.floor(room.rect.y + room.rect.h / 2),
      type: MOB_TYPES[mobIdx++],
      tileId: 0,
    });
  }

  const startRoom = dungeon.rooms.get(dungeon.startRoomId);
  const spawnX = startRoom
    ? Math.floor(startRoom.rect.x + startRoom.rect.w / 2)
    : Math.floor(DW / 2);
  const spawnZ = startRoom
    ? Math.floor(startRoom.rect.y + startRoom.rect.h / 2)
    : Math.floor(DH / 2);

  const player = createPlayerActor(spawnX, spawnZ);
  const monsters = createMonstersFromMobiles(mobiles, TEMPLATES);
  let turnState = createTurnSystemState(player, monsters);

  const deps = buildDeps(dungeon, solidData, turnState.actors, () => {});
  turnState = tickUntilPlayer(turnState, deps);

  return { dungeon, solidData, turnState, spawnX, spawnZ };
}

// ---------------------------------------------------------------------------
// Log types
// ---------------------------------------------------------------------------

type LogKind = "info" | "damage" | "death" | "xp";
type LogEntry = { text: string; kind: LogKind };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Mobs() {
  const [seed, setSeed] = useState(() =>
    Math.floor(Math.random() * 0x7fffffff),
  );
  const gameRef = useRef<GameState | null>(null);
  const [turnState, setTurnState] = useState<TurnSystemState | null>(null);

  const [playerHp, setPlayerHp] = useState(20);
  const [playerMaxHp, setPlayerMaxHp] = useState(20);
  const [playerXp, setPlayerXp] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Camera — logical (grid-aligned) target and lerp animation
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

  // Static assets — created once
  const atlas = useMemo(
    () => buildTileAtlas(TILE_PX * 3, TILE_PX, TILE_PX, TILE_PX),
    [],
  );
  const dungeonTexture = useMemo(() => buildDungeonTileTexture(), []);
  const [spriteAtlas, setSpriteAtlas] = useState<SpriteAtlas | null>(null);
  useEffect(() => {
    loadMonsterSpriteAtlas("/examples/mobs/sprites.png").then(setSpriteAtlas);
  }, []);

  const minimapRef = useRef<HTMLCanvasElement>(null);

  const pushLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [...prev.slice(-49), entry]);
  }, []);

  // Init / reinit on seed change
  useEffect(() => {
    const game = initGame(seed);
    gameRef.current = game;
    setTurnState(game.turnState);
    setGameOver(false);
    setPlayerXp(0);
    const player = game.turnState.actors[
      game.turnState.playerId
    ] as PlayerActor;
    setPlayerHp(player.hp);
    setPlayerMaxHp(player.maxHp);
    setAlertCount(0);
    setLog([{ text: "New dungeon. Hunt the monsters!", kind: "info" }]);

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
  }, [seed]);

  // Smooth-lerp animation loop
  useEffect(() => {
    let rafId: number;
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const anim = animRef.current;
      if (!anim.animating) return;
      const raw = (now - anim.startTime) / LERP_MS;
      const t = Math.min(raw, 1);
      const s = t * t * (3 - 2 * t); // smoothstep
      const x = anim.fromX + (anim.toX - anim.fromX) * s;
      const z = anim.fromZ + (anim.toZ - anim.fromZ) * s;
      const yaw = anim.fromYaw + (anim.toYaw - anim.fromYaw) * s;
      setCamera({ x, z, yaw });
      if (t >= 1) animRef.current.animating = false;
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Minimap update
  useEffect(() => {
    if (!minimapRef.current || !gameRef.current || !turnState) return;
    const { solidData, dungeon } = gameRef.current;
    drawMinimap(
      minimapRef.current,
      solidData,
      dungeon.width,
      dungeon.height,
      logicalRef.current.x,
      logicalRef.current.z,
      logicalRef.current.yaw,
      turnState.actors,
    );
  }, [turnState, camera]);

  // Commit a player turn action
  const applyTurn = useCallback(
    (action: TurnAction) => {
      const game = gameRef.current;
      if (!game || gameOver || !game.turnState.awaitingPlayerInput) return;

      const prevPlayer = game.turnState.actors[
        game.turnState.playerId
      ] as PlayerActor;
      const prevX = prevPlayer.x;
      const prevZ = prevPlayer.y;

      const evts: TurnEvent[] = [];
      const deps = buildDeps(
        game.dungeon,
        game.solidData,
        game.turnState.actors,
        (e) => evts.push(e),
      );
      const newState = commitPlayerAction(game.turnState, deps, action);
      game.turnState = newState;
      setTurnState(newState);

      for (const evt of evts) {
        if (evt.kind === "damage") {
          const who =
            evt.actorId === newState.playerId
              ? "You"
              : ((newState.actors[evt.actorId] as MonsterActor | undefined)
                  ?.name ?? evt.actorId);
          pushLog({ text: `${who} takes ${evt.amount} dmg`, kind: "damage" });
        } else if (evt.kind === "death") {
          const who =
            evt.actorId === newState.playerId
              ? "You"
              : ((newState.actors[evt.actorId] as MonsterActor | undefined)
                  ?.name ?? evt.actorId);
          pushLog({ text: `${who} died!`, kind: "death" });
          if (evt.actorId === newState.playerId) setGameOver(true);
        } else if (evt.kind === "xpGain") {
          const xpEvt = evt as XpGainEvent;
          setPlayerXp((prev) => prev + xpEvt.amount);
          pushLog({ text: `+${xpEvt.amount} XP`, kind: "xp" });
        }
      }

      const newPlayer = newState.actors[newState.playerId] as PlayerActor;
      setPlayerHp(newPlayer.hp);

      const alerted = Object.values(newState.actors).filter(
        (a) =>
          a.kind === "monster" &&
          a.alive &&
          (a as MonsterActor).alertState !== "idle",
      ).length;
      setAlertCount(alerted);

      if (!newPlayer.alive) {
        setGameOver(true);
        pushLog({
          text: "You died. Press R for a new dungeon.",
          kind: "death",
        });
      }

      // Animate camera to new player position if they actually moved
      if (newPlayer.x !== prevX || newPlayer.y !== prevZ) {
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
      }
    },
    [gameOver, pushLog],
  );

  // Keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (animRef.current.animating) return;

      const { x, z, yaw } = logicalRef.current;
      const fdx = Math.round(-Math.sin(yaw));
      const fdz = Math.round(-Math.cos(yaw));

      switch (e.code) {
        case "KeyW":
        case "ArrowUp":
          e.preventDefault();
          applyTurn({ kind: "move", dx: fdx, dy: fdz });
          break;
        case "KeyS":
        case "ArrowDown":
          e.preventDefault();
          applyTurn({ kind: "move", dx: -fdx, dy: -fdz });
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
        case "Space":
        case "Period":
          e.preventDefault();
          applyTurn({ kind: "wait" });
          break;
        case "KeyR":
          setSeed(Math.floor(Math.random() * 0x7fffffff));
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyTurn]);

  // Scroll log to bottom
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Billboard mobiles derived from turn state
  const mobiles: MobilePlacement[] = useMemo(() => {
    if (!turnState) return [];
    return Object.values(turnState.actors)
      .filter((a) => a.kind === "monster" && (a as MonsterActor).alive)
      .map((a) => {
        const m = a as MonsterActor;
        return {
          x: m.x,
          z: m.y,
          type: "monster",
          tileId: mobTileId(m.glyph),
        };
      });
  }, [turnState]);

  const game = gameRef.current;

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.title}>MOBS</span>
        <span className={styles.hp}>
          HP {playerHp}/{playerMaxHp}
        </span>
        <span className={styles.xp}>XP {playerXp}</span>
        {alertCount > 0 && (
          <span className={styles.alert}>
            {alertCount} monster{alertCount !== 1 ? "s" : ""} alerted
          </span>
        )}
        {gameOver && <span className={styles.dead}>DEAD — press R</span>}
      </div>

      {/* ── Main area ── */}
      <div className={styles.mainArea}>
        {/* First-person 3-D view */}
        <div className={styles.perspectiveView} tabIndex={0}>
          {game && (
            <PerspectiveDungeonView
              solidData={game.solidData}
              width={DW}
              height={DH}
              cameraX={camera.x}
              cameraZ={camera.z}
              yaw={camera.yaw}
              atlas={atlas}
              texture={dungeonTexture}
              floorTile={0}
              ceilingTile={1}
              wallTile={2}
              renderRadius={20}
              fov={60}
              fogNear={4}
              fogFar={20}
              ceilingHeight={CEILING_H}
              tileSize={TILE_SIZE}
              mobiles={mobiles}
              spriteAtlas={spriteAtlas ?? undefined}
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </div>

        {/* Sidebar: minimap + combat log */}
        <div className={styles.sidebar}>
          <canvas
            ref={minimapRef}
            width={240}
            height={160}
            className={styles.minimapCanvas}
          />
          <div ref={logRef} className={styles.log}>
            {log.map((entry, i) => (
              <div
                key={i}
                className={
                  entry.kind === "damage"
                    ? styles.logDamage
                    : entry.kind === "death"
                      ? styles.logDeath
                      : entry.kind === "xp"
                        ? styles.logXp
                        : styles.logEntry
                }
              >
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Status panel ── */}
      <div className={styles.statusPanel}>
        <span>Facing: {cardinalDir(camera.yaw)}</span>
        <span className={styles.controls}>
          W/S — move &nbsp;·&nbsp; A/D — turn 90° &nbsp;·&nbsp; Space — wait
          &nbsp;·&nbsp; R — new dungeon
        </span>
      </div>
    </div>
  );
}
