/**
 * Character creation screen.
 *
 * Step 1 — Name & Equipment: shows the player's randomly generated name,
 * base stats, and a starting shop where they can spend their starting gold.
 *
 * Step 2 — Starting Bonus: presents 3 level-up reward choices (simulating
 * "achieving level 1") before beginning the adventure.
 */

import React, { useState, useMemo } from "react";
import { useGame } from "../GameProvider";
import { DEFAULT_PLAYER, Player } from "../player";
import { generateShopInventory, ShopItem } from "../merchantShop";
import {
  generateLevelUpRewards,
  LevelUpReward,
  resistanceLabel,
} from "../levelUpRewards";
import {
  addItem,
  createInventoryItem,
  equipItem,
  InventoryItem,
} from "../inventory";
import { getItemTemplate } from "../data/itemData";
import Button from "./Button";
import styles from "./styles/ModalPanelBackdrop.module.css";

// ---------------------------------------------------------------------------
// Character name generation
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Aldric",
  "Brenna",
  "Cael",
  "Dara",
  "Edwyn",
  "Fira",
  "Gavyn",
  "Hilda",
  "Idris",
  "Jorna",
  "Kira",
  "Lorn",
  "Mira",
  "Nael",
  "Oryn",
  "Pella",
  "Rael",
  "Sela",
  "Tarn",
  "Ulra",
  "Vara",
  "Wren",
  "Xan",
  "Yra",
  "Zoel",
  "Aerin",
  "Bran",
  "Cress",
  "Dwyn",
  "Eirik",
  "Fyra",
  "Gael",
  "Holt",
];

const SURNAMES = [
  "Ashford",
  "Blackwood",
  "Coldwater",
  "Duskmantle",
  "Emberveil",
  "Frostholm",
  "Grimtide",
  "Hawksong",
  "Ironfist",
  "Jadespire",
  "Keldren",
  "Lorecraft",
  "Moonwhisper",
  "Nighthollow",
  "Oakenshield",
  "Pyreveil",
  "Ravenscar",
  "Stonegate",
  "Thornwall",
  "Underhill",
  "Voidwalker",
  "Wintermere",
  "Yarrowfen",
  "Zephyrstone",
  "Ashbane",
  "Coldmere",
  "Dreadhollow",
  "Fellmark",
  "Grimward",
  "Hollowborn",
];

function hashSeed(seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0;
  h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0;
  return ((h >>> 16) ^ h) >>> 0;
}

function generateCharacterName(seed: number): string {
  const h1 = hashSeed(seed);
  const h2 = hashSeed(seed + 1000);
  return `${FIRST_NAMES[h1 % FIRST_NAMES.length]} ${SURNAMES[h2 % SURNAMES.length]}`;
}

// ---------------------------------------------------------------------------
// Seeded RNG (same LCG as merchantShop.ts)
// ---------------------------------------------------------------------------

function seededRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return (): number => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a ShopItem into an InventoryItem, preserving consumable fields. */
function shopItemToInventoryItem(item: ShopItem): InventoryItem {
  const template = getItemTemplate(item.templateId);
  if (!template) throw new Error(`Unknown template: ${item.templateId}`);
  const base = createInventoryItem(
    item.instanceId,
    template,
    item.bonusAttack,
    item.bonusDefense,
    item.bonusMaxHp,
    item.price,
  );
  return {
    ...base,
    ...(item.isConsumable ? { isConsumable: true } : {}),
    ...(item.healAmount !== undefined ? { healAmount: item.healAmount } : {}),
    ...(item.buffDuration !== undefined
      ? { buffDuration: item.buffDuration }
      : {}),
    ...(item.bonusSpeed !== undefined ? { bonusSpeed: item.bonusSpeed } : {}),
  };
}

/** Apply a level-up reward to a local Player snapshot. */
function applyRewardToPlayer(player: Player, reward: LevelUpReward): Player {
  if (reward.kind === "stat") {
    return {
      ...player,
      maxHp: player.maxHp + reward.hpBonus,
      hp: player.hp + reward.hpBonus,
      attack: player.attack + reward.attackBonus,
      defense: player.defense + reward.defenseBonus,
    };
  }
  if (reward.kind === "resistance") {
    return {
      ...player,
      resistances: [...player.resistances, reward.resistance],
    };
  }
  // item reward
  const invItem = reward.item;
  const withItem = addItem(player.inventory, invItem);
  if (invItem.slot) {
    const { newInventory, delta } = equipItem(withItem, invItem.instanceId);
    return {
      ...player,
      inventory: newInventory,
      attack: player.attack + delta.attack,
      defense: player.defense + delta.defense,
      maxHp: player.maxHp + delta.maxHp,
      hp: player.hp + delta.maxHp,
    };
  }
  return { ...player, inventory: withItem };
}

