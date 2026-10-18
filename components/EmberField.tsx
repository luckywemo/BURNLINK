"use client";

import { useEffect, useRef } from "react";

// Ambient ember particles on a fixed canvas. Dispatch
// `window.dispatchEvent(new Event("burnlink:burst"))` for a burst.
type P = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
};

export default function EmberField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;
    const size = () => {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    const parts: P[] = [];
    const spawn = (n: number, burst = false) => {
      for (let i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * w,
          y: burst ? h * 0.55 + Math.random() * h * 0.45 : h + 10,
          r: burst ? 1 + Math.random() * 2.4 : 0.5 + Math.random() * 1.3,
          vx: (Math.random() - 0.5) * (burst ? 2.6 : 0.4),
          vy: -(0.25 + Math.random() * (burst ? 2.4 : 0.7)),
          life: 0,
          max: 140 + Math.random() * 200,
          hue: 18 + Math.random() * 26,
        });
      }
    };
    spawn(50);

    if (reduced) {
      // static embers — one painted frame, no animation loop
      for (const p of parts) {
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue},95%,55%,${0.2 + Math.random() * 0.5})`;
        ctx.arc(p.x, Math.random() * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    const onBurst = () => spawn(160, true);
    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      size();
    };
    window.addEventListener("burnlink:burst", onBurst);
    window.addEventListener("resize", onResize);

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      if (parts.length < 55 && Math.random() < 0.35) spawn(1);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life++;
        p.x += p.vx + Math.sin((p.life + p.max) / 22) * 0.35;
        p.y += p.vy;
        const t = p.life / p.max;
        const a = (t < 0.15 ? t / 0.15 : 1 - t) * (0.55 + Math.random() * 0.45);
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue},95%,${52 + Math.random() * 18}%,${Math.max(0, a * 0.85)})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        if (t >= 1 || p.y < -12) parts.splice(i, 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("burnlink:burst", onBurst);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden
    />
  );
}
