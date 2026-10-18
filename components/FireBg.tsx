"use client";

import { useEffect, useRef } from "react";

// Fire background. Under prefers-reduced-motion we pause on an early frame
// so the texture stays — motion stops, the look survives.
export default function FireBg() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const freeze = () => {
        v.pause();
        try {
          v.currentTime = 1.2;
        } catch {
          /* seek unsupported — first frame is fine */
        }
      };
      if (v.readyState >= 1) freeze();
      else v.addEventListener("loadedmetadata", freeze, { once: true });
    }
  }, []);

  return (
    <video
      ref={ref}
      className="fire-bg h-full w-full object-cover opacity-40"
      src="/fire-bg.mp4"
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
    />
  );
}
