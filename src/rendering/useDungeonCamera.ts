/**
 * useDungeonCamera
 *
 * Manages first-person camera state for a grid-based dungeon:
 *   - Position (x, z) in world units (cell centres = n + 0.5)
 *   - Yaw (radians; 0 = facing -Z / "north")
 *
 * Controls:
 *   - W / ArrowUp    — move forward
 *   - S / ArrowDown  — move backward
 *   - A / ArrowLeft  — strafe left
 *   - D / ArrowRight — strafe right
 *   - Q / <          — rotate left
 *   - E / >          — rotate right
 *   - Mouse drag on the container element — look around
 *
 * Collision uses a small circular margin around the player centre.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const MOVE_SPEED = 4.0;      // world units per second
const TURN_SPEED = 2.2;      // radians per second (keyboard)
const MOUSE_SENSITIVITY = 0.003; // radians per pixel
const MARGIN = 0.25;         // collision margin (world units)
const TICK_MS = 16;          // ~60 fps movement loop

export type CameraState = {
  x: number;
  z: number;
  yaw: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSolid(
  wx: number,
  wz: number,
  solidData: Uint8Array,
  width: number,
  height: number,
): boolean {
  const cx = Math.floor(wx);
  const cz = Math.floor(wz);
  if (cx < 0 || cz < 0 || cx >= width || cz >= height) return true;
  return solidData[cz * width + cx] > 0;
}

/** Returns true if the circle of radius MARGIN around (wx, wz) is fully walkable. */
function canOccupy(
  wx: number,
  wz: number,
  solidData: Uint8Array,
  width: number,
  height: number,
): boolean {
  return (
    !isSolid(wx - MARGIN, wz - MARGIN, solidData, width, height) &&
    !isSolid(wx + MARGIN, wz - MARGIN, solidData, width, height) &&
    !isSolid(wx - MARGIN, wz + MARGIN, solidData, width, height) &&
    !isSolid(wx + MARGIN, wz + MARGIN, solidData, width, height)
  );
}

/** Try to move from (ox, oz) by (dx, dz) with wall-sliding fallback. */
function tryMove(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  solidData: Uint8Array,
  width: number,
  height: number,
): { x: number; z: number } {
  const nx = ox + dx;
  const nz = oz + dz;

  if (canOccupy(nx, nz, solidData, width, height)) return { x: nx, z: nz };
  // slide along axes
  if (canOccupy(nx, oz, solidData, width, height)) return { x: nx, z: oz };
  if (canOccupy(ox, nz, solidData, width, height)) return { x: ox, z: nz };
  return { x: ox, z: oz };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDungeonCamera(
  solidData: Uint8Array | null,
  width: number,
  height: number,
  startX: number,
  startZ: number,
): {
  camera: CameraState;
  containerRef: React.RefObject<HTMLDivElement>;
} {
  const [camera, setCamera] = useState<CameraState>({
    x: startX,
    z: startZ,
    yaw: 0,
  });

  // Reset on dungeon change
  useEffect(() => {
    setCamera({ x: startX, z: startZ, yaw: 0 });
  }, [solidData, startX, startZ]);

  // Mutable refs so the RAF loop always has fresh values
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const solidRef = useRef(solidData);
  useEffect(() => {
    solidRef.current = solidData;
  }, [solidData]);

  const keysRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null!);

  // Keyboard listeners (attached to window so they work when canvas is focused)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Mouse drag for yaw
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let dragging = false;

    const onMouseDown = () => { dragging = true; };
    const onMouseUp = () => { dragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      setCamera((prev) => ({
        ...prev,
        yaw: prev.yaw - e.movementX * MOUSE_SENSITIVITY,
      }));
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("mousemove", onMouseMove);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  // Movement loop
  const lastTickRef = useRef<number>(0);
  useEffect(() => {
    let rafId: number;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);

      const dt = Math.min((now - lastTickRef.current) / 1000, 0.1);
      lastTickRef.current = now;

      const keys = keysRef.current;
      const solid = solidRef.current;
      if (!solid) return;

      const { x, z, yaw } = cameraRef.current;

      // Forward vector (-sin yaw, cos yaw mapped to xz)
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      let moveX = 0;
      let moveZ = 0;
      let turnDelta = 0;

      if (keys.has("KeyW") || keys.has("ArrowUp")) {
        moveX += fwdX;
        moveZ += fwdZ;
      }
      if (keys.has("KeyS") || keys.has("ArrowDown")) {
        moveX -= fwdX;
        moveZ -= fwdZ;
      }
      if (keys.has("KeyA")) {
        moveX -= rightX;
        moveZ -= rightZ;
      }
      if (keys.has("KeyD")) {
        moveX += rightX;
        moveZ += rightZ;
      }
      if (keys.has("ArrowLeft") || keys.has("KeyQ")) turnDelta -= TURN_SPEED * dt;
      if (keys.has("ArrowRight") || keys.has("KeyE")) turnDelta += TURN_SPEED * dt;

      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (len > 0) {
        moveX = (moveX / len) * MOVE_SPEED * dt;
        moveZ = (moveZ / len) * MOVE_SPEED * dt;
      }

      if (moveX !== 0 || moveZ !== 0 || turnDelta !== 0) {
        const { x: nx, z: nz } = tryMove(x, z, moveX, moveZ, solid, width, height);
        const newState = { x: nx, z: nz, yaw: yaw + turnDelta };
        cameraRef.current = newState;
        setCamera(newState);
      }
    };

    lastTickRef.current = performance.now();
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [width, height]);

  return { camera, containerRef };
}
