/**
 * Targeting — turn-based dungeon with AoE spell targeting.
 *
 * Controls:
 *   W / ArrowUp    — step forward
 *   S / ArrowDown  — step backward
 *   A              — turn left 90°
 *   D              — turn right 90°
 *   1-4            — select spell
 *   F / Enter      — cast selected spell
 *   Escape         — cancel spell
 *   Space / .      — wait a turn
 *   R              — regenerate dungeon
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Html } from "@react-three/drei";
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
import { tilesInRadius, tilesInCone, tilesInLine } from "../../spatial";
import type { GridPos } from "../../astar";
import { tickEffects, type ActiveEffect } from "../../effects";
import { useNavigate } from "react-router-dom";
import styles from "./Targeting.module.css";

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

function loadRepackedAtlasTexture(
  sources: Array<{ x: number; y: number }>,
): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TILE_PX * sources.length;
      canvas.height = TILE_PX;
      const ctx = canvas.getContext("2d")!;
      sources.forEach(({ x, y }, i) => {
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
        );
      });
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
// Monster templates
// ---------------------------------------------------------------------------

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

const SPRITE_SRC: Array<{ x: number; y: number }> = [
  { x: 80, y: 416 },
  { x: 272, y: 448 },
  { x: 80, y: 448 },
  { x: 144, y: 368 },
];
const SRC_TILE = 16;
const DST_TILE = 64;

async function loadMonsterSpriteAtlas(url: string): Promise<SpriteAtlas> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = (e) => {
      console.error("Failed to load sprite sheet:", url, e);
      reject(e);
    };
    el.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_COLS * DST_TILE;
  canvas.height = DST_TILE;
  const ctx = canvas.getContext("2d")!;

  const tmp = document.createElement("canvas");
  tmp.width = SRC_TILE;
  tmp.height = SRC_TILE;
  const tCtx = tmp.getContext("2d")!;

  for (let col = 0; col < SPRITE_COLS; col++) {
    const { x, y } = SPRITE_SRC[col];
    tCtx.clearRect(0, 0, SRC_TILE, SRC_TILE);
    tCtx.drawImage(img, x, y, SRC_TILE, SRC_TILE, 0, 0, SRC_TILE, SRC_TILE);
    const px = tCtx.getImageData(0, 0, SRC_TILE, SRC_TILE);
    const bgR = px.data[0],
      bgG = px.data[1],
      bgB = px.data[2];
    const TOLERANCE = 30;
    for (let i = 0; i < px.data.length; i += 4) {
      const r = px.data[i],
        g = px.data[i + 1],
        b = px.data[i + 2];
      if (
        Math.abs(r - bgR) < TOLERANCE &&
        Math.abs(g - bgG) < TOLERANCE &&
        Math.abs(b - bgB) < TOLERANCE
      ) {
        px.data[i + 3] = 0;
      }
    }
    tCtx.putImageData(px, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      tmp,
      0,
      0,
      SRC_TILE,
      SRC_TILE,
      col * DST_TILE,
      0,
      DST_TILE,
      DST_TILE,
    );
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
  const isOpaque = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height)
      return true;
    return solidData[y * dungeon.width + x] !== 0;
  };
  return {
    isWalkable,
    monsterDecide: (state, monsterId) =>
      decideChasePlayer(state, monsterId, dungeon, isWalkable, isOpaque, 8, true),
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

type LogKind = "info" | "damage" | "death" | "xp" | "spell";
type LogEntry = { text: string; kind: LogKind };

// ---------------------------------------------------------------------------
// Floating damage numbers
// ---------------------------------------------------------------------------

type FloatNum = {
  id: number;
  wx: number;
  wy: number;
  wz: number;
  value: number;
  color?: string;
};

if (
  typeof document !== "undefined" &&
  !document.getElementById("mobs-float-style")
) {
  const s = document.createElement("style");
  s.id = "mobs-float-style";
  s.textContent = `@keyframes mobsFloatUp { 0% { opacity:1; transform:translateY(0); } 100% { opacity:0; transform:translateY(-56px); } }`;
  document.head.appendChild(s);
}

function FloatingDamageNumbers({ nums }: { nums: FloatNum[] }): ReactNode {
  return (
    <>
      {nums.map((n) => (
        <Html
          key={n.id}
          position={[n.wx, n.wy, n.wz]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              color: n.color ?? "#ff3333",
              fontFamily: "monospace",
              fontSize: "22px",
              fontWeight: "bold",
              textShadow: "0 0 4px #000, 1px 1px 0 #000, -1px -1px 0 #000",
              animation: "mobsFloatUp 1.1s ease-out forwards",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {n.value}
          </div>
        </Html>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

type SpellId = "smite" | "fireball" | "cone" | "lightning";
type EffectColor = "fire" | "lightning";

type SpellDef = {
  id: SpellId;
  name: string;
  key: string;
  damagePerTick: number;
  effectDuration: number;
  effectColor: EffectColor;
  description: string;
  getTargetCells: (
    px: number,
    py: number,
    fdx: number,
    fdy: number,
  ) => GridPos[];
};

const SPELLS: SpellDef[] = [
  {
    id: "smite",
    name: "Smite",
    key: "1",
    damagePerTick: 8,
    effectDuration: 1,
    effectColor: "lightning",
    description: "Strike 1 cell ahead",
    getTargetCells: (px, py, fdx, fdy) =>
      tilesInRadius(px + fdx, py + fdy, 0, "chebyshev"),
  },
  {
    id: "fireball",
    name: "OmgFlOoRisLAvA UwU",
    key: "2",
    damagePerTick: 4,
    effectDuration: 3,
    effectColor: "fire",
    description: "AoE fire r=3, lasts 3 turns",
    getTargetCells: (px, py, fdx, fdy) =>
      tilesInRadius(px + fdx * 3, py + fdy * 3, 3, "euclidean"),
  },
  {
    id: "cone",
    name: "Cone Blast",
    key: "3",
    damagePerTick: 5,
    effectDuration: 2,
    effectColor: "fire",
    description: "Fire cone 90°, range 5",
    getTargetCells: (px, py, fdx, fdy) =>
      tilesInCone(px, py, Math.atan2(fdy, fdx), Math.PI / 4, 5),
  },
  {
    id: "lightning",
    name: "Lightning",
    key: "4",
    damagePerTick: 6,
    effectDuration: 1,
    effectColor: "lightning",
    description: "Bolt in facing dir, range 8",
    getTargetCells: (px, py, fdx, fdy) =>
      tilesInLine(
        { x: px + fdx, y: py + fdy },
        { x: px + fdx * 8, y: py + fdy * 8 },
      ),
  },
];

// ---------------------------------------------------------------------------
// World effects
// ---------------------------------------------------------------------------

type WorldEffect = {
  id: number;
  cellList: GridPos[];
  effect: ActiveEffect;
  effectColor: EffectColor;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Targeting() {
  const navigate = useNavigate();
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

  const flashExpiryRef = useRef<Map<string, number>>(new Map());
  const [flashTick, setFlashTick] = useState(0);

  const [floatNums, setFloatNums] = useState<FloatNum[]>([]);
  const floatIdRef = useRef(0);

  // Spell state
  const [selectedSpell, setSelectedSpell] = useState<SpellId | null>(null);
  const [worldEffects, setWorldEffects] = useState<WorldEffect[]>([]);
  const worldEffectsRef = useRef<WorldEffect[]>([]);
  const worldEffectIdRef = useRef(0);
  // facing tracks logical yaw for highlight recompute (updated on A/D)
  const [facing, setFacing] = useState(0);
  const [highlightMask, setHighlightMask] = useState<Uint8Array | null>(null);

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

  const bumpRef = useRef({
    bumping: false,
    startTime: 0,
    duration: 130,
    dx: 0,
    dz: 0,
    mag: 0,
    shake: false,
  });

  const atlas = useMemo(
    () => buildTileAtlas(TILE_PX * 3, TILE_PX, TILE_PX, TILE_PX),
    [],
  );
  const [dungeonTexture, setDungeonTexture] = useState<THREE.Texture | null>(
    null,
  );
  useEffect(() => {
    loadRepackedAtlasTexture([SRC_FLOOR, SRC_CEILING, SRC_WALL]).then(
      setDungeonTexture,
    );
  }, []);
  const [spriteAtlas, setSpriteAtlas] = useState<SpriteAtlas | null>(null);
  useEffect(() => {
    loadMonsterSpriteAtlas("/examples/mobs/sprites.png")
      .then(setSpriteAtlas)
      .catch((e) => console.error("Sprite atlas load failed:", e));
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
    setWorldEffects([]);
    worldEffectsRef.current = [];
    setSelectedSpell(null);
    const player = game.turnState.actors[
      game.turnState.playerId
    ] as PlayerActor;
    setPlayerHp(player.hp);
    setPlayerMaxHp(player.maxHp);
    setAlertCount(0);
    setLog([
      {
        text: "New dungeon. Use 1-4 to select spells, F to cast.",
        kind: "info",
      },
    ]);

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
    setFacing(0);
  }, [seed]);

  // Smooth-lerp + bump animation loop
  useEffect(() => {
    let rafId: number;
    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const anim = animRef.current;
      const bump = bumpRef.current;
      if (!anim.animating && !bump.bumping) return;

      let x = anim.toX,
        z = anim.toZ,
        yaw = anim.toYaw;
      if (anim.animating) {
        const raw = (now - anim.startTime) / LERP_MS;
        const t = Math.min(raw, 1);
        const s = t * t * (3 - 2 * t);
        x = anim.fromX + (anim.toX - anim.fromX) * s;
        z = anim.fromZ + (anim.toZ - anim.fromZ) * s;
        yaw = anim.fromYaw + (anim.toYaw - anim.fromYaw) * s;
        if (t >= 1) anim.animating = false;
      }

      let bx = 0,
        bz = 0;
      if (bump.bumping) {
        const bt = Math.min((now - bump.startTime) / bump.duration, 1);
        if (bump.shake) {
          const sign = Math.floor(now / 25) % 2 === 0 ? 1 : -1;
          const decay = 1 - bt;
          bx = bump.dx * bump.mag * decay * sign;
          bz = bump.dz * bump.mag * decay * sign;
        } else {
          const fac = bt < 0.5 ? bt * 2 : (1 - bt) * 2;
          bx = bump.dx * bump.mag * fac;
          bz = bump.dz * bump.mag * fac;
        }
        if (bt >= 1) bump.bumping = false;
      }

      setCamera({ x: x + bx, z: z + bz, yaw });
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

  // Highlight mask recompute
  useEffect(() => {
    const game = gameRef.current;
    const player = turnState?.actors[turnState?.playerId] as
      | PlayerActor
      | undefined;
    const mask = new Uint8Array(DW * DH);

    // Active world effects
    for (const we of worldEffects) {
      const v = we.effectColor === "fire" ? 2 : 3;
      for (const { x, y } of we.cellList) {
        if (x >= 0 && y >= 0 && x < DW && y < DH) mask[y * DW + x] = v;
      }
    }

    // Spell preview (only overwrite cells not already showing an active effect)
    if (selectedSpell && player && game) {
      const yaw = logicalRef.current.yaw;
      const fdx = Math.round(-Math.sin(yaw));
      const fdy = Math.round(-Math.cos(yaw));
      const spell = SPELLS.find((s) => s.id === selectedSpell)!;
      const cells = spell.getTargetCells(player.x, player.y, fdx, fdy);
      for (const { x, y } of cells) {
        if (x >= 0 && y >= 0 && x < DW && y < DH && mask[y * DW + x] === 0) {
          mask[y * DW + x] = 1;
        }
      }
    }

    setHighlightMask(mask.some((v) => v > 0) ? mask : null);
  }, [selectedSpell, worldEffects, turnState, facing]);

  // Spawn a floating damage number
  const spawnFloat = useCallback(
    (wx: number, wy: number, wz: number, amount: number, color?: string) => {
      const id = ++floatIdRef.current;
      setFloatNums((prev) => [
        ...prev,
        { id, wx, wy, wz, value: amount, color },
      ]);
      setTimeout(
        () => setFloatNums((prev) => prev.filter((f) => f.id !== id)),
        1150,
      );
    },
    [],
  );

  // Commit a player turn action (also ticks world effects)
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
      let newState = commitPlayerAction(game.turnState, deps, action);

      // Tick world effects
      let workingActors = { ...newState.actors };
      const updatedWorldEffects: WorldEffect[] = [];
      for (const we of worldEffectsRef.current) {
        const { updatedEffects, deltas } = tickEffects([we.effect], 0);
        const cellSet = new Set(we.cellList.map(({ x, y }) => `${x},${y}`));
        for (const delta of deltas) {
          const dmg = delta.hp != null ? Math.abs(delta.hp) : 0;
          if (dmg === 0) continue;
          for (const actor of Object.values(workingActors)) {
            if (actor.kind !== "monster" || !actor.alive) continue;
            if (!cellSet.has(`${actor.x},${actor.y}`)) continue;
            const monster = actor as MonsterActor;
            const newHp = Math.max(0, monster.hp - dmg);
            const died = newHp <= 0;
            evts.push({
              kind: "damage",
              actorId: monster.id,
              amount: dmg,
              x: monster.x,
              y: monster.y,
            });
            if (died) {
              evts.push({
                kind: "death",
                actorId: monster.id,
                sourceId: newState.playerId,
                x: monster.x,
                y: monster.y,
              });
              evts.push({
                kind: "xpGain",
                amount: monster.xp,
                x: monster.x,
                y: monster.y,
              });
            }
            workingActors = {
              ...workingActors,
              [monster.id]: { ...monster, hp: newHp, alive: !died },
            };
          }
        }
        if (updatedEffects.length > 0) {
          updatedWorldEffects.push({ ...we, effect: updatedEffects[0] });
        }
      }

      const finalState = { ...newState, actors: workingActors };
      game.turnState = finalState;
      setTurnState(finalState);
      worldEffectsRef.current = updatedWorldEffects;
      setWorldEffects(updatedWorldEffects);

      let playerTookDamage = false;
      for (const evt of evts) {
        if (evt.kind === "damage") {
          const who =
            evt.actorId === finalState.playerId
              ? "You"
              : ((finalState.actors[evt.actorId] as MonsterActor | undefined)
                  ?.name ?? evt.actorId);
          pushLog({ text: `${who} takes ${evt.amount} dmg`, kind: "damage" });

          if (evt.actorId === finalState.playerId) {
            playerTookDamage = true;
          } else {
            flashExpiryRef.current.set(evt.actorId, performance.now() + 220);
            setFlashTick((t) => t + 1);
            setTimeout(() => setFlashTick((t) => t + 1), 230);

            const monster = finalState.actors[evt.actorId] as
              | MonsterActor
              | undefined;
            if (monster) {
              const wx = (monster.x + 0.5) * TILE_SIZE;
              const wy = CEILING_H * 0.9;
              const wz = (monster.y + 0.5) * TILE_SIZE;
              // fire damage = orange, lightning = yellow
              const color =
                worldEffectsRef.current.length > 0 ? "#ff8800" : "#ff3333";
              spawnFloat(wx, wy, wz, evt.amount, color);
            }
          }
        } else if (evt.kind === "death") {
          const who =
            evt.actorId === finalState.playerId
              ? "You"
              : ((finalState.actors[evt.actorId] as MonsterActor | undefined)
                  ?.name ?? evt.actorId);
          pushLog({ text: `${who} died!`, kind: "death" });
          if (evt.actorId === finalState.playerId) setGameOver(true);
        } else if (evt.kind === "xpGain") {
          const xpEvt = evt as XpGainEvent;
          setPlayerXp((prev) => prev + xpEvt.amount);
          pushLog({ text: `+${xpEvt.amount} XP`, kind: "xp" });
        }
      }

      const newPlayer = finalState.actors[finalState.playerId] as PlayerActor;
      setPlayerHp(newPlayer.hp);

      const alerted = Object.values(finalState.actors).filter(
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

      if (action.kind === "move" && action.dx != null && action.dy != null) {
        const attackHit = evts.some(
          (e) => e.kind === "damage" && e.actorId !== finalState.playerId,
        );
        if (attackHit) {
          bumpRef.current = {
            bumping: true,
            startTime: performance.now(),
            duration: 130,
            dx: action.dx,
            dz: action.dy ?? 0,
            mag: 0.35,
            shake: false,
          };
        }
      }
      if (playerTookDamage) {
        bumpRef.current = {
          bumping: true,
          startTime: performance.now(),
          duration: 250,
          dx: 1,
          dz: 0,
          mag: 0.05,
          shake: true,
        };
      }

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
    [gameOver, pushLog, spawnFloat],
  );

  // Cast a spell: create world effect then consume a turn
  const castSpell = useCallback(
    (spell: SpellDef) => {
      const game = gameRef.current;
      if (!game || gameOver || !game.turnState.awaitingPlayerInput) return;

      const player = game.turnState.actors[
        game.turnState.playerId
      ] as PlayerActor;
      const { yaw } = logicalRef.current;
      const fdx = Math.round(-Math.sin(yaw));
      const fdy = Math.round(-Math.cos(yaw));

      const cells = spell
        .getTargetCells(player.x, player.y, fdx, fdy)
        .filter(({ x, y }) => x >= 0 && y >= 0 && x < DW && y < DH);
      if (cells.length === 0) return;

      const effectId = ++worldEffectIdRef.current;
      const newEffect: WorldEffect = {
        id: effectId,
        cellList: cells,
        effect: {
          id: `${spell.id}_${effectId}`,
          name: spell.name,
          stepsRemaining: spell.effectDuration,
          data: { damage: spell.damagePerTick },
          ticks: {
            onTick: (eff) => ({ hp: -eff.data.damage }),
          },
        },
        effectColor: spell.effectColor,
      };

      // Add to ref immediately so applyTurn sees it
      worldEffectsRef.current = [...worldEffectsRef.current, newEffect];
      setSelectedSpell(null);
      pushLog({
        text: `Cast ${spell.name}! (${cells.length} cells, ${spell.effectDuration} turns)`,
        kind: "spell",
      });
      applyTurn({ kind: "wait" });
    },
    [gameOver, applyTurn, pushLog],
  );

  // Keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
          setFacing(toYaw);
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
          setFacing(toYaw);
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
        case "Digit1":
          setSelectedSpell((p) => (p === "smite" ? null : "smite"));
          break;
        case "Digit2":
          setSelectedSpell((p) => (p === "fireball" ? null : "fireball"));
          break;
        case "Digit3":
          setSelectedSpell((p) => (p === "cone" ? null : "cone"));
          break;
        case "Digit4":
          setSelectedSpell((p) => (p === "lightning" ? null : "lightning"));
          break;
        case "Escape":
          setSelectedSpell(null);
          break;
        case "KeyF":
        case "Enter": {
          e.preventDefault();
          const spellId = selectedSpell;
          if (spellId) {
            const spell = SPELLS.find((s) => s.id === spellId);
            if (spell) castSpell(spell);
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyTurn, castSpell, selectedSpell]);

  // Scroll log to bottom
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Billboard mobiles
  const { mobiles, mobileFlash } = useMemo(() => {
    if (!turnState) return { mobiles: [], mobileFlash: [] };
    const now = performance.now();
    const flashMap = flashExpiryRef.current;
    const alive = Object.values(turnState.actors).filter(
      (a) => a.kind === "monster" && (a as MonsterActor).alive,
    ) as MonsterActor[];
    return {
      mobiles: alive.map((m) => ({
        x: m.x,
        z: m.y,
        type: "monster",
        tileId: mobTileId(m.glyph),
      })),
      mobileFlash: alive.map((m) => (flashMap.get(m.id) ?? 0) > now),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnState, flashTick]);

  const game = gameRef.current;
  const activeSpell = SPELLS.find((s) => s.id === selectedSpell);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.title}>TARGETING</span>
        <span className={styles.hp}>
          HP {playerHp}/{playerMaxHp}
        </span>
        <span className={styles.xp}>XP {playerXp}</span>
        {alertCount > 0 && (
          <span className={styles.alert}>
            {alertCount} monster{alertCount !== 1 ? "s" : ""} alerted
          </span>
        )}
        {worldEffects.length > 0 && (
          <span className={styles.alert}>
            {worldEffects.length} active effect
            {worldEffects.length !== 1 ? "s" : ""}
          </span>
        )}
        {gameOver && <span className={styles.dead}>DEAD — press R</span>}
        <button className={styles.backBtn} onClick={() => navigate("/")}>
          ← Menu
        </button>
      </div>

      {/* Main area */}
      <div className={styles.mainArea}>
        <div className={styles.perspectiveView} tabIndex={0}>
          {game && dungeonTexture && (
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
              mobileFlash={mobileFlash}
              spriteAtlas={spriteAtlas ?? undefined}
              highlightMask={highlightMask ?? undefined}
              style={{ width: "100%", height: "100%" }}
            >
              <FloatingDamageNumbers nums={floatNums} />
            </PerspectiveDungeonView>
          )}
          {selectedSpell && (
            <div className={styles.crosshair}>
              <div className={styles.crosshairH} />
              <div className={styles.crosshairV} />
              <div className={styles.crosshairDot} />
            </div>
          )}
        </div>

        {/* Sidebar */}
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
                        : entry.kind === "spell"
                          ? styles.logSpell
                          : styles.logEntry
                }
              >
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Spell bar */}
      <div className={styles.spellBar}>
        {SPELLS.map((spell) => (
          <button
            key={spell.id}
            className={
              selectedSpell === spell.id
                ? styles.spellBtnActive
                : styles.spellBtn
            }
            onClick={() =>
              setSelectedSpell((p) => (p === spell.id ? null : spell.id))
            }
            title={spell.description}
          >
            [{spell.key}] {spell.name}
          </button>
        ))}
        <span className={styles.spellHint}>
          {activeSpell
            ? `${activeSpell.description} · F/Enter: cast · Esc: cancel`
            : "Select a spell (1-4) then F/Enter to cast"}
        </span>
      </div>

      {/* Status panel */}
      <div className={styles.statusPanel}>
        <span>Facing: {cardinalDir(camera.yaw)}</span>
        <span className={styles.controls}>
          W/S move · A/D turn · 1-4 spell · F cast · Esc cancel · Space wait · R
          new
        </span>
      </div>
    </div>
  );
}
