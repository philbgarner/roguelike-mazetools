// src/rendering/tileShader.ts
export const tileVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// src/rendering/tileShader.ts
export const tileFrag = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uHazardOmega;
  uniform float uInteractOmega;
  uniform float uAoStrength;
  uniform vec2  uLightDir;

  uniform sampler2D uSolid;
  uniform sampler2D uChar;
  uniform sampler2D uActorChar;
  uniform sampler2D uTint;
  uniform sampler2D uAtlas;

  uniform vec2 uGridSize;
  uniform vec2 uAtlasGrid;
  uniform float uWallTile;
  uniform float uFloorTile;
  uniform float uDoorTile;

  uniform float uFlipAtlasY;
  uniform float uFlipGridX;
  uniform float uFlipGridY;

  uniform vec4 uFloorColor;
  uniform vec4 uWallColor;
  uniform vec4 uPlayerColor;
  uniform vec4 uItemColor;
  uniform vec4 uHazardColor;
  uniform vec4 uEnemyColor;

  uniform float uEnemyBreathOmega;
  uniform float uEnemyBreathAmp;
  uniform float uMonsterTile;

  // R1.5 affordances (inspection-only)
  uniform vec2  uHoverCell;
  uniform float uHoverEnabled;
  uniform float uHoverStrength;

  // R1.5 selection affordance (inspection-only)
  uniform vec2  uSelectedCell;
  uniform float uSelectedEnabled;
  uniform float uSelectedStrength;

  // M7 visibility + explored
  uniform sampler2D uVisExplored;
  uniform float uExploredDim;
  uniform float uVisFgBoost;
  uniform float uVisBgBoost;

  // M8 path mask
  uniform sampler2D uPathMask;
  uniform float uPathStrength;
  uniform float uPathAnimSpeed;

  varying vec2 vUv;

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  float tileIs(float tile, float target) {
    return 1.0 - step(0.5, abs(tile - target));
  }

  float sampleR8(sampler2D tex, vec2 uv) {
    return texture2D(tex, uv).r;
  }

  float isWallAtCell(vec2 cell) {
    vec2 c = clamp(cell, vec2(0.0), uGridSize - vec2(1.0));
    vec2 uv = (c + vec2(0.5)) / uGridSize;
    return step(0.5, sampleR8(uSolid, uv));
  }

  vec2 breatheWarp(vec2 local, float t, float amp) {
    vec2 p = local - vec2(0.5);
    float sY = 1.0 + amp * t;
    float sX = 1.0 - amp * 0.6 * t;
    vec2 q = vec2(p.x * sX, p.y * sY) + vec2(0.5);
    return clamp(q, vec2(0.001), vec2(0.999));
  }

  float atlasAlphaAtLocal(
    vec2 localCoord,
    float tx,
    float ty,
    float cols,
    float rows
  ) {
    vec2 uv = (vec2(tx, ty) + clamp(localCoord, vec2(0.001), vec2(0.999)))
              / vec2(cols, rows);
    if (uFlipAtlasY > 0.5) uv.y = 1.0 - uv.y;
    return texture2D(uAtlas, uv).a;
  }

  // ------------------------------------------------------------
  // Main
  // ------------------------------------------------------------

  void main() {
    vec2 uvGrid = vUv;
    if (uFlipGridX > 0.5) uvGrid.x = 1.0 - uvGrid.x;
    if (uFlipGridY > 0.5) uvGrid.y = 1.0 - uvGrid.y;

    vec2 gridUv = uvGrid * uGridSize;
    vec2 cell   = floor(gridUv);
    vec2 local  = fract(gridUv);
    vec2 texUv  = (cell + vec2(0.5)) / uGridSize;

    float curWall = step(0.5, sampleR8(uSolid, texUv));

    float wL = isWallAtCell(cell + vec2(-1.0, 0.0));
    float wR = isWallAtCell(cell + vec2( 1.0, 0.0));
    float wU = isWallAtCell(cell + vec2( 0.0,-1.0));
    float wD = isWallAtCell(cell + vec2( 0.0, 1.0));

    float wUL = isWallAtCell(cell + vec2(-1.0,-1.0));
    float wUR = isWallAtCell(cell + vec2( 1.0,-1.0));
    float wDL = isWallAtCell(cell + vec2(-1.0, 1.0));
    float wDR = isWallAtCell(cell + vec2( 1.0, 1.0));

    float allWall = wL*wR*wU*wD*wUL*wUR*wDL*wDR;
    float isEdgeWall = curWall * (1.0 - allWall);

    float chN = sampleR8(uChar, texUv);
    float ch  = floor(chN * 255.0 + 0.5);

    // Actor overlay: runtime-stamped monsters override the static char mask
    float aChN = sampleR8(uActorChar, texUv);
    float aCh  = floor(aChN * 255.0 + 0.5);
    if (aCh > 0.5) ch = aCh;

    float hasChar = step(0.5, ch);

    if (curWall > 0.5 && isEdgeWall < 0.5 && hasChar < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // ------------------------------------------------------------
    // M7 FOG OF WAR — sample vis/explored texture
    // ------------------------------------------------------------
    vec4 visData  = texture2D(uVisExplored, texUv);
    float explored = step(0.5, visData.g);
    float vis      = visData.a;           // 0..1 (already normalised by GL)

    vec4 pathData = texture2D(uPathMask, texUv);

    if (explored < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float dim = mix(uExploredDim, 1.0, vis);

    float baseTile = mix(uFloorTile, uWallTile, isEdgeWall);

    float tintId = floor(sampleR8(uTint, texUv) * 255.0 + 0.5);

    float cols = uAtlasGrid.x;
    float rows = uAtlasGrid.y;

    // --- Base tile (floor or wall) ---
    float btx = mod(baseTile, cols);
    float bty = floor(baseTile / cols);
    vec2 baseAtlasUv = (vec2(btx, bty) + local) / vec2(cols, rows);
    if (uFlipAtlasY > 0.5) baseAtlasUv.y = 1.0 - baseAtlasUv.y;
    vec4 baseC = texture2D(uAtlas, baseAtlasUv);

    vec3 bg = (isEdgeWall > 0.5) ? uWallColor.rgb : vec3(0.0);
    float baseInkA = smoothstep(0.05, 0.20, baseC.a);
    vec3 baseInk = baseC.rgb;

    // --- M8 PATH GRADIENT — sampled before entity glyph (pathData already sampled above) ---
    float pathStep = pathData.a * 255.0; // 0 = no path; 1..255 = step index

    // Apply path overlay only on explored, walkable (non-wall) cells that have a path
    // pathData.a encodes step index / 255; step 1 = 1/255 ≈ 0.004, so threshold must be < 1/255
    float onPath = step(0.5 / 255.0, pathData.a) * explored * (1.0 - curWall);

    // Infer direction-of-travel from stepped alpha neighbors (8-directional)
    vec2 oneCell = vec2(1.0) / uGridSize;
    float aN  = texture2D(uPathMask, texUv + vec2( 0.0,        -oneCell.y)).a * 255.0;
    float aS  = texture2D(uPathMask, texUv + vec2( 0.0,         oneCell.y)).a * 255.0;
    float aE  = texture2D(uPathMask, texUv + vec2( oneCell.x,   0.0      )).a * 255.0;
    float aW  = texture2D(uPathMask, texUv + vec2(-oneCell.x,   0.0      )).a * 255.0;
    float aNE = texture2D(uPathMask, texUv + vec2( oneCell.x,  -oneCell.y)).a * 255.0;
    float aNW = texture2D(uPathMask, texUv + vec2(-oneCell.x,  -oneCell.y)).a * 255.0;
    float aSE = texture2D(uPathMask, texUv + vec2( oneCell.x,   oneCell.y)).a * 255.0;
    float aSW = texture2D(uPathMask, texUv + vec2(-oneCell.x,   oneCell.y)).a * 255.0;

    // Direction toward goal = neighbor with step = pathStep + 1
    vec2 towardGoal = vec2(0.0);
    float target = pathStep + 1.0;
    float diag = 0.7071; // 1/sqrt(2) — pre-normalised diagonal unit vectors
    if (abs(aN  - target) < 0.5) towardGoal += vec2( 0.0,  -1.0);
    if (abs(aS  - target) < 0.5) towardGoal += vec2( 0.0,   1.0);
    if (abs(aE  - target) < 0.5) towardGoal += vec2( 1.0,   0.0);
    if (abs(aW  - target) < 0.5) towardGoal += vec2(-1.0,   0.0);
    if (abs(aNE - target) < 0.5) towardGoal += vec2( diag, -diag);
    if (abs(aNW - target) < 0.5) towardGoal += vec2(-diag, -diag);
    if (abs(aSE - target) < 0.5) towardGoal += vec2( diag,  diag);
    if (abs(aSW - target) < 0.5) towardGoal += vec2(-diag,  diag);
    float tLen = length(towardGoal);
    vec2 travelDir = (tLen > 0.001) ? towardGoal / tLen : vec2(1.0, 0.0);

    // Terminus cell: no neighbor has pathStep+1, so tLen == 0
    float isTerminus = step(tLen, 0.001);

    // Animated scrolling gradient along direction of travel (non-terminus only)
    float proj = dot(local - vec2(0.5), travelDir);
    float phase = fract(proj * 1.5 - uTime * uPathAnimSpeed);
    float gradient = smoothstep(0.0, 0.4, phase) * (1.0 - smoothstep(0.6, 1.0, phase));

    // Step banding for "marching" look
    float band = fract(pathStep / 8.0);
    float animIntensity = mix(gradient, band, 0.3);
    // Terminus: flat full-strength colour; other cells: animated gradient
    float pathIntensity = mix(animIntensity, 1.0, isTerminus) * uPathStrength * onPath;

    // Path color: pick based on channel (R=enemy, G=npc, B=player)
    // Blend toward the dominant channel's color
    vec3 enemyPath  = vec3(1.0, 0.3, 0.3);
    vec3 npcPath    = vec3(0.3, 1.0, 0.5);
    vec3 playerPath = vec3(0.3, 0.6, 1.0);
    float hasEnemy  = step(0.5, pathData.r);
    float hasNpc    = step(0.5, pathData.g);
    float hasPlayer = step(0.5, pathData.b);
    vec3 pathColor = enemyPath * hasEnemy + npcPath * hasNpc + playerPath * hasPlayer;
    float totalKinds = hasEnemy + hasNpc + hasPlayer;
    pathColor = (totalKinds > 0.0) ? pathColor / totalKinds : playerPath;

    // --- Entity glyph (if present) ---
    float isMonster = tileIs(ch, uMonsterTile);
    vec2 local2 = local;

    if (isMonster > 0.5) {
      float breath = sin(uTime * uEnemyBreathOmega);
      local2 = breatheWarp(local, breath, uEnemyBreathAmp);
    }

    float tx = mod(ch, cols);
    float ty = floor(ch / cols);
    vec2 atlasUv = (vec2(tx, ty) + local2) / vec2(cols, rows);
    if (uFlipAtlasY > 0.5) atlasUv.y = 1.0 - atlasUv.y;
    vec4 charC = texture2D(uAtlas, atlasUv);
    float charInkA = smoothstep(0.05, 0.20, charC.a) * hasChar;
    vec3 charInk = charC.rgb;

    // Use entity sample when present, else base
    vec4 c = (hasChar > 0.5) ? charC : baseC;
    float inkA = (hasChar > 0.5) ? charInkA : baseInkA;
    vec3 ink = (hasChar > 0.5) ? charInk : baseInk;

    // -------------------------
    // Tint selection
    // -------------------------

    vec4 tint = mix(uFloorColor, uWallColor, isEdgeWall);

    if (tintId > 0.5 && tintId < 1.5) {
      float t = 0.5 + 0.5 * sin(uTime * 4.0);
      tint.rgb = mix(uPlayerColor.rgb, vec3(1.0), 0.15 + 0.20 * t);
    } else if (tintId > 1.5 && tintId < 2.5) {
      tint = uItemColor;
    } else if (tintId > 2.5 && tintId < 3.5) {
      tint = uHazardColor;
    }

    if (isMonster > 0.5) {
      tint = uEnemyColor;
    }

    // -------------------------
    // Lighting
    // -------------------------

    float modulate = 1.0;
    if (tintId > 2.5 && tintId < 3.5)
      modulate *= 0.7 + 0.3 * sin(uTime * uHazardOmega);
    else if (tintId > 1.5 && tintId < 2.5)
      modulate *= 0.9 + 0.1 * sin(uTime * uInteractOmega);

    float ao = (curWall < 0.5)
      ? (wL + wR + wU + wD) * 0.25 * uAoStrength
      : 0.0;

    vec2 dir = normalize(uLightDir + vec2(1e-5));
    float shadow = (1.0 - curWall) * isWallAtCell(cell + sign(dir)) * 0.25;

    float shade = mix(0.97, 1.08, isEdgeWall);
    shade *= (1.0 - ao);
    shade *= (1.0 - shadow);
    shade *= modulate;

    ink *= tint.rgb * shade;

    // ------------------------------------------------------------
    // DOOR EFFECT — stronger, calmer, architectural
    // ------------------------------------------------------------

    float isDoor = tileIs(ch, uDoorTile);

    if (isDoor > 0.5) {
      vec2 eps = vec2(1.0 / 32.0);

      float aC = inkA;
      float aL = smoothstep(0.05, 0.20, atlasAlphaAtLocal(local2 + vec2(-eps.x, 0.0), tx, ty, cols, rows));
      float aR = smoothstep(0.05, 0.20, atlasAlphaAtLocal(local2 + vec2( eps.x, 0.0), tx, ty, cols, rows));
      float aU = smoothstep(0.05, 0.20, atlasAlphaAtLocal(local2 + vec2(0.0,-eps.y), tx, ty, cols, rows));
      float aD = smoothstep(0.05, 0.20, atlasAlphaAtLocal(local2 + vec2(0.0, eps.y), tx, ty, cols, rows));

      float edge = clamp((aC - min(min(aL,aR), min(aU,aD))) * 2.5, 0.0, 1.0);

      // Slow, weighty pulse (much slower than items)
      float pulse = 0.6 + 0.4 * sin(uTime * 0.9);

      // Vertical bias — doors feel tall and solid
      float vertical = smoothstep(0.1, 0.5, abs(local.y - 0.5));

      float strength = edge * pulse * vertical;

      vec3 hi = vec3(0.92, 0.95, 1.0);
      ink = mix(ink, hi, strength * 0.22); // NOTICEABLY stronger, still < items
    }

    // -------------------------
    // Item metallic sheen (unchanged)
    // -------------------------

    if (tintId > 1.5 && tintId < 2.5 && isMonster < 0.5 && isDoor < 0.5) {
      float phase = fract(local.x * 0.9 + local.y * 0.6 + uTime * 0.6);
      float d = abs(phase - 0.5);
      float core = 1.0 - smoothstep(0.01, 0.03, d);
      float halo = 1.0 - smoothstep(0.04, 0.16, d);
      float sparkle = step(0.92, fract(local.x * 13.0 + local.y * 17.0 + uTime * 1.2));
      float sheen = core * 0.75 + halo * 0.22 + sparkle * core * 0.35;
      vec3 hi = vec3(0.96, 0.98, 1.0);
      ink = clamp(mix(ink, hi, sheen) + hi * (sheen * 0.45), 0.0, 1.0);
    }

    // --- Layer 1: base floor/wall ---
    vec3 outRgb = mix(bg, ink, inkA);

    // (path overlay is applied after fog-of-war below)

    // ------------------------------------------------------------
    // SELECTED OUTLINE (R1.5) — inspection affordance
    // ------------------------------------------------------------
    float sx = 1.0 - step(0.5, abs(cell.x - uSelectedCell.x));
    float sy = 1.0 - step(0.5, abs(cell.y - uSelectedCell.y));
    float isSelectedCell = uSelectedEnabled * sx * sy;

    if (isSelectedCell > 0.0) {
      // Thicker than hover
      float t = 0.07;
      float edge =
        step(local.x, t) +
        step(local.y, t) +
        step(1.0 - local.x, t) +
        step(1.0 - local.y, t);
      edge = clamp(edge, 0.0, 1.0);

      // Use item color (theme-derived) so we don't hardcode a new RGB
      vec3 selCol = uItemColor.rgb;
      outRgb = mix(outRgb, selCol, edge * uSelectedStrength);
    }


    // ------------------------------------------------------------
    // HOVER OUTLINE (R1.5) — inspection affordance
    // ------------------------------------------------------------
    // cell is in the flipped grid space already (matches click mapping if we flip u/v in pointer handlers)
    float hx = 1.0 - step(0.5, abs(cell.x - uHoverCell.x));
    float hy = 1.0 - step(0.5, abs(cell.y - uHoverCell.y));
    float isHoverCell = uHoverEnabled * hx * hy;

    if (isHoverCell > 0.0) {
      // Thin outline inside the cell (local is 0..1 within the cell)
      float t = 0.04; // thickness in local space; tweak later if needed
      float edge =
        step(local.x, t) +
        step(local.y, t) +
        step(1.0 - local.x, t) +
        step(1.0 - local.y, t);
      edge = clamp(edge, 0.0, 1.0);

      // High-contrast hover color; keep subtle (strength is uniform-tunable)
      vec3 hoverCol = vec3(0.95);
      outRgb = mix(outRgb, hoverCol, edge * uHoverStrength);
    }

    // ------------------------------------------------------------
    // M7 — apply dim (explored-but-dark) and visibility boost
    // ------------------------------------------------------------
    outRgb *= dim;
    // Warm ambient glow for currently visible cells
    outRgb += vis * uVisBgBoost * vec3(0.15, 0.10, 0.06);
    // Slight foreground lift for visible cells (brightens ink pixels)
    outRgb = clamp(outRgb + vis * uVisFgBoost * inkA * vec3(1.0), 0.0, 1.0);

    // Explored but not currently visible: render glyph in dark grey
    float notVisible = 1.0 - step(0.5 / 255.0, vis);
    outRgb = mix(outRgb, mix(bg, vec3(0.05), inkA), notVisible);

    // Path overlay applied after fog-of-war so it shows at full strength
    // even on unexplored / not-visible cells
    float pathBlendFinal = pathIntensity;
    outRgb = mix(outRgb, pathColor, pathBlendFinal * 0.5);

    gl_FragColor = vec4(outRgb, 1.0);
  }

`;
