"use client";

import { useEffect, useState } from "react";
import { arkivPublic } from "@/lib/arkiv-public";
import { str } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";

// Live on-chain stat: every *live* `type = "burnlink"` entity on Tiramisu.
// Counted by attribute rather than creator because notes are now signed by
// disposable session wallets — there is no single address to take a nonce of.
export default function SealedCount() {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const q = arkivPublic
          .select("*")
          .where(eq("type", str("burnlink")));
        let total = 0;
        for (let i = 0; i < 10; i++) {
          const page = await q.fetch();
          total += page.entities.length;
          if (!page.cursor) break;
          q.cursor(page.cursor);
        }
        if (live) setN(total);
      } catch {
        /* counter is decorative — fail quiet */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (n === null) return null;

  return <span className="font-mono text-primary">{n} live on-chain</span>;
}
