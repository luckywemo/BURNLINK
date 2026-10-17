import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { arkivPublic } from "@/lib/arkiv-public";
import { getRelayClient } from "@/lib/arkiv-relay";

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> }
) {
  const { key } = await ctx.params;
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  let b = "";
  try {
    b = (await req.json())?.b ?? "";
  } catch {
    /* no body — treated as missing token */
  }

  // Burn capability check. Entity keys are enumerable (anyone can list the
  // relay's entities), so deletion requires the token whose SHA-256 is stored
  // inside the payload — present only in the link fragment, never on-chain.
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
    return NextResponse.json({ burned: true }, { status: 410 });
  }

  try {
    const client = getRelayClient();
    const { txHash } = await client.deleteEntity({
      entityKey: key as `0x${string}`,
    });
    return NextResponse.json({ txHash });
  } catch {
    return NextResponse.json({ burned: true }, { status: 410 });
  }
}
