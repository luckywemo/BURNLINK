"use client";

import { useEffect, useState } from "react";
import { arkivPublic } from "@/lib/arkiv-public";
import { RELAY_ADDRESS } from "@/lib/tokens";

// Live on-chain stat: how many entities the relay has ever created on
// Tiramisu. The nonce never decreases — burned notes still count, which is
// exactly the "sealed" number we want to show.
export default function SealedCount() {
  const [n, setN] = useState<bigint | null>(null);

  useEffect(() => {
    let live = true;
    arkivPublic
      .getEntityNonce(RELAY_ADDRESS)
      .then((v) => {
        if (live) setN(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (n === null) return null;

  return (
    <span className="font-mono text-primary">{n.toString()} sealed on-chain</span>
  );
}
