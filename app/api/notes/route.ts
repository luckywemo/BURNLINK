import { NextRequest, NextResponse } from "next/server";
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk";
import { i32 } from "@arkiv-network/sdk/attr";
import { getRelayClient } from "@/lib/arkiv-relay";

// Allowed lifetime range, in seconds. The note's Arkiv entity is created with
// this exact Entity Expiration — deletion is enforced by the protocol, not us.
const MIN_TTL = 15;
const MAX_TTL = 2_592_000; // 30 days

// Payload must stay well under Arkiv's 128 KiB cap once JSON-wrapped.
const MAX_CT_B64 = 80_000;

export async function POST(req: NextRequest) {
  let body: {
    iv?: string;
    ct?: string;
    ttl?: number;
    once?: boolean;
    bh?: string;
    pw?: boolean;
    replyTo?: string;
    replies?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const { iv, ct, ttl, once, bh, pw, replyTo, replies } = body;
  const isReply = typeof replyTo === "string" && /^0x[0-9a-f]{64}$/i.test(replyTo);
  if (replyTo !== undefined && !isReply) {
    return NextResponse.json({ error: "invalid reply target" }, { status: 400 });
  }
  if (
    typeof iv !== "string" ||
    typeof ct !== "string" ||
    !iv ||
    !ct ||
    ct.length > MAX_CT_B64 ||
    typeof ttl !== "number" ||
    !Number.isInteger(ttl) ||
    ttl < MIN_TTL ||
    ttl > MAX_TTL ||
    (once && (typeof bh !== "string" || bh.length > 64))
  ) {
    return NextResponse.json({ error: "invalid note" }, { status: 400 });
  }

  const client = getRelayClient();
  const { entityKey, txHash, expiresAt } = await client.createEntity({
    payload: jsonToPayload({ v: 1, iv, ct, ...(bh ? { bh } : {}) }),
    contentType: "application/json",
    attributes: isReply
      ? {
          type: "burnlink-reply",
          v: i32(1),
          mode: "timed",
          replyto: replyTo,
        }
      : {
          type: "burnlink",
          v: i32(1),
          mode: once ? "once" : "timed",
          // passphrase-gated notes get a public flag so the read page knows to
          // prompt — the passphrase itself never leaves the browser
          ...(pw ? { pw: i32(1) } : {}),
          // sender opted in to replies — the read page offers a reply box
          ...(replies ? { replies: i32(1) } : {}),
        },
    expires: ExpirationTime.fromSeconds(ttl),
  });

  return NextResponse.json({
    key: entityKey,
    txHash,
    expiresAt: expiresAt.toString(),
  });
}
