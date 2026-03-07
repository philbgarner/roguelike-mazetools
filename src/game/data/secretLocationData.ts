/**
 * Secret location templates for the overworld forest.
 *
 * Each template defines a hidden discovery location that the player can
 * stumble upon inside the tree-covered areas. Choices are presented with
 * vague labels — the outcome is only revealed after selection.
 */

import type { DamageType } from "./itemData";

// ---------------------------------------------------------------------------
// Outcome types
// ---------------------------------------------------------------------------

export type SecretOutcome =
  | { kind: "gold"; amount: number }
  | { kind: "xp"; amount: number }
  | {
      kind: "stat";
      hpBonus: number;
      attackBonus: number;
      defenseBonus: number;
      label: string;
    }
  | { kind: "resistance"; resistance: DamageType }
  | {
      kind: "item";
      templateId: string;
      attackBonus: number;
      defenseBonus: number;
      hpBonus: number;
      value: number;
      nameOverride?: string;
    }
  | { kind: "nothing"; message: string }
  | { kind: "curse"; hpLoss: number; message: string };

export type SecretChoice = {
  /** Shown before the player chooses — intentionally vague. */
  label: string;
  /** Shown after the player chooses — describes what happened. */
  revealText: string;
  outcome: SecretOutcome;
};

export type SecretLocationTemplate = {
  name: string;
  description: string;
  choices: [SecretChoice, SecretChoice, SecretChoice];
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const SECRET_LOCATION_TEMPLATES: SecretLocationTemplate[] = [
  {
    name: "The Hermit's Hollow",
    description:
      "A damp hollow beneath exposed roots. Personal effects have been carefully arranged here, as though the inhabitant plans to return.",
    choices: [
      {
        label: "Rummage through the provisions",
        revealText: "Dried food and a small cache of coin.",
        outcome: { kind: "gold", amount: 20 },
      },
      {
        label: "Read the worn pocket journal",
        revealText:
          "Careful observations of the forest — you absorb their hard-won wisdom.",
        outcome: { kind: "xp", amount: 30 },
      },
      {
        label: "Pocket the talisman on the nail",
        revealText: "A carved bone charm, crudely but deliberately made.",
        outcome: {
          kind: "item",
          templateId: "charm",
          attackBonus: 0,
          defenseBonus: 1,
          hpBonus: 4,
          value: 30,
          nameOverride: "Hermit's Charm",
        },
      },
    ],
  },
  {
    name: "Moss-Covered Altar",
    description:
      "A flat stone ringed with offerings long since rotted away. A faint warmth rises from the carved basin at its centre.",
    choices: [
      {
        label: "Leave something of value",
        revealText: "Something invisible takes what was offered — and takes more.",
        outcome: {
          kind: "curse",
          hpLoss: 8,
          message: "A cold sensation drains through you.",
        },
      },
      {
        label: "Speak the inscription aloud",
        revealText: "The words taste like iron. Your skin thickens.",
        outcome: { kind: "resistance", resistance: "slash" },
      },
      {
        label: "Cup your hands in the basin",
        revealText: "Warm water fills your palms. You feel fortified.",
        outcome: {
          kind: "stat",
          hpBonus: 6,
          attackBonus: 0,
          defenseBonus: 1,
          label: "Vitality and resolve.",
        },
      },
    ],
  },
  {
    name: "Fallen Watchtower",
    description:
      "Two stories remain standing. The staircase is treacherous. A chest wedged under debris has not been touched in decades.",
    choices: [
      {
        label: "Search the lower floor",
        revealText: "Dusty coinage scattered among the rubble.",
        outcome: { kind: "gold", amount: 18 },
      },
      {
        label: "Climb to the broken parapet",
        revealText: "The view from above clarifies things you hadn't noticed.",
        outcome: { kind: "xp", amount: 50 },
      },
      {
        label: "Pry open the chest",
        revealText:
          "A serviceable blade, still oiled after all this time.",
        outcome: {
          kind: "item",
          templateId: "sword",
          attackBonus: 2,
          defenseBonus: 0,
          hpBonus: 0,
          value: 40,
          nameOverride: "Old Blade +2",
        },
      },
    ],
  },
  {
    name: "The Whispering Stone",
    description:
      "A monolith carved with symbols that seem to shift when you look away. A pressure builds behind your eyes as you approach.",
    choices: [
      {
        label: "Press your palm to the warm face",
        revealText: "Your grip tightens. Your strikes feel more certain.",
        outcome: {
          kind: "stat",
          hpBonus: 0,
          attackBonus: 3,
          defenseBonus: 0,
          label: "Your grip strengthens.",
        },
      },
      {
        label: "Stand in silence and listen",
        revealText: "You find yourself anticipating blows before they land.",
        outcome: {
          kind: "stat",
          hpBonus: 0,
          attackBonus: 0,
          defenseBonus: 3,
          label: "Your footing steadies.",
        },
      },
      {
        label: "Trace the spiral at the base",
        revealText: "Warmth radiates from the stone through your fingertips.",
        outcome: {
          kind: "stat",
          hpBonus: 10,
          attackBonus: 0,
          defenseBonus: 0,
          label: "Vitality surges through you.",
        },
      },
    ],
  },
  {
    name: "The Sunken Garden",
    description:
      "What was once tended ground is now overtaken. Strange herbs grow here, far from any sunlight.",
    choices: [
      {
        label: "Harvest the pale flowers",
        revealText: "A healing draught, mixed from what grows here.",
        outcome: {
          kind: "item",
          templateId: "heal_potion",
          attackBonus: 0,
          defenseBonus: 0,
          hpBonus: 0,
          value: 15,
        },
      },
      {
        label: "Dig at the roots of the old oak",
        revealText: "A small tin, buried deliberately.",
        outcome: { kind: "gold", amount: 28 },
      },
      {
        label: "Eat the dark berries",
        revealText: "Bitter and strange. Knowledge surfaces, unbidden.",
        outcome: { kind: "xp", amount: 45 },
      },
    ],
  },
  {
    name: "A Soldier's Cache",
    description:
      "Loose stones in a crumbled wall conceal a hollow space. Military-issue equipment, abandoned during some forgotten campaign.",
    choices: [
      {
        label: "Take the weapons bundle",
        revealText:
          "A heavy axe, the shaft still wrapped in serviceable leather.",
        outcome: {
          kind: "item",
          templateId: "axe",
          attackBonus: 2,
          defenseBonus: 0,
          hpBonus: 0,
          value: 40,
          nameOverride: "Campaign Axe +2",
        },
      },
      {
        label: "Claim the field rations",
        revealText: "Dried meat and hardtack. More sustaining than it looks.",
        outcome: {
          kind: "stat",
          hpBonus: 8,
          attackBonus: 0,
          defenseBonus: 0,
          label: "You feel well-fed and rested.",
        },
      },
      {
        label: "Study the maps inside",
        revealText: "The routes marked here reveal much about this region.",
        outcome: { kind: "xp", amount: 35 },
      },
    ],
  },
];

export const SECRET_TEMPLATE_COUNT = SECRET_LOCATION_TEMPLATES.length;

// ---------------------------------------------------------------------------
// Level scaling
// ---------------------------------------------------------------------------

/** Scale factor for a given player level. Level 1 → 1.0, level 4 → 2.0, level 9 → 3.0. */
function scaleFactor(level: number): number {
  return Math.sqrt(Math.max(1, level));
}

function scaleOutcome(outcome: SecretOutcome, level: number): SecretOutcome {
  const f = scaleFactor(level);
  switch (outcome.kind) {
    case "gold":
      return { ...outcome, amount: Math.round(outcome.amount * f) };
    case "xp":
      return { ...outcome, amount: Math.round(outcome.amount * f) };
    case "stat":
      return {
        ...outcome,
        hpBonus: outcome.hpBonus > 0 ? Math.max(1, Math.round(outcome.hpBonus * f)) : 0,
        attackBonus: outcome.attackBonus > 0 ? Math.max(1, Math.round(outcome.attackBonus * f)) : 0,
        defenseBonus: outcome.defenseBonus > 0 ? Math.max(1, Math.round(outcome.defenseBonus * f)) : 0,
      };
    case "curse":
      return { ...outcome, hpLoss: Math.max(1, Math.round(outcome.hpLoss * f)) };
    case "item":
      return {
        ...outcome,
        attackBonus: outcome.attackBonus > 0 ? Math.max(1, Math.round(outcome.attackBonus * f)) : 0,
        defenseBonus: outcome.defenseBonus > 0 ? Math.max(1, Math.round(outcome.defenseBonus * f)) : 0,
        hpBonus: outcome.hpBonus > 0 ? Math.max(1, Math.round(outcome.hpBonus * f)) : 0,
        value: Math.round(outcome.value * f),
      };
    case "resistance":
    case "nothing":
      return outcome;
  }
}

function scaleChoice(choice: SecretChoice, level: number): SecretChoice {
  return { ...choice, outcome: scaleOutcome(choice.outcome, level) };
}

/**
 * Returns a copy of the template with all numeric outcome values scaled for
 * the given player level (level 1 = unscaled, level 4 ≈ 2×, level 9 ≈ 3×).
 */
export function scaleSecretTemplate(
  template: SecretLocationTemplate,
  playerLevel: number,
): SecretLocationTemplate {
  return {
    ...template,
    choices: [
      scaleChoice(template.choices[0], playerLevel),
      scaleChoice(template.choices[1], playerLevel),
      scaleChoice(template.choices[2], playerLevel),
    ],
  };
}
