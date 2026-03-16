/**
 * Mobs — turn-based dungeon example with monster AI.
 *
 * Controls:
 *   WASD / Arrow keys — move / bump-attack
 *   . or Space        — wait a turn
 *   R                 — regenerate dungeon
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { generateBspDungeon, type BspDungeonOutputs } from "../../bsp";
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
import type { MonsterActor, PlayerActor, TurnAction } from "../../turn/turnTypes";
import type { TurnEvent, XpGainEvent } from "../../turn/turnEvents";
import styles from "./Mobs.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CELL = 10; // pixels per cell
const DW = 60;
const DH = 40;

const TEMPLATES: Record<string, MonsterTemplate> = {
  goblin: { name: "Goblin",    glyph: "g", danger: 1, hp: 6,  attack: 3, defense: 0, xp: 10, speed: 8 },
  orc:    { name: "Orc",       glyph: "o", danger: 3, hp: 14, attack: 6, defense: 1, xp: 25, speed: 6 },
  troll:  { name: "Troll",     glyph: "T", danger: 6, hp: 30, attack: 9, defense: 2, xp: 60, speed: 5 },
  rat:    { name: "Giant Rat", glyph: "r", danger: 0, hp: 4,  attack: 2, defense: 0, xp: 5,  speed: 9 },
};

const MOB_TYPES = ["goblin", "orc", "rat", "goblin", "goblin", "rat", "orc"];

// ---------------------------------------------------------------------------
// Dungeon helpers
// ---------------------------------------------------------------------------

function isSolid(dungeon: BspDungeonOutputs, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return true;
  const data = dungeon.textures.solid.image.data as Uint8Array;
  return data[(y * dungeon.width + x) * 4] !== 0;
}

function roomCenter(dungeon: BspDungeonOutputs, roomId: number): { x: number; y: number } {
  const room = dungeon.rooms.get(roomId);
  if (!room) return { x: Math.floor(dungeon.width / 2), y: Math.floor(dungeon.height / 2) };
  return {
    x: Math.floor(room.rect.x + room.rect.w / 2),
    y: Math.floor(room.rect.y + room.rect.h / 2),
  };
}

// ---------------------------------------------------------------------------
// Combat (bump-to-attack)
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
    a => a.alive && a.x === targetX && a.y === targetY && a.id !== attackerId,
  ) as PlayerActor | MonsterActor | undefined;

  if (!target) return state;

  const dmg = Math.max(1, attacker.attack - target.defense);
  const newHp = Math.max(0, target.hp - dmg);
  const died = newHp <= 0;

  onEvent({ kind: "damage", actorId: target.id, amount: dmg, x: target.x, y: target.y });

  const newActors = {
    ...state.actors,
    [target.id]: { ...target, hp: newHp, alive: !died },
  };

  if (died) {
    onEvent({ kind: "death", actorId: target.id, sourceId: attackerId, x: target.x, y: target.y });
    if (attackerId === state.playerId && target.kind === "monster") {
      onEvent({ kind: "xpGain", amount: (target as MonsterActor).xp, x: target.x, y: target.y });
    }
  }

  return { ...state, actors: newActors };
}

// ---------------------------------------------------------------------------
// TurnSystemDeps builder
// ---------------------------------------------------------------------------

function buildDeps(
  dungeon: BspDungeonOutputs,
  isWalkable: (x: number, y: number) => boolean,
  actors: TurnSystemState["actors"],
  onEvent: (e: TurnEvent) => void,
): TurnSystemDeps {
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
      if (action.kind !== "move" || action.dx == null || action.dy == null) return state;
      const actor = state.actors[actorId];
      if (!actor) return state;
      const nx = actor.x + action.dx;
      const ny = actor.y + action.dy;
      const blocker = Object.values(state.actors).find(
        a => a.id !== actorId && a.alive && a.blocksMovement && a.x === nx && a.y === ny,
      );
      if (blocker) return resolveBump(state, actorId, nx, ny, onEvent);
      if (!deps.isWalkable(nx, ny)) return state;
      return { ...state, actors: { ...state.actors, [actorId]: { ...actor, x: nx, y: ny } } };
    },
    onEvent,
  };
}

// ---------------------------------------------------------------------------
// Dungeon initialisation
// ---------------------------------------------------------------------------

type GameState = {
  dungeon: BspDungeonOutputs;
  isWalkable: (x: number, y: number) => boolean;
  turnState: TurnSystemState;
};

function initGame(seed: number): GameState {
  const dungeon = generateBspDungeon({ width: DW, height: DH, seed, keepOuterWalls: true });
  const isWalkable = (x: number, y: number) => !isSolid(dungeon, x, y);

  // Spawn one monster per room (skip start room)
  const mobiles: Array<{ x: number; z: number; type: string; tileId: number }> = [];
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

  const playerPos = roomCenter(dungeon, dungeon.startRoomId);
  const player = createPlayerActor(playerPos.x, playerPos.y);
  const monsters = createMonstersFromMobiles(mobiles, TEMPLATES);

  let turnState = createTurnSystemState(player, monsters);
  // Advance to first player turn
  const deps = buildDeps(dungeon, isWalkable, turnState.actors, () => {});
  turnState = tickUntilPlayer(turnState, deps);

  return { dungeon, isWalkable, turnState };
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------

function renderGame(
  canvas: HTMLCanvasElement,
  dungeon: BspDungeonOutputs,
  state: TurnSystemState,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = dungeon;
  const solid = dungeon.textures.solid.image.data as Uint8Array;

  // Dungeon tiles
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = solid[(y * W + x) * 4] !== 0 ? "#161616" : "#2a2a2a";
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // Actors
  ctx.font = `${CELL - 1}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const actor of Object.values(state.actors)) {
    const px = actor.x * CELL + CELL / 2;
    const py = actor.y * CELL + CELL / 2;

    if (actor.kind === "player") {
      ctx.fillStyle = "#ffe066";
      ctx.fillText("@", px, py);
    } else {
      const m = actor as MonsterActor;
      if (!m.alive) {
        ctx.fillStyle = "#383838";
        ctx.fillText("%", px, py);
      } else {
        ctx.fillStyle =
          m.alertState === "chasing"   ? "#ff4040" :
          m.alertState === "searching" ? "#ff9040" :
                                         "#b04040";
        ctx.fillText(m.glyph, px, py);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Log types
// ---------------------------------------------------------------------------

type LogKind = "info" | "damage" | "death" | "xp";
type LogEntry = { text: string; kind: LogKind };

const logClass: Record<LogKind, string> = {
  info:   styles.logEntry,
  damage: styles.logDamage,
  death:  styles.logDeath,
  xp:     styles.logXp,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Mobs() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const pendingEvents = useRef<TurnEvent[]>([]);

  const [playerHp, setPlayerHp] = useState(20);
  const [playerMaxHp, setPlayerMaxHp] = useState(20);
  const [playerXp, setPlayerXp] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const pushLog = useCallback((entry: LogEntry) => {
    setLog(prev => [...prev.slice(-49), entry]);
  }, []);

  // Init dungeon on seed change
  useEffect(() => {
    pendingEvents.current = [];
    const game = initGame(seed);
    gameRef.current = game;
    setGameOver(false);
    setPlayerXp(0);
    const player = game.turnState.actors[game.turnState.playerId] as PlayerActor;
    setPlayerHp(player.hp);
    setPlayerMaxHp(player.maxHp);
    setAlertCount(0);
    setLog([{ text: "New dungeon. Hunt the monsters!", kind: "info" }]);
    if (canvasRef.current) renderGame(canvasRef.current, game.dungeon, game.turnState);
  }, [seed]);

  // Scroll log to bottom
  useEffect(() => {
    if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [log]);

  const applyTurn = useCallback((action: TurnAction) => {
    const game = gameRef.current;
    if (!game || gameOver || !game.turnState.awaitingPlayerInput) return;

    const evts: TurnEvent[] = [];
    const deps = buildDeps(game.dungeon, game.isWalkable, game.turnState.actors, e => evts.push(e));

    const newState = commitPlayerAction(game.turnState, deps, action);
    game.turnState = newState;

    // Flush events into log
    for (const evt of evts) {
      if (evt.kind === "damage") {
        const who = evt.actorId === newState.playerId ? "You" :
          (game.turnState.actors[evt.actorId] as MonsterActor | undefined)?.name ?? evt.actorId;
        pushLog({ text: `${who} takes ${evt.amount} dmg`, kind: "damage" });
      } else if (evt.kind === "death") {
        const who = evt.actorId === newState.playerId ? "You" :
          (game.turnState.actors[evt.actorId] as MonsterActor | undefined)?.name ?? evt.actorId;
        pushLog({ text: `${who} died!`, kind: "death" });
        if (evt.kind === "death" && evt.actorId === newState.playerId) setGameOver(true);
      } else if (evt.kind === "xpGain") {
        const xpEvt = evt as XpGainEvent;
        setPlayerXp(prev => prev + xpEvt.amount);
        pushLog({ text: `+${xpEvt.amount} XP`, kind: "xp" });
      }
    }

    const player = newState.actors[newState.playerId] as PlayerActor;
    setPlayerHp(player.hp);

    const alerted = Object.values(newState.actors).filter(
      a => a.kind === "monster" && a.alive && (a as MonsterActor).alertState !== "idle",
    ).length;
    setAlertCount(alerted);

    if (canvasRef.current) renderGame(canvasRef.current, game.dungeon, newState);

    if (!player.alive) {
      setGameOver(true);
      pushLog({ text: "You died. Press R for a new dungeon.", kind: "death" });
    }
  }, [gameOver, pushLog]);

  // Keyboard handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      switch (e.key) {
        case "ArrowUp":    case "w": case "W": e.preventDefault(); applyTurn({ kind: "move", dx: 0,  dy: -1 }); break;
        case "ArrowDown":  case "s": case "S": e.preventDefault(); applyTurn({ kind: "move", dx: 0,  dy:  1 }); break;
        case "ArrowLeft":  case "a": case "A": e.preventDefault(); applyTurn({ kind: "move", dx: -1, dy:  0 }); break;
        case "ArrowRight": case "d": case "D": e.preventDefault(); applyTurn({ kind: "move", dx:  1, dy:  0 }); break;
        case ".": case " ": e.preventDefault(); applyTurn({ kind: "wait" }); break;
        case "r": case "R": setSeed(Math.floor(Math.random() * 0x7fffffff)); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyTurn]);

  return (
    <div className={styles.root}>
      <p className={styles.title}>Mobs — Turn-based dungeon</p>

      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={DW * CELL}
        height={DH * CELL}
      />

      <div className={styles.hud}>
        <span className={styles.hp}>HP {playerHp}/{playerMaxHp}</span>
        <span className={styles.xp}>XP {playerXp}</span>
        {alertCount > 0 && (
          <span className={styles.alert}>{alertCount} monster{alertCount !== 1 ? "s" : ""} alert!</span>
        )}
        {gameOver && <span style={{ color: "#f44" }}>DEAD — press R</span>}
      </div>

      <div ref={logContainerRef} className={styles.log}>
        {log.map((entry, i) => (
          <div key={i} className={logClass[entry.kind]}>{entry.text}</div>
        ))}
      </div>

      <p className={styles.keys}>
        WASD/Arrows move &amp; attack &nbsp;·&nbsp; Space/. wait &nbsp;·&nbsp; R new dungeon
      </p>
      <p className={styles.keys}>
        <span style={{ color: "#ffe066" }}>@</span> you &nbsp;·&nbsp;
        <span style={{ color: "#b04040" }}>g r o T</span> monster (idle) &nbsp;·&nbsp;
        <span style={{ color: "#ff4040" }}>!</span> chasing &nbsp;·&nbsp;
        <span style={{ color: "#383838" }}>%</span> dead
      </p>
    </div>
  );
}
