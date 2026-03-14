// RenderTheme is intentionally “uniform-ready”:
// - colors are hex strings (easy to serialize + author)
// - renderer converts to THREE.Color / vec3 as needed

import type { DungeonTheme, RenderThemeUniforms, Vec4 } from "../theme/themeTypes";

export type RenderTheme = {
  id: string;
  label: string;

  // Base tileset tint roles (these map directly to shader uniforms)
  colors: {
    floor: string; // base floor tint
    wallEdge: string; // exterior wall edges tint
    player: string; // tintTex=1
    interactable: string; // tintTex=2 (items / levers / doors / keys / chests)
    hazard: string; // tintTex=3 (danger)

    // Debug overlays / affordances (future: optional extra passes or composite)
    focus: string; // focus cell marker
    selection: string; // selected cell highlight
    debugOverlay: string; // general purpose overlay tint
  };

  // Multipliers let you tune “how strong” each tint is without changing hue.
  // If your shader doesn’t support this yet, keep them at 1 and ignore.
  strength: {
    floor: number;
    wallEdge: number;
    player: number;
    interactable: number;
    hazard: number;
    focus: number;
    selection: number;
    debugOverlay: number;
  };

  // Optional: semantic guidance for UI widgets / legend
  legend: {
    tintChannelLabels: Record<0 | 1 | 2 | 3, string>;
  };
};

export const THEME_DANGER_FORWARD_DEBUG: RenderTheme = {
  id: "danger_forward_debug",
  label: "Danger-Forward Debug",

  colors: {
    floor: "#2B2F36", // dark neutral
    wallEdge: "#A7B0BE", // bright edges for structure readability
    player: "#00B7FF", // electric cyan (stands apart from red danger)
    interactable: "#FFD166", // loud amber (but still below hazard)
    hazard: "#FF0033", // alert red (the point of this theme)

    focus: "#00FFB2", // neon mint (camera target clarity)
    selection: "#FFE600", // bright yellow selection
    debugOverlay: "#FFFFFF", // pure overlay for max contrast
  },

  strength: {
    floor: 0.55, // intentionally muted
    wallEdge: 1.15, // edges readable even in dark base
    player: 1.15,
    interactable: 1.05,
    hazard: 1.35, // hazard dominates

    focus: 1.25,
    selection: 1.2,
    debugOverlay: 0.9,
  },

  legend: {
    tintChannelLabels: {
      0: "Base (Muted)",
      1: "Player (Cyan)",
      2: "Interactable (Amber)",
      3: "HAZARD (Alert Red)",
    },
  },
};

export const THEME_DEFAULT: RenderTheme = {
  id: "default",
  label: "Default (CP437 Neutral)",

  colors: {
    floor: "#C9C7BE", // warm light grey
    wallEdge: "#4A4F58", // slate
    player: "#3A7DFF", // clear blue
    interactable: "#E5C07B", // warm amber
    hazard: "#E06C75", // soft danger red

    focus: "#61AFEF", // cyan-blue focus marker
    selection: "#98C379", // green selection
    debugOverlay: "#ABB2BF", // neutral overlay
  },

  strength: {
    floor: 1.0,
    wallEdge: 1.0,
    player: 1.0,
    interactable: 1.0,
    hazard: 1.0,

    focus: 1.0,
    selection: 1.0,
    debugOverlay: 0.9,
  },

  legend: {
    tintChannelLabels: {
      0: "Base",
      1: "Player",
      2: "Interactable",
      3: "Hazard",
    },
  },
};

// ---------------------------------------------------------------------------
// Hex -> Vec4 conversion (no THREE dependency)
// ---------------------------------------------------------------------------

function hexToVec4(hex: string, a = 1): Vec4 {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return [r, g, b, a];
}

function applyStrength(rgba: Vec4, strength: number): Vec4 {
  const s = Math.max(0, Math.min(1.5, strength));
  return [
    1 + (rgba[0] - 1) * s,
    1 + (rgba[1] - 1) * s,
    1 + (rgba[2] - 1) * s,
    rgba[3],
  ];
}

// ---------------------------------------------------------------------------
// RenderTheme -> shader uniforms
// ---------------------------------------------------------------------------

export function toShaderUniforms(theme: RenderTheme): RenderThemeUniforms {
  return {
    uFloorColor: applyStrength(hexToVec4(theme.colors.floor), theme.strength.floor),
    uWallColor: applyStrength(hexToVec4(theme.colors.wallEdge), theme.strength.wallEdge),
    uPlayerColor: applyStrength(hexToVec4(theme.colors.player), theme.strength.player),
    uItemColor: applyStrength(hexToVec4(theme.colors.interactable), theme.strength.interactable),
    uHazardColor: applyStrength(hexToVec4(theme.colors.hazard), theme.strength.hazard),
    // RenderTheme lacks enemy; default to red
    uEnemyColor: [1.0, 0.35, 0.35, 1.0],
  };
}

// ---------------------------------------------------------------------------
// DungeonTheme -> RenderTheme bridge
// ---------------------------------------------------------------------------

export function dungeonThemeToRenderTheme(theme: DungeonTheme): RenderTheme {
  return {
    id: theme.id,
    label: theme.label,
    colors: {
      floor: theme.render.colors.floor,
      wallEdge: theme.render.colors.wallEdge,
      player: theme.render.colors.player,
      interactable: theme.render.colors.interactable,
      hazard: theme.render.colors.hazard,
      focus: "#61AFEF",
      selection: "#98C379",
      debugOverlay: "#ABB2BF",
    },
    strength: {
      floor: theme.render.strength.floor,
      wallEdge: theme.render.strength.wallEdge,
      player: theme.render.strength.player,
      interactable: theme.render.strength.interactable,
      hazard: theme.render.strength.hazard,
      focus: 1.0,
      selection: 1.0,
      debugOverlay: 0.9,
    },
    legend: {
      tintChannelLabels: {
        0: "Base",
        1: "Player",
        2: "Interactable",
        3: "Hazard",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// DungeonTheme -> shader uniforms (convenience: includes enemy color)
// ---------------------------------------------------------------------------

export function dungeonThemeToShaderUniforms(theme: DungeonTheme): RenderThemeUniforms {
  return {
    uFloorColor: applyStrength(hexToVec4(theme.render.colors.floor), theme.render.strength.floor),
    uWallColor: applyStrength(hexToVec4(theme.render.colors.wallEdge), theme.render.strength.wallEdge),
    uPlayerColor: applyStrength(hexToVec4(theme.render.colors.player), theme.render.strength.player),
    uItemColor: applyStrength(hexToVec4(theme.render.colors.interactable), theme.render.strength.interactable),
    uHazardColor: applyStrength(hexToVec4(theme.render.colors.hazard), theme.render.strength.hazard),
    uEnemyColor: applyStrength(hexToVec4(theme.render.colors.enemy), theme.render.strength.enemy),
  };
}
