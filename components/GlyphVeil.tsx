"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const GLYPHS = "!<>-_\\/[]{}—=+*^?#010101";

// Evervault-style glyph veil — a matrix of ciphertext characters fills the
// card; the cursor ignites the ones it passes over. The sealed link "hides
// in the noise" until you hunt for it — the product metaphor as backdrop.
export default function GlyphVeil() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement!;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cells: { ch: string; x: number; y: number; heat: number }[] = [];
    const CELL = 22 * dpr;
    const mouse = { x: -9999, y: -9999 };

    const build = () => {
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      cells = [];
      for (let x = CELL / 2; x < canvas.width; x += CELL) {
        for (let y = CELL / 2; y < canvas.height; y += CELL) {
          cells.push({
            ch: GLYPHS[(Math.random() * GLYPHS.length) | 0],
            x,
            y,
            heat: 0,
          });
        }
      }
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(parent);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) * dpr;
      mouse.y = (e.clientY - r.top) * dpr;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    parent.addEventListener("pointermove", onMove);
    parent.addEventListener("pointerleave", onLeave);

    ctx.font = `${11 * dpr}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const RAD = 90 * dpr;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const c of cells) {
        const d = Math.hypot(c.x - mouse.x, c.y - mouse.y);
        if (d < RAD) {
          c.heat = Math.min(1, c.heat + 0.25);
          if (Math.random() < 0.3)
            c.ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        } else {
          c.heat = Math.max(0, c.heat - 0.04);
          if (Math.random() < 0.002)
            c.ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        const a = 0.05 + c.heat * 0.75;
        ctx.fillStyle =
          c.heat > 0.4
            ? `rgba(251,146,60,${a.toFixed(3)})`
            : `rgba(148,120,110,${(a * 0.6).toFixed(3)})`;
        ctx.fillText(c.ch, c.x, c.y);
      }
    };

    if (reduced) {
      draw();
      return () => {
        ro.disconnect();
        parent.removeEventListener("pointermove", onMove);
        parent.removeEventListener("pointerleave", onLeave);
      };
    }
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      parent.removeEventListener("pointermove", onMove);
      parent.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
