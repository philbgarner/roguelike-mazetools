import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "./ui/Button";
import hotkeys from "hotkeys-js";
import * as THREE from "three";

import DungeonRenderView from "../rendering/DungeonRenderView";
import { publicUrl } from "../utils/publicUrl";

import { aStar8 } from "../pathfinding/aStar8";
import { GameScreen, useGame } from "./GameProvider";
import {
  clearPathMaskRGBA,
  createPathMaskRGBA,
  stampPath,
} from "../rendering/pathMask";
import {
  clearActorCharMask,
  createActorCharMaskR8,
  stampNpcsToNpcCharMask,
  type ActorCharMask,
} from "../rendering/actorCharMask";
import type { TurnAction, NpcActor } from "../turn/turnTypes";

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
  createMerchantWagons,
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
import { decideMerchantWagon } from "../turn/npcAI";
import {
  createWorldEffectsState,
  advanceWorldEffects,
} from "../world/worldEffects";

import "./styles.css";
import { FocusLerper } from "./FocusLerper";

import BorderPanel from "./ui/BorderPanel";
import Tooltip, { TooltipProps } from "./ui/Tooltip";
import MessageLog from "./ui/MessageLog";
import { useMessageLog } from "./ui/useMessageLog";
import ModalPanel from "./ui/ModalPanel";
import { useConfirmYesNo } from "./ui/useConfirmYesNo";
import {
  generateShopInventory,
  npcIdToSeed,
  type ShopItem,
} from "./merchantShop";
import {
  addItem,
  createInventoryItem,
  equipItem,
  unequipSlot,
  removeItem,
  type Inventory,
  type InventoryItem,
  type StatDelta,
} from "./inventory";
import { getItemTemplate } from "./data/itemData";
import { tickActiveBuffs, type ActiveBuff } from "./activeBuffs";
import PlayerInventoryModal from "./ui/PlayerInventoryModal";
import PlayerStatsPanel from "./ui/PlayerStatsPanel";
import QuickSlotPanel from "./ui/QuickSlotPanel";

// ---------------------------------------------------------------------------
// Dungeon generation
// ---------------------------------------------------------------------------

const AUTOWALK_DELAY = 63;

/** Must match the `radius` value passed to DungeonRenderView (visibility.ts). */
const PLAYER_VIS_RADIUS = 6;

const MAP_ZOOM_DEFAULT = 32;
const MAP_ZOOM_MIN = 4;
const MAP_ZOOM_MAX = 32;

