import { NextRequest, NextResponse } from "next/server";
import { parseEther } from "viem";
import { getRelayClient } from "@/lib/arkiv-relay";
import { arkivPublic } from "@/lib/arkiv-public";

// Funds one ephemeral session wallet with just enough GLM to sign a few
// entity writes. This is a gas drip, not a faucet — strictly rate-limited.
const DUST = parseEther("0.005");
// Below this the vault keeps what it has — clients fall back to relay-signing
// and nothing user-facing breaks.
const RESERVE = parseEther("0.2");
const PER_IP_PER_HOUR = 3;
const GLOBAL_PER_HOUR = 60;

const fundedAddresses = new Map<string, number>();
const ipWindows = new Map<string, number[]>();
let globalWindow: number[] = [];

const HOUR = 3_600_000;
const GC_AFTER = 512;

function allow(bucket: number[], now: number, max: number) {
  const fresh = bucket.filter((t) => now - t < HOUR);
  fresh.push(now);
  return { ok: fresh.length <= max, next: fresh };
}

export async function POST(req: NextRequest) {
  let address = "";
  try {
    address = (await req.json())?.address ?? "";
  } catch {
    /* fall through to validation */
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const key = address.toLowerCase();
  const now = Date.now();
  if (fundedAddresses.has(key)) {
    // idempotent — the client may re-request; answer without paying twice
    return NextResponse.json({ funded: true, dedupe: true });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipRes = allow(ipWindows.get(ip) ?? [], now, PER_IP_PER_HOUR);
  ipWindows.set(ip, ipRes.next);
  const gRes = allow(globalWindow, now, GLOBAL_PER_HOUR);
  globalWindow = gRes.next;
  if (!ipRes.ok || !gRes.ok) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  if (fundedAddresses.size > GC_AFTER) fundedAddresses.clear();
  fundedAddresses.set(key, now);

  try {
    const client = getRelayClient();
    const vault = await arkivPublic.getBalance({
      address: client.account.address,
    });
    if (vault < RESERVE) {
      return NextResponse.json({ error: "vault reserve" }, { status: 503 });
    }
    const txHash = await client.sendTransaction({
      to: address as `0x${string}`,
      value: DUST,
    });
    await client.waitForTransactionReceipt({ hash: txHash });
    return NextResponse.json({ funded: true, txHash });
  } catch {
    return NextResponse.json({ error: "funding failed" }, { status: 502 });
  }
}
