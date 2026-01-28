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
    float hasChar = step(0.5, ch);

    if (curWall > 0.5 && isEdgeWall < 0.5 && hasChar < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }

    float tile = mix(
      mix(uFloorTile, uWallTile, isEdgeWall),
      ch,
      hasChar
    );

    float tintId = floor(sampleR8(uTint, texUv) * 255.0 + 0.5);

    float cols = uAtlasGrid.x;
    float rows = uAtlasGrid.y;
    float tx = mod(tile, cols);
    float ty = floor(tile / cols);

    float isMonster = tileIs(tile, uMonsterTile);
    vec2 local2 = local;

    if (isMonster > 0.5) {
      float breath = sin(uTime * uEnemyBreathOmega);
      local2 = breatheWarp(local, breath, uEnemyBreathAmp);
    }

    vec2 atlasUv = (vec2(tx, ty) + local2) / vec2(cols, rows);
    if (uFlipAtlasY > 0.5) atlasUv.y = 1.0 - atlasUv.y;

    vec4 c = texture2D(uAtlas, atlasUv);

    vec3 bg = (isEdgeWall > 0.5) ? uWallColor.rgb : vec3(0.0);
    float inkA = smoothstep(0.05, 0.20, c.a);
    vec3 ink = c.rgb;

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

    float isDoor = tileIs(tile, uDoorTile);

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

    vec3 outRgb = mix(bg, ink, inkA);

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

    gl_FragColor = vec4(outRgb, 1.0);
  }

`;