const TOOLTIP_DELAY = 600;

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
  screen: GameScreen;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Overworld({ screen }: OverworldProps) {
  const {
    goTo,
    setSeed,
    setLevel,
    setFloor,
    setTheme,
    overworldBsp,
    setOverworld,
    player,
    setPlayer,
    completedDungeons,
  } = useGame();
  const seed = overworldBsp ? overworldBsp.meta.seedUsed : "test";
  console.log("building screen", screen);
  const result = useMemo(() => {
    console.log("building forest for seed", seed);
    return buildForest(seed);
  }, [seed]);
  const dungeon = result.bsp;
  const walkDungeon = result.walkDungeon;
  const content: ForestContentOutputs = result.content;
  // Cast for typed APIs (TurnSystemDeps, aStar8, DungeonRenderView) that expect
  // ContentOutputs — those APIs only access featureType & featureId masks, which
  // ForestContentOutputs provides.
  const contentLegacy = content as unknown as ContentOutputs;

  // Player spawn comes directly from forest content — no need for computeStartCell.
  const startCell = content.meta.playerSpawn;

  // Flat grid indices of completed dungeon portals (for grey tint in DungeonRenderView).
  const completedPortalIndices = useMemo(() => {
    const W = dungeon.width;
    return content.meta.dungeonPortals
      .filter((p) => completedDungeons.has(p.seed))
      .map((p) => p.y * W + p.x);
  }, [completedDungeons, content.meta.dungeonPortals, dungeon.width]);

  // --- World effects clock ---
  const worldEffectsRef = useRef(createWorldEffectsState());

  const [showMerchantModal, setShowMerchantModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showPlayerStatsModal, setShowPlayerStatsModal] = useState(false);

  const { confirmPrompt, dialog } = useConfirmYesNo();

  const [tooltip, setTooltip] = useState<TooltipProps>({
    x: 0,
    y: 0,
    visible: false,
    children: <></>,
  });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    messages: logMessages,
    addMessage: addLogMessage,
    removeMessage: removeLogMessage,
  } = useMessageLog();

  // --- Turn system ---
  const [turnState, setTurnState] = useState<TurnSystemState>(() => {
    const player = createPlayerActor(startCell.x, startCell.y);
    const monsters = createMonstersFromResolved(null);
    const wagons = createMerchantWagons(content.meta.dungeonPortals, 3);
    const ts = createTurnSystemState(player, monsters, wagons);
    const deps = buildDeps(dungeon, ts.actors);
    return tickUntilPlayer(ts, deps);
  });

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
      npcDecide: (state, npcId) =>
        decideMerchantWagon(
          state,
          npcId,
          _dungeon,
          contentLegacy,
          content.meta.dungeonPortals,
        ),
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

  // When the player moves, snap the focus target back to them.
  useEffect(() => {
    targetFocusRef.current = { x: playerX, y: playerY };
  }, [playerX, playerY]);

  // --- First-discovery log messages ---
  const seenNpcIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const id in turnState.actors) {
      const actor = turnState.actors[id];
      if (!actor || actor.kind !== "npc" || !actor.alive) continue;
      if (seenNpcIdsRef.current.has(id)) continue;
      if (Math.hypot(actor.x - playerX, actor.y - playerY) > PLAYER_VIS_RADIUS)
        continue;
      seenNpcIdsRef.current.add(id);
      addLogMessage("A merchant wagon is nearby.");
    }
  }, [turnState.actors, playerX, playerY, addLogMessage]);

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

  // --- NPC char overlay (separate blue-tinted texture) ---
  const npcMaskRef = useRef<ActorCharMask | null>(null);
  const [npcCharTex, setNpcCharTex] = useState<THREE.DataTexture | null>(null);

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

  // Create NPC overlay texture once per dungeon dimensions.
  useEffect(() => {
    if (npcMaskRef.current) npcMaskRef.current.tex.dispose();
    const nm = createActorCharMaskR8(
      dungeon.width,
      dungeon.height,
      "npc_char_r8",
    );
    npcMaskRef.current = nm;
    setNpcCharTex(nm.tex);
    return () => {
      nm.tex.dispose();
      npcMaskRef.current = null;
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

  // CP437 tile ID for '@' (ASCII 64).
  const NPC_GLYPH_TILE = 64;

  // Stamp NPC positions into the NPC char mask each turn.
  useEffect(() => {
    const nm = npcMaskRef.current;
    if (!nm) return;
    clearActorCharMask(nm.data);

    const W = dungeon.width;
    const H = dungeon.height;
    const npcs = Object.values(turnState.actors).filter(
      (a): a is NpcActor => a.kind === "npc" && a.alive,
    );
    stampNpcsToNpcCharMask({
      data: nm.data,
      W,
      H,
      npcs: npcs.map((npc) => ({ id: npc.id, x: npc.x, y: npc.y })),
      npcTile: NPC_GLYPH_TILE,
    });

    nm.tex.needsUpdate = true;
    setNpcCharTex(nm.tex);
  }, [dungeon.width, dungeon.height, turnState.actors]);

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

  function applyBuffTickToPlayer(p: typeof player): typeof player {
    if (p.activeBuffs.length === 0) return p;
    const { updatedBuffs, expiredBuffs } = tickActiveBuffs(p.activeBuffs);
    if (expiredBuffs.length === 0) return { ...p, activeBuffs: updatedBuffs };
    let attack = p.attack;
    let defense = p.defense;
    let maxHp = p.maxHp;
    for (const b of expiredBuffs) {
      attack -= b.bonusAttack;
      defense -= b.bonusDefense;
      maxHp -= b.bonusMaxHp;
    }
    const newMaxHp = Math.max(1, maxHp);
    return {
      ...p,
      activeBuffs: updatedBuffs,
      attack,
      defense,
      maxHp: newMaxHp,
      hp: Math.min(p.hp, newMaxHp),
    };
  }

  function tryCommitMove(dx: number, dy: number) {
    cancelAutoWalkNow();
    attemptCommitPlayerAction({ kind: "move", dx, dy });
    setPlayer((prev) => applyBuffTickToPlayer(prev));
  }

  function handleUseConsumable(item: InventoryItem) {
    setPlayer((prev) => {
      const newInventory = removeItem(prev.inventory, item.instanceId);
      if (item.healAmount && item.healAmount > 0) {
        const healed = Math.min(prev.hp + item.healAmount, prev.maxHp);
        const name =
          item.nameOverride ??
          getItemTemplate(item.templateId)?.name ??
          "Potion";
        addLogMessage(
          `You drink a ${name} and recover ${healed - prev.hp} HP.`,
        );
        return { ...prev, inventory: newInventory, hp: healed };
      }
      if (item.buffDuration && item.buffDuration > 0) {
        const name =
          item.nameOverride ??
          getItemTemplate(item.templateId)?.name ??
          "Potion";
        const buff: ActiveBuff = {
          id: `buff-${item.instanceId}`,
          name,
          stepsRemaining: item.buffDuration,
          bonusAttack: item.bonusAttack,
          bonusDefense: item.bonusDefense,
          bonusMaxHp: item.bonusMaxHp,
          bonusSpeed: item.bonusSpeed ?? 0,
        };
        const parts: string[] = [];
        if (buff.bonusAttack > 0) parts.push(`+${buff.bonusAttack} ATK`);
        if (buff.bonusDefense > 0) parts.push(`+${buff.bonusDefense} DEF`);
        if (buff.bonusMaxHp > 0) parts.push(`+${buff.bonusMaxHp} HP`);
        if (buff.bonusSpeed > 0) parts.push(`+${buff.bonusSpeed} SPD`);
        addLogMessage(
          `You drink a ${name}. ${parts.join(", ")} for ${buff.stepsRemaining} steps.`,
        );
        const newMaxHp = prev.maxHp + buff.bonusMaxHp;
        return {
          ...prev,
          inventory: newInventory,
          activeBuffs: [...prev.activeBuffs, buff],
          attack: prev.attack + buff.bonusAttack,
          defense: prev.defense + buff.bonusDefense,
          maxHp: newMaxHp,
          hp: Math.min(prev.hp + Math.max(0, buff.bonusMaxHp), newMaxHp),
        };
      }
      return { ...prev, inventory: newInventory };
    });
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
      if (action.kind === "move") {
        setPlayer((prev) => applyBuffTickToPlayer(prev));
      }
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
    const wagons = createMerchantWagons(content.meta.dungeonPortals, 3);
    const ts = createTurnSystemState(newPlayer, monsters, wagons);
    const deps = buildDeps(dungeon, ts.actors);
    setTurnState(tickUntilPlayer(ts, deps));
  }, [startCell.x, startCell.y]);

  const contentAtPlayerCell = content.meta.dungeonPortals.find(
    (f) => f.x === playerX && f.y === playerY,
  );

  const npcAtPlayerCell = Object.values(turnState.actors).find(
    (a) => a.kind === "npc" && a.x === playerX && a.y === playerY,
  );

  if (screen !== "overworld") {
    return <></>;
  }

  const cellAtFeet = (() => {
    const idx = playerY * dungeon.width + playerX;
    const terrain = dungeon.masks.solid[idx] === 255 ? "Trees" : "Pathway";
    if (contentAtPlayerCell) return `${terrain} (${contentAtPlayerCell.theme})`;
    if (npcAtPlayerCell) return `${terrain} (Merchant Wagon)`;
    return terrain;
  })();

  return (
    <>
      <MessageLog messages={logMessages} onMessageExpired={removeLogMessage} />

      <BorderPanel
        title={player.name}
        width="20rem"
        height="5rem"
        background="#090909"
        bottom="0px"
      >
        <div>
          HP: {player.hp} / {player.maxHp}
        </div>
      </BorderPanel>
      {/* --- Action --- */}
      <BorderPanel
        title={
          contentAtPlayerCell
            ? contentAtPlayerCell.name
            : npcAtPlayerCell
              ? "Merchant Wagon"
              : cellAtFeet
        }
        width="32rem"
        height="5rem"
        background="#090909"
        bottom="0px"
        left="21rem"
        zIndex={99}
      >
        {contentAtPlayerCell ? (
          completedDungeons.has(contentAtPlayerCell.seed) ? (
            <span style={{ color: "#aaffaa" }}>
              {contentAtPlayerCell.name} has been cleared
            </span>
          ) : (
            <Button
              maxWidth="auto"
              onClick={async () => {
                if (
                  await confirmPrompt(
                    `Are you sure you want to enter the ${contentAtPlayerCell.theme} of ${contentAtPlayerCell.name}?`,
                  )
                ) {
                  addLogMessage(`Entering ${contentAtPlayerCell.theme}...`);
                  setSeed(contentAtPlayerCell.seed);
                  setLevel(contentAtPlayerCell.level);
                  setFloor(1);
                  setTheme(contentAtPlayerCell.theme);
                  goTo("dungeon");
                }
              }}
            >
              Enter {contentAtPlayerCell.theme} of {contentAtPlayerCell.name}
            </Button>
          )
        ) : null}
        {npcAtPlayerCell ? (
          <Button
            maxWidth="12rem"
            onClick={async () => {
              setShowMerchantModal(true);
            }}
          >
            Trade
          </Button>
        ) : null}
      </BorderPanel>
      <QuickSlotPanel
        inventory={player.inventory}
        left="54rem"
        width="calc(100% - 76rem)"
        onEquipToggle={(item) => {
          setPlayer((prev) => {
            const isEquipped =
              item.slot !== undefined &&
              prev.inventory.equipped[item.slot] === item.instanceId;
            const { newInventory, delta } = isEquipped
              ? unequipSlot(prev.inventory, item.slot!)
              : equipItem(prev.inventory, item.instanceId);
            return {
              ...prev,
              inventory: newInventory,
              attack: prev.attack + delta.attack,
              defense: prev.defense + delta.defense,
              maxHp: Math.max(1, prev.maxHp + delta.maxHp),
              hp: Math.min(
                delta.maxHp < 0 ? prev.hp : prev.hp + Math.max(0, delta.maxHp),
                Math.max(1, prev.maxHp + delta.maxHp),
              ),
            };
          });
        }}
        onUseConsumable={(item) => handleUseConsumable(item)}
        onSlotHover={(item, e) => {
          const template = getItemTemplate(item.templateId);
          const parts: string[] = [];
          if (template?.damageType) parts.push(template.damageType);
          if (item.bonusAttack > 0) parts.push(`+${item.bonusAttack} ATK`);
          if (item.bonusDefense > 0) parts.push(`+${item.bonusDefense} DEF`);
          if (item.bonusMaxHp > 0) parts.push(`+${item.bonusMaxHp} HP`);
          if (template?.isRanged && template.range != null)
            parts.push(`range ${template.range}`);
          setTooltip({
            x: e.clientX,
            y: e.clientY,
            visible: true,
            title: item.nameOverride ?? template?.name ?? item.templateId,
            children:
              parts.length > 0 ? <span>{parts.join(" · ")}</span> : <></>,
          });
        }}
        onSlotHoverEnd={() =>
          setTooltip({ x: 0, y: 0, visible: false, children: <></> })
        }
      />
      <BorderPanel
        title="Player"
        width="22rem"
        height="5rem"
        background="#090909"
        bottom="0px"
        right="0"
        zIndex={99}
      >
        <Button onClick={() => setShowInventoryModal(true)}>Inv.</Button>
        <Button onClick={() => setShowPlayerStatsModal((v) => !v)}>
          Stats
        </Button>
      </BorderPanel>

      <Tooltip {...tooltip} zIndex={300} />

      {dialog}

      <PlayerInventoryModal
        visible={showInventoryModal}
        onClose={() => setShowInventoryModal(false)}
        inventory={player.inventory}
        playerStats={{
          attack: player.attack,
          defense: player.defense,
          maxHp: player.maxHp,
        }}
        activeBuffs={player.activeBuffs}
        onInventoryChange={(newInventory: Inventory, delta: StatDelta) => {
          setPlayer({
            ...player,
            inventory: newInventory,
            attack: player.attack + delta.attack,
            defense: player.defense + delta.defense,
            maxHp: Math.max(1, player.maxHp + delta.maxHp),
            hp: Math.min(
              delta.maxHp < 0
                ? player.hp
                : player.hp + Math.max(0, delta.maxHp),
              Math.max(1, player.maxHp + delta.maxHp),
            ),
          });
        }}
        onUseConsumable={(item: InventoryItem) => handleUseConsumable(item)}
      />
      <PlayerStatsPanel
        visible={showPlayerStatsModal}
        onClose={() => setShowPlayerStatsModal(false)}
        inventory={player.inventory}
        attack={player.attack}
        defense={player.defense}
        maxHp={player.maxHp}
        hp={player.hp}
        level={player.level}
        xp={player.xp}
        resistances={player.resistances}
      />

      {showMerchantModal &&
        npcAtPlayerCell &&
        (() => {
          const shopItems = generateShopInventory(
            player.level,
            npcIdToSeed(npcAtPlayerCell.id),
          );
          return (
            <ModalPanel
              title="Merchant Wagon"
              visible={showMerchantModal}
              closeButton
              onClose={() => setShowMerchantModal(false)}
              maxHeight="60vh"
            >
              <div style={{ marginBottom: "0.5rem", color: "#f0d060" }}>
                Gold: {player.gold}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem",
                }}
              >
                {shopItems.map((item: ShopItem) => {
                  const canAfford = player.gold >= item.price;
                  const statParts: string[] = [];
                  if (item.isConsumable) {
                    if (item.healAmount && item.healAmount > 0)
                      statParts.push(`Heals ${item.healAmount} HP`);
                    if (item.buffDuration && item.buffDuration > 0) {
                      const buffParts: string[] = [];
                      if (item.bonusAttack > 0)
                        buffParts.push(`+${item.bonusAttack} ATK`);
                      if (item.bonusDefense > 0)
                        buffParts.push(`+${item.bonusDefense} DEF`);
                      if (item.bonusMaxHp > 0)
                        buffParts.push(`+${item.bonusMaxHp} HP`);
                      if (item.bonusSpeed && item.bonusSpeed > 0)
                        buffParts.push(`+${item.bonusSpeed} SPD`);
                      if (buffParts.length > 0)
                        statParts.push(
                          `${buffParts.join(", ")} (${item.buffDuration} steps)`,
                        );
                    }
                  } else {
                    if (item.bonusAttack > 0)
                      statParts.push(`+${item.bonusAttack} ATK`);
                    if (item.bonusDefense > 0)
                      statParts.push(`+${item.bonusDefense} DEF`);
                    if (item.bonusMaxHp > 0)
                      statParts.push(`+${item.bonusMaxHp} HP`);
                  }
                  return (
                    <div
                      key={item.instanceId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.25rem 0.4rem",
                        border: `1px solid ${canAfford ? "#444" : "#2a2a2a"}`,
                        background: "#111",
                        opacity: canAfford ? 1 : 0.5,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          color: "#ccc",
                          minWidth: "1.2rem",
                        }}
                      >
                        {item.glyph}
                      </span>
                      <span style={{ flex: 1, color: "#ddd" }}>
                        {item.name}
                        <span
                          style={{
                            color: "#888",
                            marginLeft: "0.5rem",
                            fontSize: "0.85em",
                          }}
                        >
                          {statParts.join(", ")}
                        </span>
                      </span>
                      <span
                        style={{
                          color: "#f0d060",
                          minWidth: "3rem",
                          textAlign: "right",
                        }}
                      >
                        {item.price}g
                      </span>
                      <Button
                        maxWidth="5rem"
                        onClick={() => {
                          if (!canAfford) return;
                          const template = getItemTemplate(item.templateId);
                          if (!template) return;
                          const inventoryItem = createInventoryItem(
                            item.instanceId,
                            template,
                            item.bonusAttack,
                            item.bonusDefense,
                            item.bonusMaxHp,
                            item.price,
                          );
                          // Attach consumable metadata
                          if (item.isConsumable) {
                            if (item.healAmount)
                              inventoryItem.healAmount = item.healAmount;
                            if (item.buffDuration)
                              inventoryItem.buffDuration = item.buffDuration;
                            if (item.bonusSpeed)
                              inventoryItem.bonusSpeed = item.bonusSpeed;
                            inventoryItem.isConsumable = true;
                          }
                          const withItem = addItem(
                            player.inventory,
                            inventoryItem,
                          );
                          addLogMessage(`Purchased ${template.name}.`);
                          if (
                            !item.isConsumable &&
                            template.slot &&
                            !withItem.equipped[template.slot]
                          ) {
                            // Auto-equip equipment if slot is free
                            const { newInventory, delta } = equipItem(
                              withItem,
                              item.instanceId,
                            );
                            setPlayer({
                              ...player,
                              gold: player.gold - item.price,
                              inventory: newInventory,
                              attack: player.attack + delta.attack,
                              defense: player.defense + delta.defense,
                              maxHp: player.maxHp + delta.maxHp,
                              hp: Math.min(
                                player.hp + Math.max(0, delta.maxHp),
                                player.maxHp + delta.maxHp,
                              ),
                            });
                          } else {
                            setPlayer({
                              ...player,
                              gold: player.gold - item.price,
                              inventory: withItem,
                            });
                          }
                        }}
                      >
                        Buy
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ModalPanel>
          );
        })()}

      {screen === "overworld" ? (
        <div
          onContextMenu={handleContextMenu}
          onWheel={handleWheel}
          style={{ position: "absolute", inset: 0 }}
        >
          <DungeonRenderView
            bsp={dungeon}
            content={contentLegacy}
            focusX={focusX}
            focusY={focusY}
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
            startFullyExplored="pathways-only"
            blockPositions={[]}
            chestTile={CP437_TILES.chest}
            monsterTile={CP437_TILES.monster}
            secretDoorTile={CP437_TILES.secretDoor}
            hiddenPassageTile={CP437_TILES.hiddenPassage}
            hazardDefaultTile={CP437_TILES.hazard}
            exitTile={CP437_TILES.exit}
            atlasUrl={publicUrl("/textures/codepage437.png")}
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
              if (autoWalk.kind === "active") return;
              const last = lastHoverCellRef.current;
              if (last && last.x === x && last.y === y) return;
              lastHoverCellRef.current = { x, y };

              // Hide any visible tooltip and reset the delay timer on cell change.
              setTooltip((prev) => ({ ...prev, visible: false }));
              if (hoverTimerRef.current !== null) {
                clearTimeout(hoverTimerRef.current);
              }
              hoverTimerRef.current = setTimeout(() => {
                hoverTimerRef.current = null;
                const idx = y * dungeon.width + x;
                const terrain =
                  dungeon.masks.solid[idx] === 255 ? "Trees" : "Pathway";
                const portal = content.meta.dungeonPortals.find(
                  (f) => f.x === x && f.y === y,
                );
                const npcsAtCell = Object.values(
                  turnStateRef.current.actors,
                ).filter(
                  (a): a is NpcActor =>
                    a.kind === "npc" && a.alive && a.x === x && a.y === y,
                );
                const npcLabel = (npc: NpcActor) =>
                  npc.npcType === "merchant_wagon"
                    ? "Merchant Wagon"
                    : npc.npcType;
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
                      <span>{terrain}</span>
                      {portal ? (
                        <span>
                          {portal.name} — {portal.theme} (lvl {portal.level})
                        </span>
                      ) : null}
                      {npcsAtCell.map((npc) => (
                        <span key={npc.id}>{npcLabel(npc)}</span>
                      ))}
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
              if (autoWalk.kind === "active") return;
              playerPreviewPathRef.current = null;
              setTooltip({ x: 0, y: 0, visible: false, children: <></> });
              rebuildPathMaskFromPlans();
            }}
            onCellClick={({ x, y, button }) => {
              if (button !== 0) return false;
              const w = dungeon.width;
              const i = y * w + x;
              const ft = content.masks.featureType[i] | 0;
              const fid = content.masks.featureId[i] | 0;

              if (hoverTimerRef.current !== null) {
                clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
              }
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

              // If an NPC is at the clicked cell, follow them instead of walking to a fixed tile.
              const clickedNpc = Object.values(
                turnStateRef.current.actors,
              ).find(
                (a): a is NpcActor =>
                  a.kind === "npc" && a.alive && a.x === x && a.y === y,
              );

              // Click-to-navigate: start auto-walk toward target.
              const newAutoWalk = startAutoWalkForest({
                from: { x: playerX, y: playerY },
                target: { x, y },
                walkDungeon,
                bsp: dungeon,
                content,
                followActorId: clickedNpc?.id,
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
            npcCharTex={npcCharTex}
            completedPortalIndices={completedPortalIndices}
            _visDataRef={visDataRef}
            shaderVariant="forest"
          >
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
      ) : null}
    </>
  );
}
