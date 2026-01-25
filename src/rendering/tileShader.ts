// src/rendering/tileShader.ts
export const tileVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const tileFrag = /* glsl */ `
precision highp float;

uniform sampler2D uSolid;   // R8 normalized
uniform sampler2D uChar;    // R8 normalized
uniform sampler2D uAtlas;   // RGBA tileset

uniform vec2 uGridSize;     // (W, H)
uniform vec2 uAtlasGrid;    // (cols, rows)
uniform float uWallTile;    // tile index
uniform float uFloorTile;   // tile index
uniform float uFlipAtlasY;  // 0 or 1

varying vec2 vUv;

float sampleR8(sampler2D tex, vec2 uv) {
  return texture2D(tex, uv).r; // 0..1
}

void main() {
  // Which cell are we in?
  vec2 gridUv = vUv * uGridSize;
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv);

  // Sample at cell center in texture space
  vec2 texUv = (cell + vec2(0.5)) / uGridSize;

  float solid = sampleR8(uSolid, texUv); // 0..1
  float chN  = sampleR8(uChar, texUv);   // 0..1

  float isWall = step(0.5, solid);

  // Decode R8 -> 0..255 tile index
  float ch = floor(chN * 255.0 + 0.5);

  float tile = mix(uFloorTile, uWallTile, isWall);
  tile = mix(tile, ch, step(0.5, ch)); // if ch >= 1 use ch

  float cols = uAtlasGrid.x;
  float rows = uAtlasGrid.y;

  float tx = mod(tile, cols);
  float ty = floor(tile / cols);

  // atlas UV inside the tile
  vec2 atlasUv = (vec2(tx, ty) + local) / vec2(cols, rows);

  if (uFlipAtlasY > 0.5) {
    atlasUv.y = 1.0 - atlasUv.y;
  }

  vec4 c = texture2D(uAtlas, atlasUv);
  gl_FragColor = c;
}
`;
