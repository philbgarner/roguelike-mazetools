import { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Center, Text3D, useFont } from "@react-three/drei";
import { useGame } from "./GameProvider";

const FONT_URL = "/fonts/dosfont.json";

function MenuItem({
  label,
  y,
  onClick,
}: {
  label: string;
  y: number;
  onClick: () => void;
}) {
  const font = useFont(FONT_URL);
  const [hovered, setHovered] = useState(false);
  const textRef = useRef<THREE.Mesh>(null);
  const planeRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (!textRef.current || !planeRef.current) return;
      const box = new THREE.Box3().setFromObject(textRef.current);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      planeRef.current.position.copy(center);
      planeRef.current.position.z -= 0.1;
      planeRef.current.scale.set(size.x + 0.3, size.y + 0.3, 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [label]);

  return (
    <group position={[0, y, 0]}>
      <mesh
        ref={planeRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onClick={onClick}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Center>
        <Text3D
          ref={textRef}
          font={font.data}
          size={0.5}
          height={0.1}
          curveSegments={4}
        >
          {label}
          <meshStandardMaterial color={hovered ? "#ffff00" : "white"} />
        </Text3D>
      </Center>
    </group>
  );
}

function Title() {
  const font = useFont(FONT_URL);

  return (
    <Center position={[0, 1.5, 0]}>
      <Text3D font={font.data} size={1} height={0.2} curveSegments={6}>
        Level Complete!
        <meshStandardMaterial color="#aaffaa" />
      </Text3D>
    </Center>
  );
}

function MenuScene() {
  const { goTo, seed, markDungeonComplete } = useGame();

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <Title />
      <MenuItem
        label="Return to World"
        y={0}
        onClick={() => {
          markDungeonComplete(seed);
          goTo("overworld");
        }}
      />
    </>
  );
}

export default function Success() {
  return (
    <Canvas
      style={{ width: "100vw", height: "100vh", background: "#111" }}
      camera={{ position: [0, 0, 8], fov: 50 }}
    >
      <MenuScene />
    </Canvas>
  );
}
