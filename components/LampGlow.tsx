"use client";

// Lamp effect — a cone of ember light falling from the top edge onto the
// hero. Pure CSS: two mirrored conic wings + a hot filament line. Motion
// is a single slow scale breathing on the cone; reduced-motion holds it
// static.
export default function LampGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[420px] select-none overflow-hidden">
      {/* filament line */}
      <div className="animate-lamp-line absolute left-1/2 top-0 h-px w-[min(560px,80vw)] -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/80 to-transparent" />
      {/* light cone */}
      <div
        className="animate-lamp-breathe absolute left-1/2 top-0 h-full w-[min(700px,90vw)] -translate-x-1/2"
        style={{
          background:
            "conic-gradient(from 90deg at 50% 0%, transparent 78deg, rgba(249,115,22,0.10) 86deg, rgba(251,146,60,0.16) 90deg, rgba(249,115,22,0.10) 94deg, transparent 102deg)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 55%, transparent 100%)",
        }}
      />
      {/* hot center */}
      <div className="absolute left-1/2 top-0 h-[2px] w-40 -translate-x-1/2 bg-primary/70 blur-[6px]" />
    </div>
  );
}
