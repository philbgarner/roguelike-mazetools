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

uniform sampler2D uSolid;   // R8 normalized
uniform sampler2D uChar;    // R8 normalized
uniform sampler2D uTint;    // R8 normalized (tint channel id)
uniform sampler2D uAtlas;   // RGBA tileset

uniform vec2 uGridSize;     // (W, H)
uniform vec2 uAtlasGrid;    // (cols, rows)
uniform float uWallTile;    // tile index
uniform float uFloorTile;   // tile index
uniform float uFlipAtlasY;  // 0 or 1

uniform float uFlipGridX;   // 0 or 1
uniform float uFlipGridY;   // 0 or 1

uniform vec4 uFloorColor;
uniform vec4 uWallColor;
uniform vec4 uPlayerColor;
uniform vec4 uItemColor;
uniform vec4 uHazardColor;

varying vec2 vUv;

float sampleR8(sampler2D tex, vec2 uv) {
  return texture2D(tex, uv).r; // 0..1
}

float isWallAtCell(vec2 cell) {
  vec2 c = clamp(cell, vec2(0.0), uGridSize - vec2(1.0));
  vec2 uv = (c + vec2(0.5)) / uGridSize;
  float s = sampleR8(uSolid, uv);
  return step(0.5, s); // 1 if wall, 0 if floor
}

void main() {
  // Apply grid flips BEFORE computing cell coords
  vec2 uvGrid = vUv;
  if (uFlipGridX > 0.5) uvGrid.x = 1.0 - uvGrid.x;
  if (uFlipGridY > 0.5) uvGrid.y = 1.0 - uvGrid.y;

  // Which cell are we in?
  vec2 gridUv = uvGrid * uGridSize;
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv);

  // Center UV for sampling
  vec2 texUv = (cell + vec2(0.5)) / uGridSize;

  // Current cell wall/floor
  float curWall = step(0.5, sampleR8(uSolid, texUv));

  // 8-neighbor walls (clamped)
  float wL  = isWallAtCell(cell + vec2(-1.0,  0.0));
  float wR  = isWallAtCell(cell + vec2( 1.0,  0.0));
  float wU  = isWallAtCell(cell + vec2( 0.0, -1.0));
  float wD  = isWallAtCell(cell + vec2( 0.0,  1.0));

  float wUL = isWallAtCell(cell + vec2(-1.0, -1.0));
  float wUR = isWallAtCell(cell + vec2( 1.0, -1.0));
  float wDL = isWallAtCell(cell + vec2(-1.0,  1.0));
  float wDR = isWallAtCell(cell + vec2( 1.0,  1.0));

  // Exterior/edge wall if current is wall AND any neighbor is floor
  float allNeighborsWall = wL * wR * wU * wD * wUL * wUR * wDL * wDR;
  float hasFloorNeighbor = 1.0 - allNeighborsWall;
  float isEdgeWall = curWall * hasFloorNeighbor;

  // Char overlay (still allowed on top of blank walls)
  float chN = sampleR8(uChar, texUv);
  float ch  = floor(chN * 255.0 + 0.5);
  float hasChar = step(0.5, ch);

  // Interior wall and no char => blank (transparent)
  if (curWall > 0.5 && isEdgeWall < 0.5 && hasChar < 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // Base tile: floor for floor cells; wall tile only for edge walls
  float baseTile = mix(uFloorTile, uWallTile, isEdgeWall);

  // Char overrides base when non-zero
  float tile = mix(baseTile, ch, hasChar);

  // Tint selection (0=base, 1=player, 2=item, 3=hazard)
  float tintN = sampleR8(uTint, texUv);
  float tintId = floor(tintN * 255.0 + 0.5);
  vec4 baseTint = mix(uFloorColor, uWallColor, isEdgeWall);
  vec4 tint = baseTint;
  if (tintId > 0.5 && tintId < 1.5) tint = uPlayerColor;
  else if (tintId > 1.5 && tintId < 2.5) tint = uItemColor;
  else if (tintId > 2.5 && tintId < 3.5) tint = uHazardColor;

  float cols = uAtlasGrid.x;
  float rows = uAtlasGrid.y;

  float tx = mod(tile, cols);
  float ty = floor(tile / cols);

  vec2 atlasUv = (vec2(tx, ty) + local) / vec2(cols, rows);
  if (uFlipAtlasY > 0.5) atlasUv.y = 1.0 - atlasUv.y;

  vec4 c = texture2D(uAtlas, atlasUv);
  c.rgb *= tint.rgb;
  gl_FragColor = c;
}
`;
