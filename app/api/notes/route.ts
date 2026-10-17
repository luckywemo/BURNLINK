import { NextRequest, NextResponse } from "next/server";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk";
import { i32 } from "@arkiv-network/sdk/attr";
import { getRelayClient } from "@/lib/arkiv-relay";

// Allowed lifetimes, in seconds. The note's Arkiv entity is created with this
// exact Entity Expiration — deletion is enforced by the protocol, not by us.
const ALLOWED_TTL = new Set([30, 60, 300, 600, 3600, 86400, 604800]);

// Payload must stay well under Arkiv's 128 KiB cap once JSON-wrapped.
const MAX_CT_B64 = 80_000;

export async function POST(req: NextRequest) {
  let body: {
    iv?: string;
    ct?: string;
    ttl?: number;
    once?: boolean;
    bh?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const { iv, ct, ttl, once, bh } = body;
  if (
    typeof iv !== "string" ||
    typeof ct !== "string" ||
    !iv ||
    !ct ||
    ct.length > MAX_CT_B64 ||
    typeof ttl !== "number" ||
    !ALLOWED_TTL.has(ttl) ||
    (once && (typeof bh !== "string" || bh.length > 64))
  ) {
    return NextResponse.json({ error: "invalid note" }, { status: 400 });
  }

  const client = getRelayClient();
  const { entityKey, txHash, expiresAt } = await client.createEntity({
    payload: jsonToPayload({ v: 1, iv, ct, ...(bh ? { bh } : {}) }),
    contentType: "application/json",
    attributes: {
      type: "burnlink",
      v: i32(1),
      mode: once ? "once" : "timed",
    },
    expires: ExpirationTime.fromSeconds(ttl),
  });

  return NextResponse.json({
    key: entityKey,
    txHash,
    expiresAt: expiresAt.toString(),
  });
}
