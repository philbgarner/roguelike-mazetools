/**
 * Authorial control preset registries.
 *
 * Follows the same pattern as themeRegistry.ts:
 * - In-memory Map per control type
 * - register / get / getAllIds functions
 * - Default presets auto-registered on first import
 *
 * Games can call the register functions to add or override presets.
 * Runtime does NOT import wizard UI.
 */

import type {
  ContentBudget,
  DifficultyBand,
  PacingTargets,
} from "../configTypes";

// ---------------------------------------------------------------------------
// Generic preset wrapper
// ---------------------------------------------------------------------------

export type AuthorialPreset<T> = {
  id: string;
  label: string;
  value: T;
};

// ---------------------------------------------------------------------------
// Difficulty Band registry
// ---------------------------------------------------------------------------

const bandRegistry = new Map<string, AuthorialPreset<DifficultyBand>>();

export function registerBands(
  presets: AuthorialPreset<DifficultyBand>[],
): void {
  for (const p of presets) bandRegistry.set(p.id, p);
}

export function getBand(id: string): DifficultyBand {
  const p = bandRegistry.get(id);
  if (!p) {
    throw new Error(
      `Difficulty band not found: "${id}". Registered: [${getAllBandIds().join(", ")}]`,
    );
  }
  return p.value;
}

export function getAllBandIds(): string[] {
  return Array.from(bandRegistry.keys());
}

// ---------------------------------------------------------------------------
// Content Budget registry
// ---------------------------------------------------------------------------

const budgetRegistry = new Map<string, AuthorialPreset<ContentBudget>>();

export function registerBudgets(
  presets: AuthorialPreset<ContentBudget>[],
): void {
  for (const p of presets) budgetRegistry.set(p.id, p);
}

export function getBudget(id: string): ContentBudget {
  const p = budgetRegistry.get(id);
  if (!p) {
    throw new Error(
      `Content budget not found: "${id}". Registered: [${getAllBudgetIds().join(", ")}]`,
    );
  }
  return p.value;
}

export function getAllBudgetIds(): string[] {
  return Array.from(budgetRegistry.keys());
}

// ---------------------------------------------------------------------------
// Pacing Targets registry
// ---------------------------------------------------------------------------

const pacingRegistry = new Map<string, AuthorialPreset<PacingTargets>>();

export function registerPacingPresets(
  presets: AuthorialPreset<PacingTargets>[],
): void {
  for (const p of presets) pacingRegistry.set(p.id, p);
}

export function getPacingPreset(id: string): PacingTargets {
  const p = pacingRegistry.get(id);
  if (!p) {
    throw new Error(
      `Pacing preset not found: "${id}". Registered: [${getAllPacingIds().join(", ")}]`,
    );
  }
  return p.value;
}

export function getAllPacingIds(): string[] {
  return Array.from(pacingRegistry.keys());
}

// ---------------------------------------------------------------------------
// Default presets
// ---------------------------------------------------------------------------

export const DEFAULT_BANDS: AuthorialPreset<DifficultyBand>[] = [
  {
    id: "easy",
    label: "Easy",
    value: {
      totalRooms: { min: 4, max: 8 },
      criticalPathLength: { min: 2, max: 5 },
      maxGateDepth: { max: 1 },
      puzzleDensity: { max: 0.8 },
    },
  },
  {
    id: "medium",
    label: "Medium",
    value: {
      totalRooms: { min: 6, max: 14 },
      criticalPathLength: { min: 3, max: 10 },
      maxGateDepth: { max: 3 },
      puzzleDensity: { min: 0.3, max: 1.5 },
    },
  },
  {
    id: "hard",
    label: "Hard",
    value: {
      totalRooms: { min: 10 },
      criticalPathLength: { min: 6 },
      maxGateDepth: { min: 2 },
      puzzleDensity: { min: 0.5 },
    },
  },
];

export const DEFAULT_BUDGETS: AuthorialPreset<ContentBudget>[] = [
  {
    id: "minimal",
    label: "Minimal",
    value: {
      doors: { max: 3 },
      levers: { max: 2 },
      plates: { max: 1 },
      chests: { max: 2 },
      monsters: { max: 3 },
      hazards: { max: 2 },
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    value: {
      doors: { min: 1, max: 6 },
      levers: { min: 1, max: 4 },
      chests: { min: 1, max: 5 },
      monsters: { min: 1, max: 8 },
      hazards: { max: 4 },
    },
  },
  {
    id: "rich",
    label: "Rich",
    value: {
      doors: { min: 3 },
      levers: { min: 2 },
      chests: { min: 2 },
      monsters: { min: 3 },
      secrets: { min: 1 },
    },
  },
];

export const DEFAULT_PACING: AuthorialPreset<PacingTargets>[] = [
  {
    id: "relaxed",
    label: "Relaxed",
    value: {
      firstGateDistance: { min: 3 },
      contentFreeIntro: { min: 2 },
      rampProfile: { target: "back-loaded" },
    },
  },
  {
    id: "standard",
    label: "Standard",
    value: {
      firstGateDistance: { min: 1, max: 5 },
      rewardAfterGate: { enabled: true, maxDistance: 3 },
      contentFreeIntro: { min: 1 },
      rampProfile: { target: "linear" },
    },
  },
  {
    id: "intense",
    label: "Intense",
    value: {
      firstGateDistance: { max: 2 },
      rewardAfterGate: { enabled: true, maxDistance: 2 },
      shortcutPresent: { required: true },
      rampProfile: { target: "front-loaded" },
    },
  },
];

// Auto-register defaults
registerBands(DEFAULT_BANDS);
registerBudgets(DEFAULT_BUDGETS);
registerPacingPresets(DEFAULT_PACING);
