"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const CHARS = "!<>-_\\/[]{}=+*^?#abcdefxyz0123456789";

// Decodes text left-to-right through random glyphs — the "decrypt" moment.
export default function ScrambleText({
  text,
  speed = 24,
  per = 3,
  className,
  onDone,
}: {
  text: string;
  speed?: number;
  per?: number;
  className?: string;
  onDone?: () => void;
}) {
  const [out, setOut] = useState("");
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    let revealed = 0;
    const id = setInterval(() => {
      revealed += per;
      if (revealed >= text.length) {
        setOut(text);
        clearInterval(id);
        onDone?.();
        return;
      }
      const tail = Array.from(
        { length: Math.min(14, text.length - revealed) },
        () => CHARS[Math.floor(Math.random() * CHARS.length)]
      ).join("");
      setOut(text.slice(0, revealed) + tail);
    }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, per, reduced]);

  return <span className={className}>{reduced ? text : out}</span>;
}
