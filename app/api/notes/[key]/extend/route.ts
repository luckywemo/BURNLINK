import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ExpirationTime } from "@arkiv-network/sdk";
import { arkivPublic } from "@/lib/arkiv-public";
import { getRelayClient } from "@/lib/arkiv-relay";

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const MAX_ADD_SECS = 2_592_000; // 30 days — same cap as note TTL

// Extend a note's Entity Expiration. Same burn-capability rule as deletion:
// the token in the URL fragment is required, so only link-holders can feed
// the fuse — strangers enumerating the relay's entities cannot.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> }
) {
  const { key } = await ctx.params;
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  let b = "";
  let addSecs = 0;
  try {
    const body = await req.json();
    b = body?.b ?? "";
    addSecs = body?.addSecs ?? 0;
  } catch {
    /* treated as invalid below */
  }
  if (!Number.isInteger(addSecs) || addSecs < 1 || addSecs > MAX_ADD_SECS) {
    return NextResponse.json({ error: "bad duration" }, { status: 400 });
  }

  try {
    const entity = await arkivPublic.getEntity(key as `0x${string}`);
    const payload = entity.toJson() as { bh?: string };
    if (payload.bh) {
      const h = createHash("sha256").update(String(b)).digest("base64");
      if (h !== payload.bh) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
  } catch {
    return NextResponse.json({ gone: true }, { status: 410 });
  }

  try {
    const client = getRelayClient();
    const { txHash, expiresAt } = await client.extendEntity({
      entityKey: key as `0x${string}`,
      expires: ExpirationTime.fromSeconds(addSecs),
    });
    return NextResponse.json({ txHash, expiresAt: expiresAt.toString() });
  } catch {
    return NextResponse.json({ error: "extend failed" }, { status: 502 });
  }
}
