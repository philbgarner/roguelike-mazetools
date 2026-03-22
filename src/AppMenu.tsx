import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import s from "./styles/AppMenu.module.css";

interface MenuItem {
  label: string;
  subtitle: string;
  description: string;
  path: string;
  icon: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: "Cave",
    subtitle: "First-Person Viewer",
    description:
      "Eye-of-the-Beholder-style first-person dungeon exploration. Navigate procedurally generated caves rendered in classic 3-D perspective.",
    path: "/cave",
    icon: "⛏",
  },
  {
    label: "EotB",
    subtitle: "Eye of the Beholder",
    description:
      "Grid-locked first-person dungeon movement with lerp animation. Step, strafe, and rotate through torch-lit corridors.",
    path: "/eotb",
    icon: "👁",
  },
  {
    label: "Hidden",
    subtitle: "Secret Passages",
    description:
      "Discover hidden wall tunnels connecting distant rooms. Unlock passages with E when standing at a cyan wall, then walk into it to traverse.",
    path: "/hidden",
    icon: "🔍",
  },
  {
    label: "Mobs",
    subtitle: "Turn-Based Combat",
    description:
      "Turn-based dungeon with 3-D first-person view and billboard monsters. Fight your way through enemies using the scheduler-driven combat system.",
    path: "/mobs",
    icon: "⚔",
  },
  {
    label: "Objects",
    subtitle: "Interactive Objects",
    description:
      "Dungeon filled with interactive objects — chests, levers, doors, and spawning mechanics. Demonstrates the object interaction layer.",
    path: "/objects",
    icon: "📦",
  },
  {
    label: "Targeting",
    subtitle: "AoE Spell System",
    description:
      "Turn-based dungeon with area-of-effect spell targeting. Aim projectiles, select blast radii, and watch monsters react.",
    path: "/targeting",
    icon: "🎯",
  },
];

export default function AppMenu() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const animRef = useRef<number>(0);
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  // Animated background on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let t = 0;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      ctx.clearRect(0, 0, w, h);

      // Dark base
      ctx.fillStyle = "#07090f";
      ctx.fillRect(0, 0, w, h);

      // Layered radial glows that follow mouse with parallax
      const glows = [
        { ox: 0.3, oy: 0.25, r: 0.55, color: "rgba(20,55,110,0.55)",  parallax: 0.12 },
        { ox: 0.7, oy: 0.6,  r: 0.5,  color: "rgba(15,80,130,0.45)",  parallax: 0.08 },
        { ox: 0.5, oy: 0.5,  r: 0.35, color: "rgba(40,80,120,0.3)",   parallax: 0.05 },
        { ox: 0.2, oy: 0.8,  r: 0.4,  color: "rgba(60,80,80,0.28)",   parallax: 0.1  },
      ];

      for (const g of glows) {
        const cx = (g.ox + (mx - 0.5) * g.parallax) * w;
        const cy = (g.oy + (my - 0.5) * g.parallax) * h;
        const radius = g.r * Math.max(w, h);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, g.color);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Animated shimmer lines
      ctx.save();
      ctx.globalAlpha = 0.04;
      const lineCount = 18;
      for (let i = 0; i < lineCount; i++) {
        const y = ((i / lineCount + t * 0.00015) % 1) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.strokeStyle = "rgba(140,180,220,1)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // Soft vignette
      const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.85);
      vig.addColorStop(0, "transparent");
      vig.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      t++;
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        setSelected((prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        setSelected((prev) => (prev + 1) % MENU_ITEMS.length);
      } else if (e.key === "Enter" || e.key === " ") {
        navigate(MENU_ITEMS[selected].path);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, navigate]);

  const activeIndex = hovered !== null ? hovered : selected;
  const activeItem = MENU_ITEMS[activeIndex];

  return (
    <div className={s.root}>
      <canvas ref={canvasRef} className={s.canvas} />

      <div className={s.layout}>
        {/* Left panel — title + menu list */}
        <div className={s.leftPanel}>
          <div className={s.titleBlock}>
            <div className={s.titleEyebrow}>mazegen</div>
            <div className={s.titleMain}>Examples</div>
          </div>

          <div className={s.menuList}>
            {MENU_ITEMS.map((item, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={item.path}
                  className={`${s.menuItem}${isActive ? ` ${s.active}` : ""}`}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => navigate(item.path)}
                >
                  <span className={s.menuItemIcon}>{item.icon}</span>
                  <span className={s.menuItemText}>
                    <span className={s.menuItemLabel}>{item.label}</span>
                    <span className={s.menuItemSub}>{item.subtitle}</span>
                  </span>
                  {isActive && <span className={s.menuItemArrow}>▶</span>}
                </button>
              );
            })}
          </div>

          <div className={s.hint}>↑↓ / W S · Enter to launch</div>
        </div>

        {/* Right panel — description card */}
        <div className={s.rightPanel}>
          <div className={s.descCard}>
            <div className={s.descIcon}>{activeItem.icon}</div>
            <div className={s.descTitle}>{activeItem.label}</div>
            <div className={s.descSubtitle}>{activeItem.subtitle}</div>
            <div className={s.descDivider} />
            <div className={s.descBody}>{activeItem.description}</div>
            <button className={s.launchBtn} onClick={() => navigate(activeItem.path)}>
              Launch →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