// ---------------------------------------------------------------------------
// Shop item row
// ---------------------------------------------------------------------------

const RESIST_COLORS: Record<string, string> = {
  slash: "#ff8844",
  blunt: "#aa88ff",
  pierce: "#44ddff",
};

function shopItemDescription(item: ShopItem): string {
  if (item.isConsumable) {
    if (item.healAmount) return `Restores ${item.healAmount} HP`;
    if (item.buffDuration) {
      const parts: string[] = [];
      if (item.bonusAttack) parts.push(`+${item.bonusAttack} ATK`);
      if (item.bonusDefense) parts.push(`+${item.bonusDefense} DEF`);
      if (item.bonusMaxHp) parts.push(`+${item.bonusMaxHp} HP`);
      if (item.bonusSpeed) parts.push(`+${item.bonusSpeed} SPD`);
      return `${parts.join(", ")} for ${item.buffDuration} steps`;
    }
  }
  const parts: string[] = [];
  if (item.bonusAttack) parts.push(`+${item.bonusAttack} ATK`);
  if (item.bonusDefense) parts.push(`+${item.bonusDefense} DEF`);
  if (item.bonusMaxHp) parts.push(`+${item.bonusMaxHp} HP`);
  return parts.join(", ");
}

interface ShopRowProps {
  item: ShopItem;
  gold: number;
  purchased: boolean;
  onBuy: () => void;
}

