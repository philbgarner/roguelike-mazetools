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
};

const MAX_INSTANCES = 32768;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
attribute float aTileId;
uniform vec2  uTileSize;   // (tileW/sheetW, tileH/sheetH)
uniform float uColumns;    // tiles per row in the atlas

varying vec2  vAtlasUv;
varying float vFogDist;
varying vec2  vWorldPos;

void main() {
  float id  = floor(aTileId + 0.5);
  float col = mod(id, uColumns);
  float row = floor(id / uColumns);

  // bottom-left corner of this tile in atlas UV space
  vec2 offset = vec2(col * uTileSize.x, 1.0 - (row + 1.0) * uTileSize.y);
  vAtlasUv = offset + uv * uTileSize;

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
const BUMP_DEPTH = 0.05;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uFlickerRadius; // fraction of fog range the radius breathes
uniform vec2  uTexelSize;     // (1/sheetWidth, 1/sheetHeight)

varying vec2  vAtlasUv;
varying float vFogDist;
varying vec2  vWorldPos;

// Simple spatial hash: returns [0,1) for a given cell coord.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 color = texture2D(uAtlas, vAtlasUv);
  if (color.a < 0.01) discard;

  // Bump from intensity gradient: sample right+up neighbours, derive tangent normal.
  vec3 luma = vec3(0.299, 0.587, 0.114);
  float l0 = dot(color.rgb, luma);
  float lR = dot(texture2D(uAtlas, vAtlasUv + vec2(uTexelSize.x, 0.0)).rgb, luma);
  float lU = dot(texture2D(uAtlas, vAtlasUv + vec2(0.0, uTexelSize.y)).rgb, luma);
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
    brightness = 1.00 - turb; tint = vec3(1.00, 0.90, 0.68); // near-white, soft warm
  } else if (band < 2.0) {
    brightness = 0.55; tint = vec3(1.00, 0.94, 0.76); // near-white, faint warm
  } else if (band < 3.0) {
    brightness = 0.22; tint = vec3(0.60, 0.55, 0.80); // cool purple
  } else if (band < 4.0) {
    brightness = 0.10; tint = vec3(0.30, 0.25, 0.60); // deep blue-violet
  } else {
    brightness = 0.00; tint = vec3(1.0);               // darkness
  }

  vec3 lit = color.rgb * tint * brightness * bumpShade;
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
};

export function InstancedTileMesh({
  instances,
  atlas,
  texture,
  fogNear = 4,
  fogFar = 10,
  fogColor,
}: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Geometry is created once; the aTileId attribute is pre-allocated to
  // MAX_INSTANCES so we never need to recreate it.
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute(
      "aTileId",
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
        },
        side: THREE.FrontSide,
      }),
    [atlas, texture, fogNear, fogFar, fogColor],
  );

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.getElapsedTime();
  });

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

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, MAX_INSTANCES]}
      frustumCulled={false}
    />
  );
}
