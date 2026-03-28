/**
 * InstancedTileMesh
 *
 * Renders up to MAX_INSTANCES quads (PlaneGeometry) via InstancedMesh.
 * Each instance carries its own tileId which is used in a custom shader to
 * sample the correct region of a texture atlas.
 *
 * Positioning / rotation are encoded in each instance's Matrix4 so this
 * component can represent floors, ceilings, and walls of any orientation.
 */
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TileAtlas } from "./tileAtlas";

export type TileInstance = {
  matrix: THREE.Matrix4;
  tileId: number;
  cellX?: number;
  cellZ?: number;
};

const MAX_INSTANCES = 32768;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
attribute float aTileId;
attribute float aHighlight;
attribute float aPassage;
uniform vec2  uTileSize;   // (tileW/sheetW, tileH/sheetH)
uniform float uColumns;    // tiles per row in the atlas

varying vec2  vAtlasUv;
varying vec2  vTileOrigin; // atlas UV of this tile's bottom-left corner
varying float vFogDist;
varying vec2  vWorldPos;
varying vec2  vTileUv;
varying float vHighlight;
varying float vPassage;

void main() {
  float id  = floor(aTileId + 0.5);
  float col = mod(id, uColumns);
  float row = floor(id / uColumns);

  // bottom-left corner of this tile in atlas UV space
  vec2 offset = vec2(col * uTileSize.x, 1.0 - (row + 1.0) * uTileSize.y);
  vAtlasUv    = offset + uv * uTileSize;
  vTileOrigin = offset;
  vTileUv     = uv; // [0,1]² local quad coords, used for debug edge overlay

  vHighlight = aHighlight;
  vPassage   = aPassage;

  vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xz;

  vec4 eyePos = viewMatrix * worldPos;
  vFogDist = length(eyePos.xyz);

  gl_Position = projectionMatrix * eyePos;
}
`;

// How much the torch radius breathes (fraction of the fog range).
const FLICKER_RADIUS = 0.03;
// z-component of the bump tangent normal — larger = flatter bump effect.
const BUMP_DEPTH = 0.3;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2  uTileSize;      // (tileW/sheetW, tileH/sheetH)
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uFlickerRadius; // fraction of fog range the radius breathes
uniform vec2  uTexelSize;     // (1/sheetWidth, 1/sheetHeight)
uniform float uDebugEdges;    // 1.0 = draw tile-edge debug border, 0.0 = off
uniform vec3 uTint0;
uniform vec3 uTint1;
uniform vec3 uTint2;
uniform vec3 uTint3;

varying vec2  vAtlasUv;
varying vec2  vTileOrigin;
varying float vFogDist;
varying vec2  vWorldPos;
varying vec2  vTileUv;
varying float vHighlight;
varying float vPassage;

// Simple spatial hash: returns [0,1) for a given cell coord.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // Clamp to this tile's texel bounds so perspective-interpolated UVs that
  // overshoot the quad edge never sample a neighbouring tile in the atlas.
  vec2 uvMin = vTileOrigin + uTexelSize * 0.5;
  vec2 uvMax = vTileOrigin + uTileSize  - uTexelSize * 0.5;
  vec2 atlasUv = clamp(vAtlasUv, uvMin, uvMax);

  vec4 color = texture2D(uAtlas, atlasUv);
  if (color.a < 0.01) discard;

  // Bump from intensity gradient: sample right+up neighbours, derive tangent normal.
  vec3 luma = vec3(0.299, 0.587, 0.114);
  float l0 = dot(color.rgb, luma);
  float lR = dot(texture2D(uAtlas, clamp(atlasUv + vec2(uTexelSize.x, 0.0), uvMin, uvMax)).rgb, luma);
  float lU = dot(texture2D(uAtlas, clamp(atlasUv + vec2(0.0, uTexelSize.y), uvMin, uvMax)).rgb, luma);
  // brighter texels are "raised"; z controls bump strength (larger = flatter)
  vec3 bumpN = normalize(vec3(l0 - lR, l0 - lU, ${BUMP_DEPTH}));
  float bumpShade = clamp(dot(bumpN, normalize(vec3(0.5, 0.5, 1.0))), 0.0, 1.0);
  bumpShade = 0.8 + 0.35 * bumpShade; // remap to [0.8, 1.15]

  // Layered sines at co-prime frequencies → irregular candlelight rhythm.
  // Quantised to 3 discrete levels so the flicker snaps rather than fades.
  float raw = sin(uTime * 7.0)  * 0.45
            + sin(uTime * 13.7) * 0.35
            + sin(uTime * 3.1)  * 0.20;
  float flicker = (floor(raw * 1.5 + 0.5)) / 6.0; // snaps to ~±0.167 steps

  float dist = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);

  // Flicker shifts the effective dist so the torch radius breathes.
  float flickeredDist = clamp(dist + flicker * uFlickerRadius, 0.0, 1.0);
  float curved = pow(flickeredDist, 0.75);
  float band = floor(curved * 5.0); // 0 = closest … 4 = darkest

  // Spatial turbulence: pattern holds still then snaps to a new arrangement.
  // floor(uTime * 1.5) ticks ~1.5×/sec; mixing it into the hash seed
  // changes every cell simultaneously on each tick.
  float timeSlot = floor(uTime * 1.5);
  vec2 cell = floor(vWorldPos * 0.5);
  float spatialNoise = hash(cell + vec2(timeSlot * 7.3, timeSlot * 3.1));
  float turb = (floor(spatialNoise * 3.0) / 3.0) * 0.18; // 0, 0.06, or 0.12 off full brightness

  float brightness;
  vec3  tint;
  if (band < 1.0) {
    brightness = 1.00 - turb; tint = uTint0;
  } else if (band < 2.0) {
    brightness = 0.55; tint = uTint1;
  } else if (band < 3.0) {
    brightness = 0.22; tint = uTint2;
  } else if (band < 4.0) {
    brightness = 0.10; tint = uTint3;
  } else {
    brightness = 0.00; tint = vec3(1.0);
  }

  vec3 lit = color.rgb * tint * brightness * bumpShade;

  // Debug edge: highlight the 1-pixel border of each tile quad.
  // Uses screen-space derivatives so the border is always ~1px regardless of zoom.
  if (uDebugEdges > 0.5) {
    vec2 fw = fwidth(vTileUv);          // ~1 pixel in tile-UV space
    vec2 edge = step(vTileUv, fw) + step(1.0 - fw, vTileUv);
    float onEdge = clamp(edge.x + edge.y, 0.0, 1.0);
    lit = mix(lit, vec3(1.0, 0.0, 1.0), onEdge * 0.85);
  }

  // Highlight overlay
  float hi = floor(vHighlight + 0.5);

  if (hi == 1.0) {
    // Targeting preview: blue/white pulse
    float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
    vec3 highlightColor = mix(vec3(0.2, 0.5, 1.0), vec3(0.7, 0.9, 1.0), pulse);
    lit = mix(lit, highlightColor, 0.55 * pulse + 0.2);
  } else if (hi == 2.0) {
    // Fire: orange/red flicker with per-cell spatial hash variation
    float cellHash = hash(floor(vWorldPos));
    float firePhase = uTime * 6.0 + cellHash * 12.566; // per-cell offset
    float fireFlicker = 0.5 + 0.5 * sin(firePhase)
                      + 0.25 * sin(firePhase * 1.7 + 1.3)
                      + 0.15 * sin(firePhase * 2.9 + 0.7);
    fireFlicker = clamp(fireFlicker / 1.9, 0.0, 1.0);
    vec3 fireColor = mix(vec3(0.8, 0.1, 0.0), vec3(1.0, 0.7, 0.1), fireFlicker);
    lit = mix(lit, fireColor, 0.6 + 0.3 * fireFlicker);
  } else if (hi == 3.0) {
    // Lightning: sharp yellow/white flashes
    float cellHash2 = hash(floor(vWorldPos) + vec2(7.3, 3.1));
    float lightningPhase = uTime * 18.0 + cellHash2 * 6.283;
    float flash = step(0.72, fract(lightningPhase));
    float flash2 = step(0.85, fract(lightningPhase * 1.618));
    float boltIntensity = clamp(flash + flash2, 0.0, 1.0);
    vec3 lightningColor = mix(vec3(0.9, 0.9, 0.2), vec3(1.0, 1.0, 1.0), boltIntensity);
    lit = mix(lit, lightningColor, 0.45 + 0.5 * boltIntensity);
  }

  // Passage overlay (applied after highlights so it shows on wall faces)
  float pa = floor(vPassage + 0.5);
  if (pa > 1.5) {
    // Enabled passage: bright cyan
    lit = mix(lit, vec3(0.0, 0.9, 0.9), 0.35);
  } else if (pa > 0.5) {
    // Disabled passage: faint cyan hint
    lit = mix(lit, vec3(0.0, 0.4, 0.5), 0.2);
  }

  gl_FragColor = vec4(mix(lit, uFogColor, step(4.0, band)), color.a);
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  instances: TileInstance[];
  atlas: TileAtlas;
  texture: THREE.Texture;
  fogNear?: number;
  fogFar?: number;
  fogColor?: THREE.Color;
  debugEdges?: boolean;
  highlightData?: Uint8Array;
  passageData?: Uint8Array;
  gridWidth?: number;
  tintColors?: THREE.Color[];
};

export function InstancedTileMesh({
  instances,
  atlas,
  texture,
  fogNear = 4,
  fogFar = 10,
  fogColor,
  debugEdges = false,
  highlightData,
  passageData,
  gridWidth,
  tintColors,
}: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Geometry is created once; the aTileId, aHighlight and aPassage attributes
  // are pre-allocated to MAX_INSTANCES so we never need to recreate them.
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute(
      "aTileId",
      new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1),
    );
    geo.setAttribute(
      "aHighlight",
      new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1),
    );
    geo.setAttribute(
      "aPassage",
      new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1),
    );
    return geo;
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uAtlas: { value: texture },
          uTileSize: {
            value: new THREE.Vector2(
              atlas.tileWidth / atlas.sheetWidth,
              atlas.tileHeight / atlas.sheetHeight,
            ),
          },
          uColumns: { value: atlas.columns },
          uFogColor: { value: fogColor ?? new THREE.Color(0, 0, 0) },
          uFogNear: { value: fogNear },
          uFogFar: { value: fogFar },
          uTime: { value: 0 },
          uFlickerRadius: { value: FLICKER_RADIUS },
          uTexelSize: {
            value: new THREE.Vector2(
              1 / atlas.sheetWidth,
              1 / atlas.sheetHeight,
            ),
          },
          uDebugEdges: { value: debugEdges ? 1.0 : 0.0 },
          uTint0: { value: tintColors?.[0] ?? new THREE.Color(1.00, 0.90, 0.68) },
          uTint1: { value: tintColors?.[1] ?? new THREE.Color(1.00, 0.94, 0.76) },
          uTint2: { value: tintColors?.[2] ?? new THREE.Color(0.60, 0.55, 0.80) },
          uTint3: { value: tintColors?.[3] ?? new THREE.Color(0.30, 0.25, 0.60) },
        },
        side: THREE.FrontSide,
      }),
    [atlas, texture, fogNear, fogFar, fogColor],
  );

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.getElapsedTime();
  });

  useEffect(() => {
    material.uniforms.uDebugEdges.value = debugEdges ? 1.0 : 0.0;
  }, [debugEdges, material]);

  useEffect(() => {
    if (tintColors?.[0]) material.uniforms.uTint0.value = tintColors[0];
    if (tintColors?.[1]) material.uniforms.uTint1.value = tintColors[1];
    if (tintColors?.[2]) material.uniforms.uTint2.value = tintColors[2];
    if (tintColors?.[3]) material.uniforms.uTint3.value = tintColors[3];
  }, [tintColors, material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const tileAttr = mesh.geometry.getAttribute(
      "aTileId",
    ) as THREE.InstancedBufferAttribute;

    const count = Math.min(instances.length, MAX_INSTANCES);
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, instances[i].matrix);
      tileAttr.setX(i, instances[i].tileId);
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    tileAttr.needsUpdate = true;
  }, [instances]);

  // Update aHighlight attribute from highlightData + instance cell coordinates
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const highlightAttr = mesh.geometry.getAttribute(
      "aHighlight",
    ) as THREE.InstancedBufferAttribute;

    const count = Math.min(instances.length, MAX_INSTANCES);

    if (!highlightData || !gridWidth) {
      // Clear all highlights
      for (let i = 0; i < count; i++) {
        highlightAttr.setX(i, 0);
      }
    } else {
      for (let i = 0; i < count; i++) {
        const inst = instances[i];
        if (inst.cellX !== undefined && inst.cellZ !== undefined) {
          const idx = inst.cellZ * gridWidth + inst.cellX;
          highlightAttr.setX(i, highlightData[idx] ?? 0);
        } else {
          highlightAttr.setX(i, 0);
        }
      }
    }

    highlightAttr.needsUpdate = true;
  }, [instances, highlightData, gridWidth]);

  // Update aPassage attribute from passageData + instance cell coordinates
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const passageAttr = mesh.geometry.getAttribute(
      "aPassage",
    ) as THREE.InstancedBufferAttribute;

    const count = Math.min(instances.length, MAX_INSTANCES);

    if (!passageData || !gridWidth) {
      for (let i = 0; i < count; i++) passageAttr.setX(i, 0);
    } else {
      for (let i = 0; i < count; i++) {
        const inst = instances[i];
        if (inst.cellX !== undefined && inst.cellZ !== undefined) {
          passageAttr.setX(i, passageData[inst.cellZ * gridWidth + inst.cellX] ?? 0);
        } else {
          passageAttr.setX(i, 0);
        }
      }
    }

    passageAttr.needsUpdate = true;
  }, [instances, passageData, gridWidth]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
    />
  );
}
