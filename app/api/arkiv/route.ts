import { NextRequest, NextResponse } from "next/server";

// JSON-RPC proxy: browsers never see the Arkiv access key. Every read
// (arkiv_query, getEntity, balances, block timing) and every client-signed
// write (session-wallet createEntity, sweeps) flows through here; the server
// appends ARKIV_API_KEY to the RPC path, raising the query quota. Without a
// key it forwards to the anonymous endpoint — same behavior as before, just
// rate-limited by Arkiv.
const RPC_BASE = (
  process.env.NEXT_PUBLIC_ARKIV_RPC ??
  "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
).replace(/\/$/, "");

// Light per-IP throttle so strangers can't drain our quota through this
// endpoint. A busy real user polls ~10 req/min; E2E bursts stay far under 600.
const PER_IP_PER_MIN = 600;
const MIN = 60_000;
const ipWindows = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const fresh = (ipWindows.get(ip) ?? []).filter((t) => now - t < MIN);
  fresh.push(now);
  ipWindows.set(ip, fresh);
  if (fresh.length > PER_IP_PER_MIN) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const body = await req.text();
  const key = process.env.ARKIV_API_KEY;
  const target = key ? `${RPC_BASE}/${key}` : RPC_BASE;
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "rpc unreachable" }, { status: 502 });
  }
}
