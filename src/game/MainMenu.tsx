import { useState, useRef, useEffect, useMemo } from "react";
import * as THREE from "three";

import { useGame, type GameScreen } from "./GameProvider";
import ModalPanel from "./ui/ModalPanel";
import Button from "./ui/Button";
import BorderPanel from "./ui/BorderPanel";
import CharacterPicker from "./ui/CharacterPicker";
import styles from "./styles/MainMenu.module.css";
import DungeonRenderView from "../rendering/DungeonRenderView";
import { publicUrl } from "../utils/publicUrl";
import { FocusLerper } from "./FocusLerper";
import {
  generateForest,
  generateForestContent,
  type ForestContentOutputs,
  type ContentOutputs,
} from "../mazeGen";
import { CP437_TILES } from "../rendering/codepage437Tiles";
const tileDefs = { ...CP437_TILES, chest: 168 };

import {
  createActorCharMaskR8,
  clearActorCharMask,
  stampNpcsToNpcCharMask,
  type ActorCharMask,
} from "../rendering/actorCharMask";
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
import { decideMerchantWagon } from "../turn/npcAI";
import {
  createWorldEffectsState,
  advanceWorldEffects,
} from "../world/worldEffects";
import type { NpcActor } from "../turn/turnTypes";

const MENU_ITEMS: {
  label: string;
  action: "start" | "graveyard" | "settings" | "credits";
}[] = [
  { label: "Start Game", action: "start" },
  { label: "Hall of the Fallen", action: "graveyard" },
  { label: "Credits", action: "credits" },
  { label: "Settings", action: "settings" },
];

const EMPTY_RUNTIME = {} as any;
const BG_SEED = "mainmenu_bg";
const NPC_GLYPH_TILE = 2;
const TICK_INTERVAL = 300;

function buildForest(seed: string) {
  const bsp = generateForest({ seed, width: 64, height: 64 });
  const walkDungeon = {
    ...bsp,
    masks: { ...bsp.masks, solid: new Uint8Array(bsp.width * bsp.height) },
  };
  const content = generateForestContent(bsp, { seed, portalCount: 10 });
  return { bsp, walkDungeon, content };
}

