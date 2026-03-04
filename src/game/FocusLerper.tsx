import { useFrame } from "@react-three/fiber";

export function FocusLerper({
  targetRef,
  animRef,
  onUpdate,
}: {
  targetRef: React.MutableRefObject<{ x: number; y: number }>;
  animRef: React.MutableRefObject<{ x: number; y: number }>;
  onUpdate: (x: number, y: number) => void;
}) {
  useFrame(() => {
    const LERP = 0.1;
    const anim = animRef.current;
    const target = targetRef.current;
    const dx = target.x - anim.x;
    const dy = target.y - anim.y;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) return;
    anim.x += dx * LERP;
    anim.y += dy * LERP;
    onUpdate(anim.x, anim.y);
  });
  return null;
}
