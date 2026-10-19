"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

// Dot-matrix reveal — a field of ember dots blooms outward from the hero
// center on mount, then settles to a faint texture. The reveal is the
// "decrypt" metaphor at page scale: structure emerging from noise.
export default function CanvasReveal() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = canvas.parentElement!;
    const resize = () => {
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const W = () => canvas.width;
    const H = () => canvas.height;
    const cx = () => W() / 2;
    const cy = () => H() * 0.28;
    const GAP = 18 * dpr;
    const R = 1.1 * dpr;

    // deterministic pseudo-random per dot
    const rand = (x: number, y: number) => {
      const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return s - Math.floor(s);
    };

    const draw = (radius: number) => {
      ctx.clearRect(0, 0, W(), H());
      for (let x = GAP / 2; x < W(); x += GAP) {
        for (let y = GAP / 2; y < H(); y += GAP) {
          const d = Math.hypot(x - cx(), y - cy());
          const jitter = rand(x, y) * 60 * dpr;
          const on = d < radius - jitter;
          if (!on) continue;
          const edge = Math.max(0, 1 - Math.abs(d - radius + jitter) / (40 * dpr));
          const a = 0.05 + rand(y, x) * 0.1 + edge * 0.35;
          ctx.fillStyle = `rgba(251,146,60,${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, R + edge * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    let raf = 0;
    if (reduced) {
      draw(Math.hypot(W(), H()));
      return () => ro.disconnect();
    }
    const start = performance.now();
    const DUR = 1600;
    const maxR = Math.hypot(W(), H()) * 0.9;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      draw(eased * maxR);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduced]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
    />
  );
}
