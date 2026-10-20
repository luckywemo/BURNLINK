"use client";

import { createWalletClient } from "@arkiv-network/sdk";
import { tiramisu } from "@arkiv-network/sdk/chains";
import { http, type Account } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arkivPublic } from "@/lib/arkiv-public";
import { RELAY_ADDRESS } from "@/lib/tokens";

// Client-signed writes and balance reads go through the /api/arkiv proxy —
// the access key is appended server-side and never ships to the browser.
const RPC = "/api/arkiv";

const KEY_STORAGE = "burnlink.sw";

// A disposable signer persisted per browser (localStorage). The key never
// leaves the device, the server never sees it, and the entity ends up owned
// by a unique address — each note is provably user-signed without wallet UX.
// Gas arrives lazily from /api/fund on first composer input (intent), and any
// unused dust is swept back to the vault after a seal — net cost ≈ gas only.
// If funding fails the caller falls back to the shared relay.
interface SessionWallet {
  address: `0x${string}`;
  account: Account;
  client: ReturnType<typeof createWalletClient>;
  ensureFunded: () => Promise<boolean>;
}

let session: SessionWallet | null = null;

function loadKey(): `0x${string}` {
  try {
    const k = localStorage.getItem(KEY_STORAGE);
    if (k && /^0x[0-9a-fA-F]{64}$/.test(k)) return k as `0x${string}`;
    const fresh = generatePrivateKey();
    localStorage.setItem(KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return generatePrivateKey(); // storage unavailable — memory-only session
  }
}

export function getSessionWallet(): SessionWallet {
  if (session) return session;
  const account = privateKeyToAccount(loadKey());
  const client = createWalletClient({
    account,
    chain: tiramisu,
    transport: http(RPC),
  });
  let pending: Promise<boolean> | null = null;
  session = {
    address: account.address,
    account,
    client,
    ensureFunded() {
      // dedupe — /api/fund is itself idempotent per address
      pending ??= (async () => {
        try {
          const res = await fetch("/api/fund", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: account.address }),
          });
          return res.ok;
        } catch {
          return false;
        }
      })();
      return pending;
    },
  };
  return session;
}

// Return unused gas dust to the vault after a seal. Best-effort: runs
// post-transaction so it never delays or blocks the user-facing result.
export async function sweepSessionGas(): Promise<void> {
  if (!session) return;
  const sw = session;
  try {
    const [balance, block] = await Promise.all([
      arkivPublic.getBalance({ address: sw.address }),
      arkivPublic.getBlock({ blockTag: "latest" }),
    ]);
    const gasPrice =
      (block.baseFeePerGas ?? BigInt(1_000_000_000)) * BigInt(3); // margin
    const fee = gasPrice * BigInt(21_000);
    if (balance <= fee * BigInt(3)) return; // not worth sweeping lint
    await sw.client.sendTransaction({
      account: sw.account,
      chain: null,
      to: RELAY_ADDRESS as `0x${string}`,
      value: balance - fee,
      gas: BigInt(21_000),
      maxFeePerGas: gasPrice,
    });
  } catch {
    /* stranded dust is bounded by the drip size — never fatal */
  }
}