function ShopRow({ item, gold, purchased, onBuy }: ShopRowProps) {
  const canAfford = gold >= item.price;
  const template = getItemTemplate(item.templateId);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.4rem 0.5rem",
        borderRadius: "3px",
        background: purchased ? "#1a2a1a" : "#181818",
        border: `1px solid ${purchased ? "#335533" : "#333"}`,
      }}
    >
      <span
        style={{
          color: "#ffdd88",
          fontFamily: "monospace",
          fontSize: "1em",
          minWidth: "1.2em",
        }}
      >
        {item.glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: purchased ? "#88cc88" : "#dddddd",
            fontSize: "0.85em",
            fontWeight: purchased ? "normal" : "bold",
          }}
        >
          {item.name}
          {template?.slot ? (
            <span style={{ color: "#777", fontSize: "0.8em" }}>
              {" "}
              [{template.slot}]
            </span>
          ) : null}
          {template?.isRanged ? (
            <span style={{ color: "#88aaff", fontSize: "0.8em" }}> ranged</span>
          ) : null}
        </div>
        <div style={{ color: "#888", fontSize: "0.75em" }}>
          {shopItemDescription(item)}
        </div>
      </div>
      <div
        style={{
          color: "#ffcc44",
          fontSize: "0.85em",
          minWidth: "3.5rem",
          textAlign: "right",
        }}
      >
        {item.price}g
      </div>
      <div style={{ minWidth: "4rem" }}>
        {purchased ? (
          <span style={{ color: "#55aa55", fontSize: "0.8em" }}>Owned</span>
        ) : (
          <Button
            onClick={canAfford ? onBuy : undefined}
            background={canAfford ? "#1a3a1a" : "#1a1a1a"}
          >
            <span
              style={{
                color: canAfford ? "#aaffaa" : "#555",
                fontSize: "0.8em",
              }}
            >
              Buy
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reward card (copied pattern from LevelUpModal)
// ---------------------------------------------------------------------------

interface RewardCardProps {
  reward: LevelUpReward;
  chosen: boolean;
  onChoose: () => void;
}

function RewardCard({ reward, chosen, onChoose }: RewardCardProps) {
  const [hovered, setHovered] = React.useState(false);

  let title = "";
  let body: React.ReactNode = null;
  let accent = "#aaffaa";

  if (reward.kind === "stat") {
    title = reward.label;
    accent = "#88ff88";
    const parts: string[] = [];
    if (reward.hpBonus > 0) parts.push(`+${reward.hpBonus} Max HP`);
    if (reward.attackBonus > 0) parts.push(`+${reward.attackBonus} Attack`);
    if (reward.defenseBonus > 0) parts.push(`+${reward.defenseBonus} Defense`);
    body = parts.map((p) => (
      <div key={p} style={{ color: "#aaffaa", fontSize: "0.85em" }}>
        {p}
      </div>
    ));
  } else if (reward.kind === "resistance") {
    title = resistanceLabel(reward.resistance);
    accent = RESIST_COLORS[reward.resistance] ?? "#aaaaff";
    body = (
      <div style={{ color: "#cccccc", fontSize: "0.8em", lineHeight: 1.4 }}>
        Reduce incoming {reward.resistance} damage by 25%
      </div>
    );
  } else {
    const template = getItemTemplate(reward.item.templateId);
    title = reward.item.nameOverride ?? template?.name ?? "Item";
    accent = "#ffdd88";
    const statParts: string[] = [];
    if (reward.item.bonusAttack > 0)
      statParts.push(`+${reward.item.bonusAttack} ATK`);
    if (reward.item.bonusDefense > 0)
      statParts.push(`+${reward.item.bonusDefense} DEF`);
    if (reward.item.bonusMaxHp > 0)
      statParts.push(`+${reward.item.bonusMaxHp} HP`);
    body = (
      <>
        <div
          style={{
            color: "#aaaaaa",
            fontSize: "0.75em",
            marginBottom: "0.3em",
          }}
        >
          {template?.type ?? ""}
          {template?.slot ? ` · ${template.slot}` : ""}
          {template?.damageType ? ` · ${template.damageType}` : ""}
        </div>
        {statParts.map((p) => (
          <div key={p} style={{ color: "#ffdd88", fontSize: "0.85em" }}>
            {p}
          </div>
        ))}
      </>
    );
  }

  const active = chosen || hovered;
  return (
    <div
      onClick={onChoose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        border: `2px solid ${active ? accent : "#444"}`,
        borderRadius: "4px",
        background: active ? "#222" : "#181818",
        padding: "1rem",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minHeight: "8rem",
        outline: chosen ? `1px solid ${accent}` : "none",
      }}
    >
      <div style={{ color: accent, fontWeight: "bold", fontSize: "0.95em" }}>
        {title}
      </div>
      <div>{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CharacterPicker() {
  const { setPlayer, goTo } = useGame();

  const [nameSeed, setNameSeed] = useState(() =>
    Math.floor(Math.random() * 1_000_000),
  );
  const playerName = useMemo(() => generateCharacterName(nameSeed), [nameSeed]);

  const [step, setStep] = useState<"stats" | "bonuses">("stats");
  const [localPlayer, setLocalPlayer] = useState<Player>({ ...DEFAULT_PLAYER });

  // Shop: regenerate when name (seed) changes so rerolling name also refreshes shop
  const shopSeed = useMemo(() => hashSeed(nameSeed ^ 0xabcdef), [nameSeed]);
  const shopItems = useMemo(
    () => generateShopInventory(1, shopSeed, 6),
    [shopSeed],
  );
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());

  // Level-up rewards for step 2 (generated when advancing)
  const [rewards, setRewards] = useState<LevelUpReward[]>([]);
  const [chosenReward, setChosenReward] = useState<LevelUpReward | null>(null);

  // Reset purchase state when name/shop changes
  function handleRerollName() {
    setNameSeed((s) => s + 1);
    setPurchasedIds(new Set());
    setLocalPlayer({ ...DEFAULT_PLAYER });
  }

  function handleBuy(item: ShopItem) {
    if (purchasedIds.has(item.instanceId) || localPlayer.gold < item.price)
      return;
    const invItem = shopItemToInventoryItem(item);
    setLocalPlayer((prev) => {
      const withItem = addItem(prev.inventory, invItem);
      let newInventory = withItem;
      let delta = { attack: 0, defense: 0, maxHp: 0 };
      if (!item.isConsumable && invItem.slot) {
        const result = equipItem(withItem, invItem.instanceId);
        newInventory = result.newInventory;
        delta = result.delta;
      }
      return {
        ...prev,
        gold: prev.gold - item.price,
        inventory: newInventory,
        attack: prev.attack + delta.attack,
        defense: prev.defense + delta.defense,
        maxHp: prev.maxHp + delta.maxHp,
        hp: prev.hp + delta.maxHp,
      };
    });
    setPurchasedIds((prev) => new Set([...prev, item.instanceId]));
  }

  function handleNext() {
    const rng = seededRng(nameSeed + 777);
    setRewards(generateLevelUpRewards(1, localPlayer.resistances, rng));
    setChosenReward(null);
    setStep("bonuses");
  }

  function handleChooseReward(reward: LevelUpReward) {
    if (chosenReward) return; // already chose
    setChosenReward(reward);
    setLocalPlayer((prev) => applyRewardToPlayer(prev, reward));
  }

  function handleBeginAdventure() {
    if (!chosenReward) return;
    setPlayer({ ...localPlayer, name: playerName });
    goTo("seed-picker");
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#191919",
    border: "2px solid #555",
    borderRadius: "6px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    zIndex: 1000,
  };

  if (step === "stats") {
    return (
      <div className={styles.modalPanelBackdrop}>
        <div style={{ ...panelStyle, width: "min(72vw, 760px)" }}>
          {/* Title */}
          <div
            style={{
              textAlign: "center",
              color: "#ffdd55",
              fontSize: "1.15em",
              fontWeight: "bold",
            }}
          >
            Create Your Character
          </div>

          {/* Main body: two columns */}
          <div
            style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}
          >
            {/* Left: character sheet */}
            <div
              style={{
                flex: "0 0 auto",
                width: "200px",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {/* Name */}
              <div>
                <div
                  style={{
                    color: "#888",
                    fontSize: "0.72em",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.3rem",
                  }}
                >
                  Name
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      color: "#eeeedd",
                      fontSize: "1em",
                      fontWeight: "bold",
                      flex: 1,
                    }}
                  >
                    {playerName}
                  </div>
                  <Button onClick={handleRerollName} background="#222">
                    <span style={{ fontSize: "0.8em", color: "#aaaaaa" }}>
                      ⟳
                    </span>
                  </Button>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #333" }} />

              {/* Stats */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                {[
                  {
                    label: "HP",
                    value: `${localPlayer.hp} / ${localPlayer.maxHp}`,
                    color: "#ff6666",
                  },
                  {
                    label: "Attack",
                    value: localPlayer.attack,
                    color: "#ffaa44",
                  },
                  {
                    label: "Defense",
                    value: localPlayer.defense,
                    color: "#44aaff",
                  },
                  {
                    label: "Gold",
                    value: `${localPlayer.gold}g`,
                    color: "#ffcc44",
                  },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.88em",
                    }}
                  >
                    <span style={{ color: "#888" }}>{label}</span>
                    <span style={{ color }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Resistances (if any bought from shop — unlikely at start but just in case) */}
              {localPlayer.resistances.length > 0 && (
                <div
                  style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}
                >
                  {localPlayer.resistances.map((r) => (
                    <span
                      key={r}
                      style={{
                        fontSize: "0.72em",
                        color: RESIST_COLORS[r] ?? "#aaa",
                        border: `1px solid ${RESIST_COLORS[r] ?? "#aaa"}`,
                        borderRadius: "3px",
                        padding: "1px 4px",
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right: shop */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              <div
                style={{
                  color: "#888",
                  fontSize: "0.72em",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.1rem",
                }}
              >
                Starting Equipment
              </div>
              {shopItems.map((item) => (
                <ShopRow
                  key={item.instanceId}
                  item={item}
                  gold={localPlayer.gold}
                  purchased={purchasedIds.has(item.instanceId)}
                  onBuy={() => handleBuy(item)}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              borderTop: "1px solid #333",
              paddingTop: "0.75rem",
            }}
          >
            <Button onClick={handleNext} background="#1a2a3a">
              <span style={{ color: "#88ccff", fontSize: "0.9em" }}>
                Next →
              </span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step: bonuses
  return (
    <div className={styles.modalPanelBackdrop}>
      <div style={{ ...panelStyle, width: "min(60vw, 660px)" }}>
        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{ color: "#ffdd55", fontSize: "1.2em", fontWeight: "bold" }}
          >
            Choose Your Starting Bonus
          </div>
          <div
            style={{
              color: "#aaaaaa",
              fontSize: "0.85em",
              marginTop: "0.25rem",
            }}
          >
            Every hero begins with a special gift.
          </div>
        </div>

        {/* Reward cards */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {rewards.map((reward, i) => (
            <RewardCard
              key={i}
              reward={reward}
              chosen={chosenReward === reward}
              onChoose={() => handleChooseReward(reward)}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #333",
            paddingTop: "0.75rem",
          }}
        >
          <Button onClick={() => setStep("stats")} background="#222">
            <span style={{ color: "#888", fontSize: "0.85em" }}>← Back</span>
          </Button>
          {chosenReward ? (
            <Button onClick={handleBeginAdventure} background="#1a3a1a">
              <span style={{ color: "#aaffaa", fontSize: "0.9em" }}>
                Generate World
              </span>
            </Button>
          ) : (
            <span style={{ color: "#555", fontSize: "0.85em" }}>
              Select a bonus to continue
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
