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

void main() {
  float id  = floor(aTileId + 0.5);
  float col = mod(id, uColumns);
  float row = floor(id / uColumns);

  // bottom-left corner of this tile in atlas UV space
  vec2 offset = vec2(col * uTileSize.x, 1.0 - (row + 1.0) * uTileSize.y);
  vAtlasUv = offset + uv * uTileSize;

  vec4 eyePos = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vFogDist = length(eyePos.xyz);

  gl_Position = projectionMatrix * eyePos;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec2  vAtlasUv;
varying float vFogDist;

void main() {
  vec4 color = texture2D(uAtlas, vAtlasUv);
  if (color.a < 0.01) discard;

  float fogFactor = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(color.rgb, uFogColor, fogFactor), color.a);
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

export function InstancedTileMesh({ instances, atlas, texture, fogNear = 4, fogFar = 10, fogColor }: Props) {
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
          uFogNear:  { value: fogNear },
          uFogFar:   { value: fogFar },
        },
        side: THREE.FrontSide,
      }),
    [atlas, texture, fogNear, fogFar, fogColor],
  );

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