function ForestBackground() {
  const { bsp, walkDungeon, content } = useMemo(() => buildForest(BG_SEED), []);
  const contentLegacy = content as unknown as ContentOutputs;

  const worldEffectsRef = useRef(createWorldEffectsState());

  function buildDeps(_actors: TurnSystemState["actors"]): TurnSystemDeps {
    return {
      dungeon: bsp,
      content: contentLegacy,
      runtime: EMPTY_RUNTIME,
      isWalkable: (x, y) => x >= 0 && y >= 0 && x < bsp.width && y < bsp.height,
      monsterDecide: () => {
        throw new Error("No monsters");
      },
      npcDecide: (state, npcId) =>
        decideMerchantWagon(
          state,
          npcId,
          walkDungeon,
          contentLegacy,
          content.meta.dungeonPortals,
        ),
      computeCost: (actorId, action) =>
        defaultComputeCost(actorId, action, _actors),
      applyAction: defaultApplyAction,
      log: false,
      onTimeAdvanced: ({ prevTime, nextTime }) => {
        const dt = nextTime - prevTime;
        if (dt <= 0) return;
        const r = advanceWorldEffects(worldEffectsRef.current, dt);
        worldEffectsRef.current = r.next;
      },
    };
  }

  const spawn = content.meta.playerSpawn;
  const [turnState, setTurnState] = useState<TurnSystemState>(() => {
    const playerActor = createPlayerActor(spawn.x, spawn.y);
    const wagons = createMerchantWagons(content.meta.dungeonPortals, 3);
    const ts = createTurnSystemState(
      playerActor,
      createMonstersFromResolved(null),
      wagons,
    );
    const deps = buildDeps(ts.actors);
    return tickUntilPlayer(ts, deps);
  });

  // Auto-commit wait on a fixed interval to keep wagons moving
  useEffect(() => {
    const timer = setInterval(() => {
      setTurnState((prev) => {
        if (!prev.awaitingPlayerInput) return prev;
        const deps = buildDeps(prev.actors);
        return commitPlayerAction(prev, deps, { kind: "wait" });
      });
    }, TICK_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Camera: follow the first alive NPC
  const targetFocusRef = useRef({ x: spawn.x, y: spawn.y });
  const animFocusRef = useRef({ x: spawn.x, y: spawn.y });
  const [focusX, setFocusX] = useState(spawn.x);
  const [focusY, setFocusY] = useState(spawn.y);

  useEffect(() => {
    const npc = Object.values(turnState.actors).find(
      (a): a is NpcActor => a.kind === "npc" && a.alive,
    );
    if (npc) {
      targetFocusRef.current = { x: npc.x, y: npc.y };
    }
  }, [turnState.actors]);

  // NPC char overlay texture
  const npcMaskRef = useRef<ActorCharMask | null>(null);
  const [npcCharTex, setNpcCharTex] = useState<THREE.DataTexture | null>(null);

  useEffect(() => {
    if (npcMaskRef.current) npcMaskRef.current.tex.dispose();
    const nm = createActorCharMaskR8(bsp.width, bsp.height, "bg_npc_char_r8");
    npcMaskRef.current = nm;
    setNpcCharTex(nm.tex);
    return () => {
      nm.tex.dispose();
      npcMaskRef.current = null;
    };
  }, [bsp.width, bsp.height]);

  useEffect(() => {
    const nm = npcMaskRef.current;
    if (!nm) return;
    clearActorCharMask(nm.data);
    const npcs = Object.values(turnState.actors).filter(
      (a): a is NpcActor => a.kind === "npc" && a.alive,
    );
    stampNpcsToNpcCharMask({
      data: nm.data,
      W: bsp.width,
      H: bsp.height,
      npcs: npcs.map((npc) => ({ id: npc.id, x: npc.x, y: npc.y })),
      npcTile: NPC_GLYPH_TILE,
    });
    nm.tex.needsUpdate = true;
    setNpcCharTex(nm.tex);
  }, [bsp.width, bsp.height, turnState.actors]);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <DungeonRenderView
        bsp={bsp}
        content={contentLegacy}
        focusX={focusX}
        focusY={focusY}
        onCellFocus={() => {}}
        playerX={focusX}
        playerY={focusY}
        playerTile={0}
        floorTile={tileDefs.floor}
        wallTile={5}
        doorTile={tileDefs.doorClosed}
        keyTile={tileDefs.key}
        leverTile={tileDefs.lever}
        plateTile={tileDefs.plate}
        blockTile={tileDefs.block}
        suppressBlocks
        startFullyExplored="yes"
        blockPositions={[]}
        chestTile={tileDefs.chest}
        monsterTile={tileDefs.monster}
        secretDoorTile={tileDefs.secretDoor}
        hiddenPassageTile={tileDefs.hiddenPassage}
        hazardDefaultTile={tileDefs.hazard}
        exitTile={tileDefs.exit}
        atlasUrl={publicUrl("/textures/codepage437.png")}
        atlasCols={32}
        atlasRows={8}
        hazardTilesByType={{
          1: 48,
          2: 49,
          3: 50,
          4: 51,
        }}
        npcCharTex={npcCharTex}
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
  );
}

function SettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { musicVolume, setMusicVolume, sfxVolume, setSfxVolume } = useGame();
  return (
    <ModalPanel
      visible={visible}
      onClose={onClose}
      title="Settings"
      closeButton
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
          <label style={{ color: "#aaa", fontSize: "13pt" }}>
            Music Volume: {Math.round(musicVolume * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={musicVolume}
            onChange={(e) => setMusicVolume(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#cc4444" }}
          />
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
          <label style={{ color: "#aaa", fontSize: "13pt" }}>
            SFX Volume: {Math.round(sfxVolume * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sfxVolume}
            onChange={(e) => setSfxVolume(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#cc4444" }}
          />
        </div>
      </div>
    </ModalPanel>
  );
}

function CreditsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <ModalPanel
      visible={visible}
      onClose={onClose}
      title="Credits"
      scrollContents
      maxHeight="60vh"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.2rem",
          color: "#ccc",
          fontSize: "12pt",
          lineHeight: "1.6",
        }}
      >
        <section>
          <div
            style={{
              color: "#cc4444",
              marginBottom: "0.3rem",
              fontSize: "13pt",
            }}
          >
            Game Design & Programming
          </div>
          <div>Phil B. Garner</div>
        </section>
        <section>
          <div
            style={{
              color: "#cc4444",
              marginBottom: "0.3rem",
              fontSize: "13pt",
            }}
          >
            Music
          </div>
          <div>JDSherbert — Ambiences Music Pack</div>
          <div style={{ color: "#777", fontSize: "11pt" }}>
            Dark Dark Woods · Bloodrat Sewers · Frost Mountain Aura
          </div>
        </section>
        <section>
          <div
            style={{
              color: "#cc4444",
              marginBottom: "0.3rem",
              fontSize: "13pt",
            }}
          >
            Sound Effects
          </div>
          <div>Free Fantasy SFX Pack By TomMusic</div>
          <div style={{ color: "#777", fontSize: "11pt" }}>
            https://tommusic.itch.io/
          </div>
        </section>
        <section>
          <div
            style={{
              color: "#777",
              fontSize: "11pt",
            }}
          >
            Thank you to my wife for supporting me.
          </div>
        </section>
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <Button onClick={onClose} background="#191919" minWidth="8rem">
            Back
          </Button>
        </div>
      </div>
    </ModalPanel>
  );
}

export default function MainMenu() {
  const { goTo } = useGame();
  const [showPicker, setShowPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const width = "40vw";
  const halfWidth = "20vw";
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "0",
          top: "10vh",
          width: "100vw",
          height: "40vh",
          lineHeight: "96pt",
          zIndex: 999,
          display: "flex",
        }}
      >
        <div
          style={{
            fontSize: "96pt",
            lineHeight: "96pt",
            textAlign: "center",
            background:
              "linear-gradient(180deg, #ff4444 0%, #8b0000 60%, #4a0000 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter:
              "drop-shadow(0 4px 8px rgba(0,0,0,0.8)) drop-shadow(0 2px 3px rgba(0,0,0,0.9))",
          }}
        >
          Darkwild Dungeons
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0 }}>
        <ForestBackground />
        <BorderPanel
          left={`calc(50vw - ${halfWidth})`}
          bottom={`10vh`}
          width={width}
          height={"30vh"}
          background={"#090909c0"}
        >
          <div className={styles.content}>
            {MENU_ITEMS.map((item) => (
              <span
                key={item.label}
                className={styles.menuItem}
                onClick={() => {
                  if (item.action === "start") setShowPicker(true);
                  else if (item.action === "graveyard") goTo("graveyard");
                  else if (item.action === "settings") setShowSettings(true);
                  else if (item.action === "credits") setShowCredits(true);
                }}
              >
                <span className={styles.menuItemText}>{item.label}</span>
              </span>
            ))}
          </div>
        </BorderPanel>
        {showPicker && <CharacterPicker />}
        <SettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
        />
        <CreditsModal
          visible={showCredits}
          onClose={() => setShowCredits(false)}
        />
      </div>
    </>
  );
}
