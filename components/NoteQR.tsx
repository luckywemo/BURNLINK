"use client";

import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

// QR of the full burn link — generated locally, so the secret in the URL
// fragment never leaves the browser (no third-party QR API).
export default function NoteQR({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    toDataURL(value, {
      margin: 1,
      width: 160,
      color: { dark: "#e8e4e0", light: "#00000000" },
    })
      .then((u) => {
        if (live) setSrc(u);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [value]);

  if (!src) return <div className="h-[160px] w-[160px] rounded-lg bg-card" />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={160}
      height={160}
      alt="QR code containing the burn link"
      className="rounded-lg border border-border bg-card/60 p-1"
    />
  );
}
