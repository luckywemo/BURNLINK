import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// DESIGN.md §6: registerPlugin guarded — ScrollTrigger/useGSAP touch window
// at registration; top-level registration would break SSR/prerender.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export { gsap, useGSAP };
