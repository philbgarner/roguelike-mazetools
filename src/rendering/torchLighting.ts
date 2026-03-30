import * as THREE from "three";

/**
 * Shared GLSL torch lighting chunks.
 *
 * Each shader that uses these must also declare:
 *   uniform vec3  uFogColor;
 *   varying float vFogDist;
 *   varying vec2  vWorldPos;
 */

/** Uniform declarations — paste before main(). */
export const TORCH_UNIFORMS_GLSL = /* glsl */ `
uniform float uFogNear;
uniform float uFogFar;
uniform float uBandNear;   // distance at which brightness falloff begins (≥ uFogNear)
uniform float uTime;
uniform vec3  uTint0;      // distance band 0 (closest)
uniform vec3  uTint1;      // distance band 1
uniform vec3  uTint2;      // distance band 2
uniform vec3  uTint3;      // distance band 3 (farthest lit)
uniform vec3  uTorchColor;     // additive torch tint
uniform float uTorchIntensity; // global scale for the additive torch (0–2)
`;

/** Spatial hash helper — required by TORCH_FNS_GLSL. */
export const TORCH_HASH_GLSL = /* glsl */ `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`;

/**
 * Two lighting functions for use in main():
 *
 *   float band = torchBand(flickerRadius);
 *     Quantised distance band: 0 = closest, 4 = fog.
 *
 *   vec3 lit = applyTorchLighting(baseColor, band);
 *     Multiply grayscale distance falloff + additive yellow torch fill.
 *     Does NOT apply fog — caller finishes with:
 *       mix(lit, uFogColor, step(4.0, band))
 *
 * Pass baseColor with any surface shading (e.g. bumpShade) already folded in.
 */
export const TORCH_FNS_GLSL = /* glsl */ `
float torchBand(float flickerRadius) {
  float raw = sin(uTime * 7.0)  * 0.45
            + sin(uTime * 13.7) * 0.35
            + sin(uTime * 3.1)  * 0.20;
  float flicker = (floor(raw * 1.5 + 0.5)) / 6.0;
  float dist = clamp((vFogDist - uBandNear) / (uFogFar - uBandNear), 0.0, 1.0);
  float flickeredDist = clamp(dist + flicker * flickerRadius, 0.0, 1.0);
  return floor(pow(flickeredDist, 0.75) * 5.0);
}

vec3 applyTorchLighting(vec3 baseColor, float band) {
  float timeSlot = floor(uTime * 1.5);
  vec2 cell = floor(vWorldPos * 0.5);
  float spatialNoise = hash(cell + vec2(timeSlot * 7.3, timeSlot * 3.1));
  float turb = (floor(spatialNoise * 3.0) / 3.0) * 0.18;

  // Multiply: grayscale distance falloff
  float brightness;
  vec3  tint;
  if (band < 1.0) {
    brightness = 1.00 - turb; tint = uTint0;
  } else if (band < 2.0) {
    brightness = 0.55;        tint = uTint1;
  } else if (band < 3.0) {
    brightness = 0.22;        tint = uTint2;
  } else if (band < 4.0) {
    brightness = 0.10;        tint = uTint3;
  } else {
    brightness = 0.00;        tint = vec3(1.0);
  }

  vec3 lit = baseColor * tint * brightness;

  // Additive torch: nearest two bands only, scaled by intensity
  float torchAdd = (band < 1.0) ? 0.250 :
                   (band < 2.0) ? 0.200 : 0.0;
  lit += uTorchColor * (torchAdd * uTorchIntensity);

  return lit;
}
`;

/**
 * Vertex shader for textured 3-D objects (GLB/FBX models).
 * Outputs vUv, vFogDist, vWorldPos for use with TORCH_OBJECT_FRAG.
 */
export const TORCH_OBJECT_VERT = /* glsl */ `
varying vec2  vUv;
varying float vFogDist;
varying vec2  vWorldPos;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xz;
  vec4 eyePos = viewMatrix * worldPos;
  vFogDist = length(eyePos.xyz);
  gl_Position = projectionMatrix * eyePos;
}
`;

/**
 * Fragment shader for textured 3-D objects (GLB/FBX models).
 * Samples uMap, applies torch lighting + fog.
 * Requires uniforms: uMap (sampler2D), uFogColor (vec3), + TORCH_UNIFORMS_GLSL set.
 */
export const TORCH_OBJECT_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3  uFogColor;
${TORCH_UNIFORMS_GLSL}

varying vec2  vUv;
varying float vFogDist;
varying vec2  vWorldPos;

${TORCH_HASH_GLSL}
${TORCH_FNS_GLSL}

void main() {
//  gl_FragColor = texture2D(uMap, vUv);
  vec4 color = texture2D(uMap, vUv);
  if (color.a < 0.01) discard;

  float band = torchBand(0.03);
  vec3 lit = applyTorchLighting(color.rgb, band);
  gl_FragColor = vec4(mix(lit, uFogColor, step(4.0, band)), color.a);
}
`;

/**
 * Distance (world units) at which brightness falloff begins.
 * Everything closer than this is band 0 (full brightness, uTint0).
 * With tileSize=3 this keeps ~2 cells in front of the player fully lit.
 */
export const DEFAULT_BAND_NEAR = 8;

/** Warm yellow additive torch colour. */
export const DEFAULT_TORCH_COLOR = new THREE.Color(1.0, 0.85, 0.4);
/** Default torch intensity multiplier. */
export const DEFAULT_TORCH_INTENSITY = 0.33;
/** Same colour as a CSS hex string, for localStorage / HTML input[type=color]. */
export const DEFAULT_TORCH_HEX = "#" + DEFAULT_TORCH_COLOR.getHexString();

/**
 * Default grayscale distance bands: white → gray → darker gray → ~25% gray.
 * The additive torch layer handles the warm colour; these stay neutral.
 */
export const DEFAULT_TINT_COLORS: readonly [
  THREE.Color,
  THREE.Color,
  THREE.Color,
  THREE.Color,
] = [
  new THREE.Color(1.0, 1.0, 1.0), // band 0: white
  new THREE.Color(0.67, 0.67, 0.67), // band 1: gray
  new THREE.Color(0.33, 0.33, 0.33), // band 2: darker gray
  new THREE.Color(0.25, 0.25, 0.25), // band 3: ~25% gray
];

/**
 * Build Three.js uniform objects for the torch lighting uniforms.
 * tintColors overrides the grayscale bands; uTorchColor is always default.
 */
export function makeTorchUniforms(
  tintColors?: THREE.Color[],
): Record<string, { value: THREE.Color | number }> {
  return {
    uBandNear: { value: DEFAULT_BAND_NEAR },
    uTint0: { value: tintColors?.[0] ?? DEFAULT_TINT_COLORS[0] },
    uTint1: { value: tintColors?.[1] ?? DEFAULT_TINT_COLORS[1] },
    uTint2: { value: tintColors?.[2] ?? DEFAULT_TINT_COLORS[2] },
    uTint3: { value: tintColors?.[3] ?? DEFAULT_TINT_COLORS[3] },
    uTorchColor: { value: DEFAULT_TORCH_COLOR },
    uTorchIntensity: { value: DEFAULT_TORCH_INTENSITY },
  };
}
